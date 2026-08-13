import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/serverSupabase';
import { OpenAiProvider } from '../../../lib/ai/providers/openai';
import type {
  AiErrorResponseBody,
  AiTranslateRequestBody,
  AiTranslateResponseBody,
  AiSuggestedTranslation,
  AiTranslationFailure,
} from '../../../lib/ai/types';
import { validateSamePlaceholders } from '../../../lib/ai/placeholders';
import { AiProviderError, publicErrorStatus, toAiProviderError, type AiErrorCode } from '../../../lib/ai/errors';
import { logAi } from '../../../lib/ai/logging';
import { releaseAiTranslationUsage, reserveAiTranslationUsage } from '../../../lib/ai/usageLimits';
import {
  AI_MAX_ENTRIES_PER_REQUEST,
  AI_MAX_ENTRY_CHARACTERS,
  AI_MAX_GLOSSARY_TERM_CHARACTERS,
  AI_MAX_GLOSSARY_TERMS,
  AI_MAX_KEY_CHARACTERS,
  AI_MAX_LANGUAGE_CODE_CHARACTERS,
  AI_MAX_REQUEST_BYTES,
  AI_MAX_TARGET_LANGUAGES_PER_REQUEST,
  AI_MAX_TOTAL_SOURCE_CHARACTERS,
} from '../../../lib/ai/limits';

type MembershipRecord = {
  role?: string | null;
  view_languages?: unknown;
  edit_languages?: unknown;
};

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

function defaultErrorCode(status: number): AiErrorCode {
  if (status === 400 || status === 413) return 'invalid_request';
  if (status === 401) return 'authentication_required';
  if (status === 403) return 'permission_denied';
  return 'internal_error';
}

function errorResponse(message: string, status: number, requestId = 'unavailable') {
  const body: AiErrorResponseBody = {
    error: {
      code: defaultErrorCode(status),
      message,
      requestId,
      retryable: false,
    },
  };
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function providerErrorResponse(error: AiProviderError, requestId: string) {
  const body: AiErrorResponseBody = {
    error: {
      code: error.code,
      message: error.message,
      requestId,
      retryable: error.retryable,
      retryAfterSeconds: error.retryAfterSeconds,
    },
  };
  const headers = error.retryAfterSeconds !== undefined
    ? { ...NO_STORE_HEADERS, 'Retry-After': String(error.retryAfterSeconds) }
    : NO_STORE_HEADERS;
  return NextResponse.json(body, { status: publicErrorStatus(error.code), headers });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeLanguageCode(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePermissionLanguages(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set();
  return new Set(
    value
      .filter((code): code is string => typeof code === 'string')
      .map(normalizeLanguageCode)
      .filter(Boolean)
  );
}

export async function POST(req: NextRequest) {
  const reqId = `api-${crypto.randomUUID()}`;
  const respondError = (message: string, status: number) => errorResponse(message, status, reqId);
  let releaseUsageLease: (() => Promise<void>) | null = null;

  if (process.env.AI_TRANSLATION_ENABLED === 'false') {
    return providerErrorResponse(
      new AiProviderError('ai_disabled', 'AI translation is temporarily unavailable.'),
      reqId
    );
  }

  const contentLength = Number(req.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > AI_MAX_REQUEST_BYTES) {
    return respondError('Request body is too large.', 413);
  }

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return respondError('Missing bearer token.', 401);
  }

  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) {
    return respondError('Missing bearer token.', 401);
  }

  try {
    const supabaseAdmin = getSupabaseAdminClient();
    const { data: authUser, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    if (authError || !authUser?.user) {
      return respondError('Invalid or expired session.', 401);
    }

    let rawBody: string;
    try {
      rawBody = await req.text();
    } catch {
      return respondError('Invalid request body.', 400);
    }

    if (new TextEncoder().encode(rawBody).byteLength > AI_MAX_REQUEST_BYTES) {
      return respondError('Request body is too large.', 413);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return respondError('Invalid JSON payload.', 400);
    }

    if (!isRecord(payload)) {
      return respondError('Invalid request payload.', 400);
    }

    const projectId = typeof payload.projectId === 'string' ? payload.projectId.trim() : '';
    const sourceLanguage = typeof payload.sourceLanguage === 'string'
      ? normalizeLanguageCode(payload.sourceLanguage)
      : '';

    if (!projectId || !sourceLanguage || sourceLanguage.length > AI_MAX_LANGUAGE_CODE_CHARACTERS) {
      return respondError('A valid projectId and sourceLanguage are required.', 400);
    }

    if (
      !Array.isArray(payload.targetLanguages) ||
      payload.targetLanguages.length === 0 ||
      payload.targetLanguages.length > AI_MAX_TARGET_LANGUAGES_PER_REQUEST ||
      payload.targetLanguages.some((code) =>
        typeof code !== 'string' ||
        !code.trim() ||
        code.trim().length > AI_MAX_LANGUAGE_CODE_CHARACTERS
      )
    ) {
      return respondError(`Provide 1-${AI_MAX_TARGET_LANGUAGES_PER_REQUEST} valid target languages.`, 400);
    }

    const targetLanguages = payload.targetLanguages.map((code) => normalizeLanguageCode(code as string));
    if (new Set(targetLanguages).size !== targetLanguages.length || targetLanguages.includes(sourceLanguage)) {
      return respondError('Target languages must be unique and different from the source language.', 400);
    }

    if (
      !Array.isArray(payload.entries) ||
      payload.entries.length === 0 ||
      payload.entries.length > AI_MAX_ENTRIES_PER_REQUEST
    ) {
      return respondError(`Provide 1-${AI_MAX_ENTRIES_PER_REQUEST} translation entries.`, 400);
    }

    let totalSourceCharacters = 0;
    for (const entry of payload.entries) {
      if (!isRecord(entry) || typeof entry.key !== 'string' || typeof entry.text !== 'string') {
        return respondError('Every entry must contain string key and text values.', 400);
      }
      if (!entry.key.trim() || entry.key.length > AI_MAX_KEY_CHARACTERS) {
        return respondError(`Entry keys must be 1-${AI_MAX_KEY_CHARACTERS} characters.`, 400);
      }
      if (!entry.text || entry.text.length > AI_MAX_ENTRY_CHARACTERS) {
        return respondError(`Entry text must be 1-${AI_MAX_ENTRY_CHARACTERS} characters.`, 400);
      }
      totalSourceCharacters += entry.text.length;
    }

    if (totalSourceCharacters > AI_MAX_TOTAL_SOURCE_CHARACTERS) {
      return respondError(`Source text exceeds ${AI_MAX_TOTAL_SOURCE_CHARACTERS} total characters.`, 400);
    }

    if (payload.options !== undefined && !isRecord(payload.options)) {
      return respondError('Invalid translation options.', 400);
    }

    const rawGlossary = isRecord(payload.options) ? payload.options.glossary : undefined;
    if (rawGlossary !== undefined) {
      if (!Array.isArray(rawGlossary) || rawGlossary.length > AI_MAX_GLOSSARY_TERMS) {
        return respondError(`Glossary cannot exceed ${AI_MAX_GLOSSARY_TERMS} terms.`, 400);
      }
      for (const term of rawGlossary) {
        if (
          !isRecord(term) ||
          typeof term.source !== 'string' ||
          typeof term.target !== 'string' ||
          !term.source.trim() ||
          !term.target.trim() ||
          term.source.length > AI_MAX_GLOSSARY_TERM_CHARACTERS ||
          term.target.length > AI_MAX_GLOSSARY_TERM_CHARACTERS
        ) {
          return respondError('Glossary terms must contain valid source and target strings.', 400);
        }
      }
    }

    const body = payload as unknown as AiTranslateRequestBody;
    const entries = body.entries;
    const options = body.options;

    const [{ data: adminMatch, error: adminError }, { data: membershipData, error: membershipError }] = await Promise.all([
      supabaseAdmin
        .from('platform_admins')
        .select('user_id')
        .eq('user_id', authUser.user.id)
        .maybeSingle(),
      supabaseAdmin
        .from('project_members')
        .select('role, view_languages, edit_languages')
        .eq('project_id', projectId)
        .eq('user_id', authUser.user.id)
        .maybeSingle(),
    ]);

    if (adminError || membershipError) {
      return respondError('Failed to verify project access.', 500);
    }

    const isPlatformAdmin = Boolean(adminMatch);
    const membership = membershipData as MembershipRecord | null;
    if (!isPlatformAdmin && !membership) {
      return respondError('Insufficient permissions.', 403);
    }

    if (!isPlatformAdmin && membership?.role !== 'owner') {
      if (membership?.role !== 'member') {
        return respondError('Insufficient permissions.', 403);
      }
      const viewLanguages = normalizePermissionLanguages(membership.view_languages);
      const editLanguages = normalizePermissionLanguages(membership.edit_languages);
      if (!viewLanguages.has(sourceLanguage) || targetLanguages.some((code) => !editLanguages.has(code))) {
        return respondError('Insufficient language permissions.', 403);
      }
    }

    const requestedLanguages = [sourceLanguage, ...targetLanguages];
    const { data: projectLanguages, error: projectLanguagesError } = await supabaseAdmin
      .from('project_languages')
      .select('language_code')
      .eq('project_id', projectId)
      .eq('is_active', true)
      .in('language_code', requestedLanguages);

    if (projectLanguagesError) {
      return respondError('Failed to verify project languages.', 500);
    }

    const activeLanguages = new Set(
      (projectLanguages ?? []).map((row) => normalizeLanguageCode(row.language_code ?? ''))
    );
    if (requestedLanguages.some((code) => !activeLanguages.has(code))) {
      return respondError('One or more languages are not active in this project.', 400);
    }

    const startedAt = Date.now();
    const workUnits = totalSourceCharacters * targetLanguages.length;
    logAi('info', 'request_started', {
      request_id: reqId,
      user_id: authUser.user.id,
      project_id: projectId,
      source_language: sourceLanguage,
      target_count: targetLanguages.length,
      entry_count: entries.length,
      source_characters: totalSourceCharacters,
      work_units: workUnits,
    });

    const usageLeaseAcquired = await reserveAiTranslationUsage({
      supabaseAdmin,
      requestId: reqId,
      userId: authUser.user.id,
      projectId,
      workUnits,
    });
    if (usageLeaseAcquired) {
      releaseUsageLease = () => releaseAiTranslationUsage(supabaseAdmin, reqId);
    }

    const provider = new OpenAiProvider(process.env.OPENAI_MODEL || 'gpt-5.6-luna');
    const translations: AiTranslateResponseBody['translations'] = {};
    const failures: AiTranslationFailure[] = [];
    let firstProviderError: AiProviderError | null = null;
    let stopProviderCalls = false;
    let successCount = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;

    const configuredBatchSize = Number(process.env.AI_BATCH_SIZE || 20);
    const configuredGroupSize = Number(process.env.AI_GROUP_SIZE || 20);
    const batchSize = Math.min(
      Number.isInteger(configuredBatchSize) && configuredBatchSize > 0 ? configuredBatchSize : 20,
      Number.isInteger(configuredGroupSize) && configuredGroupSize > 0 ? configuredGroupSize : 20,
      AI_MAX_ENTRIES_PER_REQUEST
    );

    for (const lang of targetLanguages) {
      const suggestions: AiSuggestedTranslation[] = [];
      for (let start = 0; start < entries.length; start += batchSize) {
        const slice = entries.slice(start, start + batchSize);
        if (stopProviderCalls && firstProviderError) {
          failures.push({
            targetLanguage: lang,
            keys: slice.map(entry => entry.key),
            code: firstProviderError.code,
            message: firstProviderError.message,
            retryable: firstProviderError.retryable,
          });
          continue;
        }

        try {
          const result = await provider.translateBatch({
            sourceLanguage,
            targetLanguage: lang,
            inputs: slice.map(entry => entry.text),
            glossary: options?.glossary,
            abortSignal: req.signal,
          });
          inputTokens += result.usage.inputTokens;
          outputTokens += result.usage.outputTokens;
          totalTokens += result.usage.totalTokens;

          slice.forEach((entry, index) => {
            const aiText = result.outputs[index];
            const placeholderCheck = validateSamePlaceholders(entry.text, aiText);
            suggestions.push({
              key: entry.key,
              text: entry.text,
              aiText,
              changed: true,
              error: placeholderCheck.ok
                ? undefined
                : `Placeholder mismatch: missing ${placeholderCheck.missing.join(', ')} extra ${placeholderCheck.extra.join(', ')}`,
            });
            successCount += 1;
          });
        } catch (error: unknown) {
          const providerError = toAiProviderError(error);
          firstProviderError ??= providerError;
          failures.push({
            targetLanguage: lang,
            keys: slice.map(entry => entry.key),
            code: providerError.code,
            message: providerError.message,
            retryable: providerError.retryable,
          });
          stopProviderCalls = providerError.code !== 'provider_malformed_output';
        }
      }
      if (suggestions.length > 0) translations[lang] = suggestions;
    }

    logAi(failures.length > 0 ? 'warn' : 'info', 'request_completed', {
      request_id: reqId,
      model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
      duration_ms: Date.now() - startedAt,
      success_count: successCount,
      failure_count: failures.reduce((count, failure) => count + failure.keys.length, 0),
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      partial: successCount > 0 && failures.length > 0,
    });

    if (successCount === 0 && firstProviderError) {
      return providerErrorResponse(firstProviderError, reqId);
    }

    const response: AiTranslateResponseBody = { requestId: reqId, translations, failures };
    return NextResponse.json(response, { headers: NO_STORE_HEADERS });
  } catch (err: unknown) {
    const error = err instanceof AiProviderError ? err : null;
    logAi('error', 'request_failed', {
      request_id: reqId,
      error_code: error?.code || 'internal_error',
      retryable: error?.retryable ?? false,
    });
    if (error) return providerErrorResponse(error, reqId);
    return errorResponse('AI translation failed.', 500, reqId);
  } finally {
    await releaseUsageLease?.();
  }
}

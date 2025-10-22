import { NextRequest, NextResponse } from 'next/server';
import { OpenAiProvider } from '../../../lib/ai/providers/openai';
import type { AiTranslateRequestBody, AiTranslateResponseBody, AiSuggestedTranslation } from '../../../lib/ai/types';
import { validateSamePlaceholders } from '../../../lib/ai/placeholders';

// Simple per-process limiter (coarse). For production, use durable storage or provider limits.
let inFlight = 0;
const MAX_IN_FLIGHT = 3;

export async function POST(req: NextRequest) {
  const reqId = `api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (inFlight >= MAX_IN_FLIGHT) {
    console.warn(`[AI][${reqId}] rate_limited inFlight=${inFlight}`);
    return NextResponse.json({ error: 'Rate limit: too many concurrent requests' }, { status: 429 });
  }
  inFlight++;
  try {
    const body = (await req.json()) as AiTranslateRequestBody;
    const { sourceLanguage, targetLanguages, entries, options } = body;
    console.log(`[AI][${reqId}] request source=${sourceLanguage} targets=${targetLanguages?.length || 0} entries=${entries?.length || 0}`);
    if (!sourceLanguage || !Array.isArray(targetLanguages) || targetLanguages.length === 0) {
      return NextResponse.json({ error: 'Missing sourceLanguage or targetLanguages' }, { status: 400 });
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: 'No entries provided' }, { status: 400 });
    }

    // TODO: authenticate request once Auth is enabled. For now, allow.

    const provider = new OpenAiProvider(process.env.OPENAI_MODEL || 'gpt-5-mini');
    const translations: AiTranslateResponseBody['translations'] = {};

    // Batch inputs to keep prompt sizes reasonable
    const BATCH_SIZE = Number(process.env.AI_BATCH_SIZE || 50);
    const allTexts = entries.map((e) => e.text);
    for (const lang of targetLanguages) {
      console.log(`[AI][${reqId}] target=${lang} batching size=${BATCH_SIZE}`);
      const outputs: string[] = [];
      for (let i = 0; i < allTexts.length; i += BATCH_SIZE) {
        const slice = allTexts.slice(i, i + BATCH_SIZE);
        console.log(`[AI][${reqId}] target=${lang} batch from=${i} count=${slice.length}`);
        const result = await provider.translateBatch({
          sourceLanguage,
          targetLanguage: lang,
          inputs: slice,
          glossary: options?.glossary,
          // NOTE: we cannot forward client abort to server reliably here.
          // Batches are small and provider has internal timeout/retry.
        });
        outputs.push(...result.outputs);
      }

      const list: AiSuggestedTranslation[] = entries.map((e, idx) => {
        const ai = outputs[idx] ?? '';
        const placeholderCheck = validateSamePlaceholders(e.text, ai);
        if (!placeholderCheck.ok) {
          return {
            key: e.key,
            text: e.text,
            aiText: ai,
            changed: true,
            error: `Placeholder mismatch: missing ${placeholderCheck.missing.join(', ')} extra ${placeholderCheck.extra.join(', ')}`,
          };
        }
        return { key: e.key, text: e.text, aiText: ai, changed: true };
      });
      translations[lang] = list;
    }

    const resp: AiTranslateResponseBody = { translations };
    console.log(`[AI][${reqId}] success langs=${Object.keys(translations).length}`);
    return NextResponse.json(resp);
  } catch (err: unknown) {
    console.error(`[AI][${reqId}] error`, err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    inFlight--;
  }
}


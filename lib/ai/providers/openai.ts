import type { AiGlossaryTerm, AiProvider } from '../types';
import { protectPlaceholders, restorePlaceholders } from '../placeholders';

// Minimal OpenAI-compatible client using fetch; avoids adding new deps

const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.GPT_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } | null }>;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function buildSystemPrompt(targetLang: string, glossary?: AiGlossaryTerm[]): string {
  const glossaryLines = (glossary && glossary.length > 0)
    ? `\nGlossary (authoritative, never deviate):\n${glossary.map(t => `${t.source} => ${t.target}`).join('\n')}`
    : '';
  return [
    `You are a professional translator. Translate the user's text into ${targetLang}.`,
    'Requirements:',
    '- Preserve placeholders exactly (e.g., {name}, %s, ICU plural/select blocks).',
    '- Do not add or remove placeholders.',
    '- Maintain tone and punctuation. Keep short, natural strings for UI.',
    glossaryLines,
  ].join('\n');
}

const TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 45000);
const MAX_RETRIES = Number(process.env.AI_MAX_RETRIES || 2);

function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)); }

async function callOpenAI(
  messages: Array<{ role: 'system'|'user'; content: string }>,
  model: string,
  reqId: string,
  idx: number,
  verbose: boolean,
): Promise<string> {
  let attempt = 0;
  let lastErr: unknown;
  while (attempt <= MAX_RETRIES) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('timeout')), TIMEOUT_MS);
    try {
      if (verbose) {
        try {
          const preview = messages.map(m => ({ role: m.role, content: m.content.slice(0, 200) }));
          console.log(`[AI][${reqId}] openai.request idx=${idx} attempt=${attempt} model=${model} messages=${messages.length} preview=`, preview);
        } catch {}
      } else {
        console.log(`[AI][${reqId}] openai.request idx=${idx} attempt=${attempt} model=${model} messages=${messages.length}`);
      }
      const res = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, messages }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        console.error(`[AI][${reqId}] openai.error idx=${idx} attempt=${attempt} status=${res.status} body=${text}`);
        throw new Error(`OpenAI error ${res.status}: ${text}`);
      }
      const json = (await res.json()) as ChatCompletionResponse;
      const content = json.choices?.[0]?.message?.content ?? '';
      const ms = Date.now() - startedAt;
      if (verbose) {
        console.log(`[AI][${reqId}] openai.response idx=${idx} ms=${ms} preview=`, (content || '').slice(0, 200));
      } else {
        console.log(`[AI][${reqId}] openai.response idx=${idx} ms=${ms}`);
      }
      clearTimeout(timer);
      return content.trim();
    } catch (err: unknown) {
      clearTimeout(timer);
      lastErr = err;
      const backoff = Math.min(8000, 1000 * Math.pow(2, attempt)) + Math.floor(Math.random() * 250);
      console.warn(`[AI][${reqId}] openai.retry idx=${idx} attempt=${attempt} error=${describeError(err)} backoffMs=${backoff}`, err);
      attempt += 1;
      if (attempt > MAX_RETRIES) break;
      await sleep(backoff);
    }
  }
  if (lastErr instanceof Error) {
    throw lastErr;
  }
  throw new Error(describeError(lastErr));
}

export class OpenAiProvider implements AiProvider {
  private readonly model: string;
  constructor(model: string = OPENAI_MODEL) {
    this.model = model;
  }

  async translateBatch(params: {
    sourceLanguage: string;
    targetLanguage: string;
    inputs: string[];
    glossary?: AiGlossaryTerm[];
    abortSignal?: AbortSignal;
  }): Promise<{ outputs: string[] }> {
    const { targetLanguage, inputs, glossary } = params;
    const reqId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const verbose = (process.env.AI_LOG_VERBOSE === '1' || process.env.AI_LOG_VERBOSE === 'true');
    console.log(`[AI][${reqId}] translateBatch start provider=openai model=${this.model} target=${targetLanguage} inputs=${inputs.length}`);
    const system = buildSystemPrompt(targetLanguage, glossary);
    const outputs: string[] = [];

    // Group inputs to reduce request count and improve throughput
    const GROUP_SIZE = Number(process.env.AI_GROUP_SIZE || 10);
    for (let start = 0; start < inputs.length; start += GROUP_SIZE) {
      const slice = inputs.slice(start, start + GROUP_SIZE);
      const protectedItems = slice.map((text) => protectPlaceholders(text));
      const payload = protectedItems.map(p => p.textWithSentinels);

      const user = [
        'Translate each item in the JSON array below into the target language. Return ONLY a JSON array of strings, same length and order. Do not add commentary.',
        'Keep sentinels like __PH_1__ unchanged. Do not alter the count or order of items.',
        'INPUTS:',
        JSON.stringify(payload),
      ].join('\n');

      try {
        const completion = await callOpenAI([
          { role: 'system', content: system },
          { role: 'user', content: user },
        ], this.model, reqId, Math.floor(start / GROUP_SIZE), verbose);

        // Attempt to parse JSON array; strip code fences if present
        const cleaned = completion.replace(/^```[a-zA-Z]*\n?|```$/g, '').trim();
        let translated: string[] = [];
        try {
          const parsed = JSON.parse(cleaned);
          if (Array.isArray(parsed)) {
            translated = parsed.map(String);
          } else {
            throw new Error('Model did not return a JSON array');
          }
        } catch {
          console.error(`[AI][${reqId}] parse_error group_start=${start} body=`, completion.slice(0, 500));
          // Fallback: split lines (best-effort)
          translated = cleaned.split('\n').filter(Boolean);
        }

        // Restore placeholders per item
        for (let i = 0; i < protectedItems.length; i++) {
          const restored = restorePlaceholders(translated[i] ?? '', protectedItems[i].mapping);
          outputs.push(restored);
        }
      } catch (err: unknown) {
        console.error(`[AI][${reqId}] group_failed start=${start} count=${slice.length} error=${describeError(err)}`, err);
        // Degrade gracefully: fill with empty outputs for this group
        for (let i = 0; i < protectedItems.length; i++) {
          outputs.push('');
        }
      }
    }
    console.log(`[AI][${reqId}] translateBatch done provider=openai outputs=${outputs.length}`);
    return { outputs };
  }
}

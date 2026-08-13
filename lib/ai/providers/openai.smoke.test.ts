import { describe, expect, it } from 'vitest';
import { loadEnv } from 'vite';

const localEnv = loadEnv('test', process.cwd(), '');
const apiKey = process.env.OPENAI_API_KEY || localEnv.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL || localEnv.OPENAI_MODEL || 'gpt-5.6-luna';
const enabled = process.env.RUN_OPENAI_SMOKE === '1' && Boolean(apiKey);

describe.skipIf(!enabled)('OpenAI provider smoke test', () => {
  it('translates one placeholder-bearing UI string with the configured model', async () => {
    process.env.OPENAI_API_KEY = apiKey;
    const { OpenAiProvider } = await import('./openai');
    const provider = new OpenAiProvider(model);
    const result = await provider.translateBatch({
      sourceLanguage: 'en',
      targetLanguage: 'el',
      inputs: ['Welcome, {name}!'],
    });

    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]).toContain('{name}');
    expect(result.outputs[0]).not.toBe('Welcome, {name}!');
  }, 60000);
});

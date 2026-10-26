import { describe, expect, it } from 'vitest';
import { generateApiKey, hashApiKey, isProjectApiKey } from './apiKeys';

describe('project API keys', () => {
  it('generates unique prefixed keys with a stored prefix and SHA-256 hash', () => {
    const first = generateApiKey();
    const second = generateApiKey();

    expect(first.key).toMatch(/^glt_[A-Za-z0-9_-]{43}$/);
    expect(first.key).not.toBe(second.key);
    expect(first.keyPrefix).toBe(first.key.slice(0, 10));
    expect(first.keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.keyHash).toBe(hashApiKey(first.key));
  });

  it('distinguishes API keys from Supabase session tokens', () => {
    expect(isProjectApiKey(generateApiKey().key)).toBe(true);
    expect(isProjectApiKey('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature')).toBe(false);
  });
});

import { createHash, randomBytes } from 'node:crypto';

/** Project API keys look like `glt_<43 base64url chars>`; Supabase session JWTs start with `eyJ`. */
export const API_KEY_PREFIX = 'glt_';
const VISIBLE_PREFIX_LENGTH = API_KEY_PREFIX.length + 6;

export type ProjectApiKeyRecord = {
  id: string;
  project_id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export function isProjectApiKey(token: string): boolean {
  return token.startsWith(API_KEY_PREFIX);
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

/** Returns the plaintext key (shown once) plus the values that are stored. */
export function generateApiKey(): { key: string; keyPrefix: string; keyHash: string } {
  const key = `${API_KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
  return { key, keyPrefix: key.slice(0, VISIBLE_PREFIX_LENGTH), keyHash: hashApiKey(key) };
}

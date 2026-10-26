import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateApiKey } from '@/lib/apiKeys';
import { createFakeSupabase, type FakeQueryCall } from '@/lib/testing/fakeSupabase';

const mocks = vi.hoisted(() => ({
  getSupabaseAdminClient: vi.fn(),
}));

vi.mock('@/lib/serverSupabase', () => ({
  getSupabaseAdminClient: mocks.getSupabaseAdminClient,
}));

import { GET } from './route';

const projectId = '11111111-1111-4111-8111-111111111111';
const otherProjectId = '33333333-3333-4333-8333-333333333333';
const memberId = '22222222-2222-4222-8222-222222222222';

const languages = [
  { id: 'lang-de', language_code: 'de', language_name: 'German' },
  { id: 'lang-en', language_code: 'en', language_name: 'English' },
  { id: 'lang-fr', language_code: 'fr', language_name: 'French' },
];

const translationKeys = [
  {
    id: 'key-cta',
    key: 'home.cta',
    translations: [{ id: 't1', project_language_id: 'lang-en', value: 'Start' }],
  },
  {
    id: 'key-title',
    key: 'home.title',
    translations: [
      { id: 't2', project_language_id: 'lang-en', value: 'Home' },
      { id: 't3', project_language_id: 'lang-fr', value: 'Accueil' },
    ],
  },
];

type KeyRow = { id: string; project_id: string; key_hash: string; last_used_at: string | null; revoked_at: string | null };

function setup(options: { keyRows?: KeyRow[]; membership?: { role: string; view_languages: string[] | null } | null } = {}) {
  const { keyRows = [], membership = null } = options;
  const fake = createFakeSupabase((call: FakeQueryCall) => {
    switch (call.table) {
      case 'project_api_keys': {
        if (call.update) return { error: null };
        return { data: keyRows.find((row) => row.key_hash === call.filters.key_hash) ?? null };
      }
      case 'platform_admins':
        return { data: null };
      case 'project_members':
        return { data: membership };
      case 'project_languages': {
        const codes = call.ins.language_code as string[] | undefined;
        return { data: codes ? languages.filter((lang) => codes.includes(lang.language_code)) : languages };
      }
      case 'translation_keys': {
        const languageIds = call.ins['translations.project_language_id'] as string[];
        const [from, to] = call.range ?? [0, 999];
        return {
          data: translationKeys.slice(from, to + 1).map((key) => ({
            ...key,
            translations: key.translations.filter((t) => languageIds.includes(t.project_language_id)),
          })),
        };
      }
      default:
        throw new Error(`Unexpected table ${call.table}`);
    }
  }, { 'member-session': memberId });
  mocks.getSupabaseAdminClient.mockReturnValue(fake.client);
  return fake;
}

function withApiKey(projectForKey = projectId, revokedAt: string | null = null) {
  const { key, keyHash } = generateApiKey();
  const fake = setup({
    keyRows: [{ id: 'api-key-1', project_id: projectForKey, key_hash: keyHash, last_used_at: null, revoked_at: revokedAt }],
  });
  return { key, fake };
}

function exportRequest(token: string | null, query = '', headers: Record<string, string> = {}) {
  return GET(
    new Request(`http://localhost/api/v1/projects/${projectId}/export${query}`, {
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    }),
    { params: Promise.resolve({ projectId }) }
  );
}

describe('GET /api/v1/projects/[projectId]/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns one language as nested JSON for a project API key and records usage', async () => {
    const { key, fake } = withApiKey();

    const response = await exportRequest(key, '?languages=en');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="en.json"');
    expect(response.headers.get('etag')).toMatch(/^"[0-9a-f]{64}"$/);
    await expect(response.json()).resolves.toEqual({ home: { cta: 'Start', title: 'Home' } });
    expect(fake.calls.some((call) => call.table === 'project_api_keys' && call.update?.last_used_at)).toBe(true);
  });

  it('applies format and fallback options', async () => {
    const { key } = withApiKey();

    const response = await exportRequest(key, '?languages=fr&format=flat&fallback=en');

    await expect(response.json()).resolves.toEqual({ 'home.cta': 'Start', 'home.title': 'Accueil' });
  });

  it('returns 304 when If-None-Match matches the current ETag', async () => {
    const { key } = withApiKey();
    const first = await exportRequest(key, '?languages=en');
    const etag = first.headers.get('etag')!;

    const second = await exportRequest(key, '?languages=en', { 'if-none-match': etag });

    expect(second.status).toBe(304);
    expect(second.headers.get('etag')).toBe(etag);
    expect(await second.text()).toBe('');
  });

  it('returns every active language as a ZIP when no languages are requested', async () => {
    const { key } = withApiKey();

    const response = await exportRequest(key);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual(['de.json', 'en.json', 'fr.json']);
    expect(JSON.parse(await zip.file('fr.json')!.async('string'))).toEqual({ home: { title: 'Accueil' } });
    expect(JSON.parse(await zip.file('de.json')!.async('string'))).toEqual({});
  });

  it('rejects revoked keys and keys from another project', async () => {
    const revoked = withApiKey(projectId, '2026-01-01T00:00:00Z');
    expect((await exportRequest(revoked.key, '?languages=en')).status).toBe(401);

    const foreign = withApiKey(otherProjectId);
    const response = await exportRequest(foreign.key, '?languages=en');
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'API key is not valid for this project.' });
  });

  it('rejects unknown keys and missing tokens', async () => {
    setup();

    expect((await exportRequest('glt_not-a-real-key')).status).toBe(401);
    expect((await exportRequest(null)).status).toBe(401);
  });

  it('limits session members to their view languages', async () => {
    setup({ membership: { role: 'member', view_languages: ['en'] } });

    expect((await exportRequest('member-session', '?languages=fr')).status).toBe(403);
    expect((await exportRequest('member-session', '?languages=en&fallback=fr')).status).toBe(403);

    const response = await exportRequest('member-session', '?type=zip');
    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    expect(Object.keys(zip.files)).toEqual(['en.json']);
  });

  it('rejects session users who are not project members', async () => {
    setup({ membership: null });

    expect((await exportRequest('member-session', '?languages=en')).status).toBe(403);
  });

  it('validates query parameters', async () => {
    const { key } = withApiKey();

    expect((await exportRequest(key, '?languages=en,fr&type=json')).status).toBe(400);
    expect((await exportRequest(key, '?format=yaml')).status).toBe(400);
    expect((await exportRequest(key, '?type=tar')).status).toBe(400);
    const unknown = await exportRequest(key, '?languages=xx');
    expect(unknown.status).toBe(404);
    await expect(unknown.json()).resolves.toEqual({ error: 'Unknown or inactive language: xx.' });
  });

  it('rejects malformed project ids before touching the database', async () => {
    setup();

    const response = await GET(new Request('http://localhost/api/v1/projects/nope/export'), {
      params: Promise.resolve({ projectId: 'nope' }),
    });

    expect(response.status).toBe(400);
    expect(mocks.getSupabaseAdminClient).not.toHaveBeenCalled();
  });
});

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
const adminId = '55555555-5555-4555-8555-555555555555';
const memberId = '22222222-2222-4222-8222-222222222222';

const languages = [
  { language_code: 'de', language_name: 'German' },
  { language_code: 'en', language_name: 'English' },
  { language_code: 'fr', language_name: null },
];

function setup(options: { keyProjectId?: string; keyHash?: string } = {}) {
  const fake = createFakeSupabase((call: FakeQueryCall) => {
    switch (call.table) {
      case 'project_api_keys':
        if (call.update) return {};
        return {
          data: call.filters.key_hash === options.keyHash
            ? { id: 'api-key-1', project_id: options.keyProjectId, last_used_at: null, revoked_at: null }
            : null,
        };
      case 'platform_admins':
        return { data: call.filters.user_id === adminId ? { user_id: adminId } : null };
      case 'project_members':
        return { data: call.filters.user_id === memberId ? { role: 'member', view_languages: ['en', 'fr'] } : null };
      case 'projects':
        return { data: call.filters.id === projectId ? { id: projectId } : null };
      case 'project_languages':
        return { data: call.filters.project_id === projectId ? languages : [] };
      default:
        throw new Error(`Unexpected table ${call.table}`);
    }
  }, { 'admin-session': adminId, 'member-session': memberId });
  mocks.getSupabaseAdminClient.mockReturnValue(fake.client);
  return fake;
}

function listLanguages(token: string, id = projectId) {
  return GET(
    new Request(`http://localhost/api/v1/projects/${id}/languages`, { headers: { authorization: `Bearer ${token}` } }),
    { params: Promise.resolve({ projectId: id }) }
  );
}

describe('GET /api/v1/projects/[projectId]/languages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns every active language for a project API key', async () => {
    const { key, keyHash } = generateApiKey();
    setup({ keyProjectId: projectId, keyHash });

    const response = await listLanguages(key);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      languages: [
        { code: 'de', name: 'German' },
        { code: 'en', name: 'English' },
        { code: 'fr', name: null },
      ],
    });
  });

  it('limits members to their view languages', async () => {
    setup();

    await expect((await listLanguages('member-session')).json()).resolves.toEqual({
      languages: [
        { code: 'en', name: 'English' },
        { code: 'fr', name: null },
      ],
    });
  });

  it('rejects keys for another project', async () => {
    const { key, keyHash } = generateApiKey();
    setup({ keyProjectId: otherProjectId, keyHash });

    expect((await listLanguages(key)).status).toBe(403);
  });

  it('returns 404 for a project that does not exist', async () => {
    setup();

    const response = await listLanguages('admin-session', otherProjectId);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Project not found.' });
  });

  it('rejects malformed project ids before touching the database', async () => {
    setup();

    expect((await listLanguages('admin-session', 'nope')).status).toBe(400);
    expect(mocks.getSupabaseAdminClient).not.toHaveBeenCalled();
  });
});

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

const adminId = '55555555-5555-4555-8555-555555555555';
const memberId = '22222222-2222-4222-8222-222222222222';
const loneUserId = '66666666-6666-4666-8666-666666666666';

const projects = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Mobile app', created_at: '2026-01-01T00:00:00Z' },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Website', created_at: '2026-01-02T00:00:00Z' },
];

function setup(keyHash = 'unused') {
  const fake = createFakeSupabase((call: FakeQueryCall) => {
    switch (call.table) {
      case 'project_api_keys':
        if (call.update) return {};
        return {
          data: call.filters.key_hash === keyHash
            ? { id: 'api-key-1', project_id: projects[1].id, last_used_at: null, revoked_at: null }
            : null,
        };
      case 'platform_admins':
        return { data: call.filters.user_id === adminId ? { user_id: adminId } : null };
      case 'project_members':
        return { data: call.filters.user_id === memberId ? [{ project_id: projects[0].id }] : [] };
      case 'projects': {
        const ids = call.ins.id as string[] | undefined;
        return {
          data: projects.filter((project) =>
            (call.filters.id === undefined || project.id === call.filters.id) && (!ids || ids.includes(project.id))
          ),
        };
      }
      default:
        throw new Error(`Unexpected table ${call.table}`);
    }
  }, { 'admin-session': adminId, 'member-session': memberId, 'lone-session': loneUserId });
  mocks.getSupabaseAdminClient.mockReturnValue(fake.client);
  return fake;
}

function listProjects(token: string | null) {
  return GET(new Request('http://localhost/api/v1/projects', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  }));
}

describe('GET /api/v1/projects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns every project for platform admins as id and name only', async () => {
    setup();

    const response = await listProjects('admin-session');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      projects: [
        { id: projects[0].id, name: 'Mobile app' },
        { id: projects[1].id, name: 'Website' },
      ],
    });
  });

  it('returns only member projects for other users', async () => {
    setup();

    await expect((await listProjects('member-session')).json()).resolves.toEqual({
      projects: [{ id: projects[0].id, name: 'Mobile app' }],
    });
    await expect((await listProjects('lone-session')).json()).resolves.toEqual({ projects: [] });
  });

  it('returns only the key project for a project API key', async () => {
    const { key, keyHash } = generateApiKey();
    setup(keyHash);

    await expect((await listProjects(key)).json()).resolves.toEqual({
      projects: [{ id: projects[1].id, name: 'Website' }],
    });
  });

  it('requires authentication', async () => {
    setup();

    expect((await listProjects(null)).status).toBe(401);
    expect((await listProjects('glt_unknown')).status).toBe(401);
    expect((await listProjects('expired-session')).status).toBe(401);
  });
});

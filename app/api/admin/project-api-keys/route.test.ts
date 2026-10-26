import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashApiKey } from '@/lib/apiKeys';
import { createFakeSupabase, type FakeQueryCall, type FakeQueryResult } from '@/lib/testing/fakeSupabase';

const mocks = vi.hoisted(() => ({
  getSupabaseAdminClient: vi.fn(),
}));

vi.mock('@/lib/serverSupabase', () => ({
  getSupabaseAdminClient: mocks.getSupabaseAdminClient,
}));

import { DELETE, GET, POST } from './route';

const projectId = '11111111-1111-4111-8111-111111111111';
const ownerId = '22222222-2222-4222-8222-222222222222';
const memberId = '44444444-4444-4444-8444-444444444444';

const storedKey = {
  id: 'api-key-1',
  project_id: projectId,
  name: 'iOS build',
  key_prefix: 'glt_abcdef',
  created_at: '2026-10-01T00:00:00Z',
  last_used_at: null,
  revoked_at: null,
};

function setup(apiKeys: (call: FakeQueryCall) => FakeQueryResult = () => ({ data: [] })) {
  const fake = createFakeSupabase((call) => {
    switch (call.table) {
      case 'platform_admins':
        return { data: null };
      case 'project_members':
        return { data: call.filters.user_id === ownerId ? { role: 'owner' } : { role: 'member' } };
      case 'project_api_keys':
        return apiKeys(call);
      default:
        throw new Error(`Unexpected table ${call.table}`);
    }
  }, { 'owner-session': ownerId, 'member-session': memberId });
  mocks.getSupabaseAdminClient.mockReturnValue(fake.client);
  return fake;
}

function post(token: string, body: unknown) {
  return POST(new Request('http://localhost/api/admin/project-api-keys', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

describe('/api/admin/project-api-keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a key, returns the secret once, and stores only its hash', async () => {
    const fake = setup((call) => {
      if (call.head) return { count: 0 };
      return { data: { ...storedKey, name: call.insert?.name, key_prefix: call.insert?.key_prefix } };
    });

    const response = await post('owner-session', { projectId, name: '  iOS build ' });

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.secret).toMatch(/^glt_[A-Za-z0-9_-]{43}$/);
    expect(payload.key).toMatchObject({ id: 'api-key-1', name: 'iOS build', keyPrefix: payload.secret.slice(0, 10) });

    const insert = fake.calls.find((call) => call.insert)?.insert;
    expect(insert).toMatchObject({ project_id: projectId, name: 'iOS build', created_by: ownerId });
    expect(insert?.key_hash).toBe(hashApiKey(payload.secret));
    expect(JSON.stringify(insert)).not.toContain(payload.secret);
  });

  it('refuses to create keys past the active-key limit', async () => {
    setup((call) => (call.head ? { count: 20 } : { data: storedKey }));

    expect((await post('owner-session', { projectId, name: 'One more' })).status).toBe(409);
  });

  it('validates the key name', async () => {
    setup();

    expect((await post('owner-session', { projectId, name: '   ' })).status).toBe(400);
    expect((await post('owner-session', { projectId, name: 'x'.repeat(101) })).status).toBe(400);
  });

  it('only lets project owners and platform admins manage keys', async () => {
    setup();

    expect((await post('member-session', { projectId, name: 'CI' })).status).toBe(403);
    const list = await GET(new Request(`http://localhost/api/admin/project-api-keys?projectId=${projectId}`, {
      headers: { authorization: 'Bearer member-session' },
    }));
    expect(list.status).toBe(403);
  });

  it('lists keys without exposing hashes', async () => {
    const fake = setup(() => ({ data: [storedKey] }));

    const response = await GET(new Request(`http://localhost/api/admin/project-api-keys?projectId=${projectId}`, {
      headers: { authorization: 'Bearer owner-session' },
    }));

    await expect(response.json()).resolves.toEqual({
      keys: [{ id: 'api-key-1', name: 'iOS build', keyPrefix: 'glt_abcdef', createdAt: storedKey.created_at, lastUsedAt: null, revokedAt: null }],
    });
    expect(fake.calls.find((call) => call.table === 'project_api_keys')?.columns).not.toContain('key_hash');
  });

  it('revokes an active key in the same project', async () => {
    const fake = setup((call) => ({ data: { ...storedKey, revoked_at: call.update?.revoked_at } }));

    const response = await DELETE(new Request(
      `http://localhost/api/admin/project-api-keys?projectId=${projectId}&keyId=api-key-1`,
      { method: 'DELETE', headers: { authorization: 'Bearer owner-session' } }
    ));

    expect(response.status).toBe(200);
    const update = fake.calls.find((call) => call.update);
    expect(update?.filters).toEqual({ id: 'api-key-1', project_id: projectId, revoked_at: null });
    expect((await response.json()).key.revokedAt).toEqual(expect.any(String));
  });

  it('returns 404 when the key is missing or already revoked', async () => {
    setup(() => ({ data: null }));

    const response = await DELETE(new Request(
      `http://localhost/api/admin/project-api-keys?projectId=${projectId}&keyId=gone`,
      { method: 'DELETE', headers: { authorization: 'Bearer owner-session' } }
    ));

    expect(response.status).toBe(404);
  });
});

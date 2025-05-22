import { test } from 'node:test';
import assert from 'node:assert';
import { SessionManager } from './sessionManager';

// Helper to create a mock fetch function
function mockFetch(expectedUrl: string, expectedPayload: any, response: any) {
  return async (url: string, options: any) => {
    assert.strictEqual(url, expectedUrl);
    assert.ok(options);
    assert.strictEqual(options.method, 'POST');
    const body = JSON.parse(options.body);
    assert.deepStrictEqual(body, expectedPayload);
    return new Response(JSON.stringify(response), { status: 200 });
  };
}

test('createSession sends POST request', async () => {
  const sm = new SessionManager('https://api', 'key');
  const payload = { userId: 'u1', context: {}, folderId: null };
  globalThis.fetch = mockFetch('https://api/createSession', payload, { id: 's1' }) as any;
  const id = await sm.createSession('u1');
  assert.strictEqual(id, 's1');
});

test('updateSessionContext sends POST request', async () => {
  const sm = new SessionManager('https://api', 'k');
  const ctx = { foo: 'bar' };
  const payload = { sessionId: 's', userId: 'u', context: ctx };
  globalThis.fetch = mockFetch('https://api/updateSessionContext', payload, {}) as any;
  const ok = await sm.updateSessionContext('s', 'u', ctx);
  assert.ok(ok);
});

test('getSessionContext handles 404', async () => {
  const sm = new SessionManager('https://api', 'k');
  globalThis.fetch = async () => new Response('', { status: 404 });
  const result = await sm.getSessionContext('s', 'u');
  assert.strictEqual(result, null);
});


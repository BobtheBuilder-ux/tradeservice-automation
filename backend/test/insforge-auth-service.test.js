import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertPortalAccess,
  buildPortalUser,
  createInsForgeUserClient,
  getBearerToken,
  normalizePortalRole,
  parseAdminEmails,
} from '../src/services/insforge-auth-service.js';

test('normalizePortalRole only allows admin and agent portal roles', () => {
  assert.equal(normalizePortalRole('admin'), 'admin');
  assert.equal(normalizePortalRole('agent'), 'agent');
  assert.equal(normalizePortalRole('user'), 'agent');
  assert.equal(normalizePortalRole(undefined), 'agent');
});

test('parseAdminEmails normalizes comma-separated admin email list', () => {
  const emails = parseAdminEmails(' Owner@9qc.ca,admin@9qc.ca ,, ');
  assert.equal(emails.has('owner@9qc.ca'), true);
  assert.equal(emails.has('admin@9qc.ca'), true);
  assert.equal(emails.has(''), false);
});

test('createInsForgeUserClient configures server-mode session validation with provided access token', () => {
  const client = createInsForgeUserClient('test-access-token');
  assert.equal(client.getHttpClient().getHeaders().Authorization, 'Bearer test-access-token');
});

test('buildPortalUser maps Google user to admin when email is configured as admin', () => {
  const user = buildPortalUser(
    {
      id: 'auth-user-1',
      email: 'owner@9qc.ca',
      emailVerified: true,
      profile: { name: 'Owner User' },
      metadata: null,
    },
    null,
    { adminEmails: new Set(['owner@9qc.ca']) }
  );

  assert.equal(user.id, 'auth-user-1');
  assert.equal(user.authUserId, 'auth-user-1');
  assert.equal(user.role, 'admin');
  assert.equal(user.redirectTo, '/admin-dashboard');
});

test('buildPortalUser uses existing agent record role and profile', () => {
  const user = buildPortalUser(
    {
      id: 'auth-user-2',
      email: 'agent@9qc.ca',
      emailVerified: true,
      profile: { name: 'Google Name' },
      metadata: null,
    },
    {
      id: 'agent-row-1',
      email: 'agent@9qc.ca',
      fullName: 'Agent Record',
      role: 'agent',
    },
    { adminEmails: new Set() }
  );

  assert.equal(user.id, 'agent-row-1');
  assert.equal(user.authUserId, 'auth-user-2');
  assert.equal(user.name, 'Agent Record');
  assert.equal(user.role, 'agent');
  assert.equal(user.redirectTo, '/agent-dashboard');
});

test('assertPortalAccess blocks non-admin users from admin routes', () => {
  assert.doesNotThrow(() => assertPortalAccess({ role: 'admin' }, 'admin'));
  assert.throws(() => assertPortalAccess({ role: 'agent' }, 'admin'), /Admin access required/);
});

test('getBearerToken extracts bearer tokens safely', () => {
  assert.equal(getBearerToken({ headers: { authorization: 'Bearer token-123' } }), 'token-123');
  assert.equal(getBearerToken({ headers: { authorization: 'Basic token-123' } }), null);
  assert.equal(getBearerToken({ headers: {} }), null);
});

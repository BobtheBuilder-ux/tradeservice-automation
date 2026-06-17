import { createClient } from '@insforge/sdk';
import { insforgeClientConfig } from './insforge-client.js';
import insforgeDataService from './insforge-data-service.js';

const PORTAL_ROLES = new Set(['admin', 'agent']);

export function normalizePortalRole(role) {
  return PORTAL_ROLES.has(role) ? role : 'agent';
}

export function parseAdminEmails(value = process.env.ADMIN_EMAILS || '') {
  return new Set(
    value
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function getBearerToken(req) {
  const authHeader = req.headers?.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim() || null;
}

export function buildPortalUser(insforgeUser, agentRecord = null, options = {}) {
  const email = insforgeUser?.email?.toLowerCase();
  const adminEmails = options.adminEmails || parseAdminEmails();
  const role = adminEmails.has(email) ? 'admin' : normalizePortalRole(agentRecord?.role);
  const profileName = insforgeUser?.profile?.name || insforgeUser?.metadata?.name;

  return {
    id: agentRecord?.id || insforgeUser.id,
    authUserId: insforgeUser.id,
    email: insforgeUser.email,
    name: agentRecord?.fullName || agentRecord?.name || profileName || insforgeUser.email,
    role,
    emailVerified: Boolean(insforgeUser.emailVerified ?? true),
    redirectTo: role === 'admin' ? '/admin-dashboard' : '/agent-dashboard',
  };
}

export function assertPortalAccess(user, requiredRole) {
  if (!user) {
    const error = new Error('Authentication required');
    error.statusCode = 401;
    throw error;
  }

  if (requiredRole === 'admin' && user.role !== 'admin') {
    const error = new Error('Admin access required');
    error.statusCode = 403;
    throw error;
  }

  if (requiredRole === 'agent' && !['admin', 'agent'].includes(user.role)) {
    const error = new Error('Agent access required');
    error.statusCode = 403;
    throw error;
  }
}

export async function getInsForgeUserFromToken(accessToken) {
  const client = createClient({
    baseUrl: insforgeClientConfig.baseUrl,
    accessToken,
  });

  const { data, error } = await client.auth.getCurrentUser();
  if (error || !data?.user) {
    const authError = new Error('Invalid or expired InsForge session');
    authError.statusCode = 401;
    throw authError;
  }

  return data.user;
}

export async function authenticateInsForgeRequest(req) {
  const accessToken = getBearerToken(req);
  if (!accessToken) {
    const error = new Error('No valid authorization token provided');
    error.statusCode = 401;
    throw error;
  }

  const insforgeUser = await getInsForgeUserFromToken(accessToken);
  const agentRecord = await insforgeDataService.getAgentByEmail(insforgeUser.email);
  const portalUser = buildPortalUser(insforgeUser, agentRecord);

  if (agentRecord?.id) {
    await insforgeDataService.updateAgent(agentRecord.id, {
      lastLogin: new Date(),
      isActive: true,
      emailVerified: true,
    });
  }

  return portalUser;
}

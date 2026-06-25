import { insforge, insforgeConfig } from './insforge';

function getInsForgeAccessToken() {
  if (typeof window === 'undefined') return null;

  const headers = insforge.getHttpClient().getHeaders();
  const authorization = headers.Authorization || headers.authorization || '';
  if (!authorization.startsWith('Bearer ')) return null;

  return authorization.slice(7);
}

export function getInsForgeFunctionBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_INSFORGE_FUNCTION_BASE_URL;
  if (configured) return configured.replace(/\/$/, '');
  try {
    const host = new URL(insforgeConfig.baseUrl).hostname;
    const appKey = host.split('.')[0];
    return `https://${appKey}.function2.insforge.app`;
  } catch {
    return '';
  }
}

export async function invokeFunction(slug, { action, body, method = 'POST' } = {}) {
  const baseUrl = getInsForgeFunctionBaseUrl();
  if (!baseUrl) throw new Error('InsForge Function base URL is not configured');
  const url = new URL(`/${slug}`, baseUrl);
  if (action) url.searchParams.set('action', action);
  const token = getInsForgeAccessToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url.toString(), {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(body || {}),
  });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('json') ? await response.json() : await response.text();
  if (!response.ok) {
    throw new Error(data?.error || data?.message || `Function request failed: ${response.status}`);
  }
  return data;
}

export async function provisionElevenLabsAgent(user, agentId, options = {}) {
  return invokeFunction('elevenlabs-agent-actions', {
    action: 'provision-agent',
    body: {
      tenantId: options.tenantId || user?.tenantId,
      agentId,
      syncKnowledge: options.syncKnowledge !== false,
    },
  });
}

export async function testElevenLabsAgent(user, agentId) {
  return invokeFunction('elevenlabs-agent-actions', {
    action: 'test-agent',
    body: {
      tenantId: user?.tenantId,
      agentId,
    },
  });
}

export async function listElevenLabsVoices(user) {
  return invokeFunction('elevenlabs-agent-actions', {
    action: 'list-voices',
    body: {
      tenantId: user?.tenantId,
    },
  });
}

export async function getCalendlyConnectUrl(options = {}) {
  return invokeFunction('calendly-oauth', {
    action: 'connect-url',
    body: {
      returnTo: options.returnTo || undefined,
    },
  });
}

export async function listCalendlyEventTypes() {
  return invokeFunction('calendly-oauth', { action: 'event-types', body: {} });
}

export async function getMetaConnectUrl(options = {}) {
  return invokeFunction('meta-oauth', {
    action: 'connect-url',
    body: {
      returnTo: options.returnTo || undefined,
    },
  });
}

export async function getMetaStatus() {
  return invokeFunction('meta-oauth', { action: 'status', body: {} });
}

export async function listMetaAssets(options = {}) {
  const baseUrl = getInsForgeFunctionBaseUrl();
  if (!baseUrl) throw new Error('InsForge Function base URL is not configured');
  const url = new URL('/meta-oauth', baseUrl);
  url.searchParams.set('action', 'assets');
  if (options.pageId) url.searchParams.set('pageId', options.pageId);
  const token = getInsForgeAccessToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url.toString(), { method: 'GET', headers });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || data?.message || `Function request failed: ${response.status}`);
  }
  return data;
}

export async function saveMetaSelection(input = {}) {
  return invokeFunction('meta-oauth', { action: 'save-selection', body: input });
}

export async function disconnectMetaIntegration() {
  return invokeFunction('meta-oauth', { action: 'disconnect', body: {} });
}

export async function testMetaSetup() {
  return invokeFunction('meta-oauth', { action: 'test-setup', body: {} });
}

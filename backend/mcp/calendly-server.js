#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const API_BASE_URL = process.env.CALENDLY_API_BASE_URL || 'https://api.calendly.com';
const SERVER_NAME = 'tradeservice-calendly-mcp';
const SERVER_VERSION = '1.0.0';
const MCP_PROTOCOL_VERSION = '2024-11-05';

const tools = [
  {
    name: 'calendly_get_current_user',
    title: 'Get Calendly current user',
    description: 'Return the Calendly user and organization associated with the configured token.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true
    }
  },
  {
    name: 'calendly_list_event_types',
    title: 'List Calendly event types',
    description: 'List active event types for the configured user or a supplied Calendly user URI.',
    inputSchema: {
      type: 'object',
      properties: {
        userUri: {
          type: 'string',
          description: 'Optional Calendly user URI. Defaults to the current user.'
        },
        count: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Maximum number of event types to return.'
        }
      },
      additionalProperties: false
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true
    }
  },
  {
    name: 'calendly_list_scheduled_events',
    title: 'List Calendly scheduled events',
    description: 'List scheduled Calendly events for the configured user in an optional date window.',
    inputSchema: {
      type: 'object',
      properties: {
        userUri: {
          type: 'string',
          description: 'Optional Calendly user URI. Defaults to the current user.'
        },
        minStartTime: {
          type: 'string',
          description: 'Optional ISO 8601 lower bound for event start time.'
        },
        maxStartTime: {
          type: 'string',
          description: 'Optional ISO 8601 upper bound for event start time.'
        },
        status: {
          type: 'string',
          enum: ['active', 'canceled'],
          description: 'Optional scheduled event status.'
        },
        count: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Maximum number of events to return.'
        }
      },
      additionalProperties: false
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true
    }
  },
  {
    name: 'calendly_list_event_invitees',
    title: 'List Calendly event invitees',
    description: 'List invitees for a scheduled event URI.',
    inputSchema: {
      type: 'object',
      required: ['eventUri'],
      properties: {
        eventUri: {
          type: 'string',
          description: 'Calendly scheduled event URI, for example https://api.calendly.com/scheduled_events/abc.'
        },
        count: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Maximum number of invitees to return.'
        }
      },
      additionalProperties: false
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true
    }
  },
  {
    name: 'calendly_create_single_use_link',
    title: 'Create Calendly single-use link',
    description: 'Create a single-use scheduling link for a Calendly event type.',
    inputSchema: {
      type: 'object',
      required: ['eventTypeUri'],
      properties: {
        eventTypeUri: {
          type: 'string',
          description: 'Calendly event type URI returned by calendly_list_event_types.'
        },
        maxEventCount: {
          type: 'integer',
          minimum: 1,
          maximum: 1,
          description: 'Calendly only supports 1 for single-use scheduling links.'
        }
      },
      additionalProperties: false
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false
    }
  },
  {
    name: 'calendly_list_webhooks',
    title: 'List Calendly webhooks',
    description: 'List Calendly webhook subscriptions for the current organization or supplied organization URI.',
    inputSchema: {
      type: 'object',
      properties: {
        organizationUri: {
          type: 'string',
          description: 'Optional Calendly organization URI. Defaults to current user organization.'
        },
        scope: {
          type: 'string',
          enum: ['organization', 'user'],
          description: 'Webhook scope.'
        },
        count: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Maximum number of webhooks to return.'
        }
      },
      additionalProperties: false
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true
    }
  },
  {
    name: 'calendly_create_webhook',
    title: 'Create Calendly webhook',
    description: 'Create a Calendly webhook subscription for invitee.created and invitee.canceled events by default.',
    inputSchema: {
      type: 'object',
      required: ['callbackUrl'],
      properties: {
        callbackUrl: {
          type: 'string',
          description: 'HTTPS callback URL that Calendly should call.'
        },
        organizationUri: {
          type: 'string',
          description: 'Optional organization URI. Defaults to current user organization.'
        },
        scope: {
          type: 'string',
          enum: ['organization', 'user'],
          description: 'Webhook scope. Defaults to organization.'
        },
        events: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'invitee.created',
              'invitee.canceled',
              'routing_form_submission.created'
            ]
          },
          minItems: 1,
          uniqueItems: true,
          description: 'Calendly webhook event names.'
        }
      },
      additionalProperties: false
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false
    }
  },
  {
    name: 'calendly_remote_mcp_info',
    title: 'Get official Calendly MCP info',
    description: 'Return connection details for Calendly hosted MCP at https://mcp.calendly.com.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true
    }
  }
];

function getToken() {
  return process.env.CALENDLY_PERSONAL_ACCESS_TOKEN || process.env.CALENDLY_API_TOKEN;
}

function assertToken() {
  const token = getToken();
  if (!token) {
    throw new Error('Missing CALENDLY_PERSONAL_ACCESS_TOKEN or CALENDLY_API_TOKEN in backend/.env or MCP client env.');
  }
  return token;
}

async function calendlyRequest(pathOrUrl, { method = 'GET', searchParams, body } = {}) {
  const token = assertToken();
  const url = pathOrUrl.startsWith('http')
    ? new URL(pathOrUrl)
    : new URL(pathOrUrl, API_BASE_URL);

  for (const [key, value] of Object.entries(searchParams || {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  const data = text ? parseJson(text) : null;

  if (!response.ok) {
    const detail = typeof data === 'object' && data ? JSON.stringify(data) : text;
    throw new Error(`Calendly API ${response.status} ${response.statusText}: ${detail}`);
  }

  return data;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function limitCount(value, fallback = 25) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), 100);
}

async function getCurrentUser() {
  const data = await calendlyRequest('/users/me');
  return data.resource;
}

async function getDefaultUserUri(userUri) {
  if (userUri) return userUri;
  const user = await getCurrentUser();
  return user.uri;
}

async function getDefaultOrganizationUri(organizationUri) {
  if (organizationUri) return organizationUri;
  const user = await getCurrentUser();
  return user.current_organization;
}

function requireString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

function normalizeApiUrl(url, suffix = '') {
  const parsed = new URL(requireString(url, 'url'));
  if (parsed.origin !== API_BASE_URL) {
    throw new Error(`Expected a Calendly API URL starting with ${API_BASE_URL}.`);
  }
  if (suffix && !parsed.pathname.endsWith(suffix)) {
    parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}${suffix}`;
  }
  return parsed.toString();
}

async function callTool(name, args = {}) {
  switch (name) {
    case 'calendly_get_current_user':
      return getCurrentUser();

    case 'calendly_list_event_types': {
      const userUri = await getDefaultUserUri(args.userUri);
      return calendlyRequest('/event_types', {
        searchParams: {
          user: userUri,
          active: true,
          count: limitCount(args.count)
        }
      });
    }

    case 'calendly_list_scheduled_events': {
      const userUri = await getDefaultUserUri(args.userUri);
      return calendlyRequest('/scheduled_events', {
        searchParams: {
          user: userUri,
          min_start_time: args.minStartTime,
          max_start_time: args.maxStartTime,
          status: args.status,
          count: limitCount(args.count)
        }
      });
    }

    case 'calendly_list_event_invitees': {
      const eventUri = normalizeApiUrl(args.eventUri, '/invitees');
      return calendlyRequest(eventUri, {
        searchParams: {
          count: limitCount(args.count)
        }
      });
    }

    case 'calendly_create_single_use_link':
      return calendlyRequest('/scheduling_links', {
        method: 'POST',
        body: {
          max_event_count: args.maxEventCount || 1,
          owner: requireString(args.eventTypeUri, 'eventTypeUri'),
          owner_type: 'EventType'
        }
      });

    case 'calendly_list_webhooks': {
      const organizationUri = await getDefaultOrganizationUri(args.organizationUri);
      return calendlyRequest('/webhook_subscriptions', {
        searchParams: {
          organization: organizationUri,
          scope: args.scope || 'organization',
          count: limitCount(args.count)
        }
      });
    }

    case 'calendly_create_webhook': {
      const organizationUri = await getDefaultOrganizationUri(args.organizationUri);
      return calendlyRequest('/webhook_subscriptions', {
        method: 'POST',
        body: {
          url: requireString(args.callbackUrl, 'callbackUrl'),
          events: args.events?.length ? args.events : ['invitee.created', 'invitee.canceled'],
          organization: organizationUri,
          scope: args.scope || 'organization'
        }
      });
    }

    case 'calendly_remote_mcp_info':
      return {
        remoteServerUrl: 'https://mcp.calendly.com',
        protectedResourceMetadata: 'https://mcp.calendly.com/.well-known/oauth-protected-resource',
        authorizationServerMetadata: 'https://calendly.com/.well-known/oauth-authorization-server',
        scopes: ['mcp:scheduling:read', 'mcp:scheduling:write'],
        notes: [
          'Calendly hosts its official MCP server and does not support self-hosting it.',
          'DCR-capable MCP clients should connect directly to the remote server URL.',
          'This local bridge is for clients that need stdio tools backed by a configured Calendly API token.'
        ]
      };

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function makeResponse(id, result) {
  return {
    jsonrpc: '2.0',
    id,
    result
  };
}

function makeError(id, code, message) {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message
    }
  };
}

async function handleMessage(message) {
  const { id, method, params = {} } = message;

  try {
    if (method === 'initialize') {
      return makeResponse(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: SERVER_NAME,
          version: SERVER_VERSION
        }
      });
    }

    if (method === 'notifications/initialized') {
      return null;
    }

    if (method === 'ping') {
      return makeResponse(id, {});
    }

    if (method === 'tools/list') {
      return makeResponse(id, { tools });
    }

    if (method === 'tools/call') {
      const result = await callTool(params.name, params.arguments || {});
      return makeResponse(id, {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      });
    }

    return makeError(id, -32601, `Method not found: ${method}`);
  } catch (error) {
    return makeError(id, -32000, error.message);
  }
}

function writeMessage(message) {
  if (!message) return;
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
}

let buffer = Buffer.alloc(0);

function readContentLengthMessage() {
  const headerEnd = buffer.indexOf('\r\n\r\n');
  if (headerEnd === -1) return null;

  const header = buffer.subarray(0, headerEnd).toString('utf8');
  const match = header.match(/Content-Length:\s*(\d+)/i);
  if (!match) {
    buffer = buffer.subarray(headerEnd + 4);
    throw new Error('Missing Content-Length header.');
  }

  const length = Number.parseInt(match[1], 10);
  const bodyStart = headerEnd + 4;
  const bodyEnd = bodyStart + length;
  if (buffer.length < bodyEnd) return null;

  const body = buffer.subarray(bodyStart, bodyEnd).toString('utf8');
  buffer = buffer.subarray(bodyEnd);
  return JSON.parse(body);
}

function readLineMessage() {
  const newline = buffer.indexOf('\n');
  if (newline === -1) return null;

  const line = buffer.subarray(0, newline).toString('utf8').trim();
  buffer = buffer.subarray(newline + 1);
  if (!line) return null;
  return JSON.parse(line);
}

async function processBuffer() {
  while (buffer.length > 0) {
    let message = null;
    try {
      const text = buffer.toString('utf8', 0, Math.min(buffer.length, 64));
      message = text.startsWith('Content-Length:')
        ? readContentLengthMessage()
        : readLineMessage();

      if (!message) return;
      writeMessage(await handleMessage(message));
    } catch (error) {
      writeMessage(makeError(null, -32700, error.message));
    }
  }
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  processBuffer();
});

process.stdin.on('end', () => {
  process.exit(0);
});

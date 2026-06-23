import { createClient } from 'npm:@insforge/sdk';

type JsonRecord = Record<string, any>;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,Svix-Id,Svix-Timestamp,Svix-Signature',
};

function createInsForgeClient() {
  return createClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    anonKey: Deno.env.get('ANON_KEY'),
  });
}

function jsonResponse(data: unknown, status = 200) {
  return Response.json(data, { status, headers: corsHeaders });
}

function nowIso() {
  return new Date().toISOString();
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message : 'Resend inbound email processing failed';
}

function escapeHtml(value: unknown) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function stripHtml(value: unknown) {
  return String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactText(value: unknown, maxLength = 5000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeEmail(value: unknown) {
  const text = typeof value === 'object' && value !== null
    ? String((value as JsonRecord).email || (value as JsonRecord).address || '')
    : String(value || '');
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return (match?.[0] || '').trim().toLowerCase();
}

function normalizeEmailList(value: unknown) {
  if (Array.isArray(value)) return value.map(normalizeEmail).filter(Boolean);
  return String(value || '')
    .split(/[,\s;]+/)
    .map(normalizeEmail)
    .filter(Boolean);
}

function emailDomain(value: unknown) {
  const email = normalizeEmail(value);
  return email.includes('@') ? email.split('@').pop() || '' : '';
}

function emailLocalPart(value: unknown) {
  const email = normalizeEmail(value);
  return email.includes('@') ? email.split('@')[0] || '' : '';
}

function configuredInboundDomains() {
  const values = [
    Deno.env.get('RESEND_INBOUND_DOMAIN'),
    emailDomain(Deno.env.get('EMAIL_FROM')),
  ];
  return Array.from(new Set(values.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)));
}

function safeSenderName(value: unknown) {
  return String(value || '').trim().replace(/[<>]/g, '').slice(0, 80);
}

function agentEmailLocalPart(agent?: any) {
  const local = String(agent?.display_name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 48);
  return local || 'bob';
}

function savedAgentEmail(agent?: any) {
  const email = String(agent?.email_address || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function senderForAgent(agent?: any) {
  const fallbackEmail = Deno.env.get('EMAIL_FROM');
  if (!fallbackEmail) throw new Error('EMAIL_FROM is not configured');
  const domain = emailDomain(fallbackEmail);
  if (!domain) throw new Error('EMAIL_FROM must include a valid domain');
  const name = safeSenderName(agent?.display_name) || Deno.env.get('EMAIL_FROM_NAME') || 'Bob Automation';
  const fromEmail = savedAgentEmail(agent) || `${agentEmailLocalPart(agent)}@${domain}`;
  return { from: `${name} <${fromEmail}>`, fromEmail, fromName: name };
}

function b64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToB64(bytes: ArrayBuffer) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function timingSafeEqual(a: string, b: string) {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left[index] ^ right[index];
  return diff === 0;
}

async function verifyResendWebhook(req: Request, rawBody: string) {
  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET') || '';
  if (!secret) throw new Error('RESEND_WEBHOOK_SECRET is not configured');
  const id = req.headers.get('svix-id') || '';
  const timestamp = req.headers.get('svix-timestamp') || '';
  const signature = req.headers.get('svix-signature') || '';
  if (!id || !timestamp || !signature) throw new Error('Missing Resend webhook signature headers');

  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
    throw new Error('Stale Resend webhook timestamp');
  }

  const secretBytes = secret.startsWith('whsec_') ? b64ToBytes(secret.slice('whsec_'.length)) : new TextEncoder().encode(secret);
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signedPayload = `${id}.${timestamp}.${rawBody}`;
  const expected = bytesToB64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload)));
  const provided = signature.split(/\s+/).map((part) => part.trim()).filter(Boolean);
  if (!provided.some((part) => part.startsWith('v1,') && timingSafeEqual(part.slice(3), expected))) {
    throw new Error('Invalid Resend webhook signature');
  }
}

async function unwrap(result: any, message: string) {
  if (result?.error) throw new Error(result.error.message || message);
  return result?.data;
}

async function fetchReceivedEmail(emailId: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');
  const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || data?.error || `Failed to fetch received email ${emailId}`);
  return data;
}

function eventEmailId(event: JsonRecord) {
  return String(firstValue(event?.data?.email_id, event?.data?.emailId, event?.data?.id, event?.email_id, event?.id, '') || '');
}

function messageIdFromHeaders(headers: unknown) {
  if (!headers) return '';
  if (Array.isArray(headers)) {
    const row = headers.find((item: any) => String(item?.name || item?.key || '').toLowerCase() === 'message-id');
    return String(row?.value || '').trim();
  }
  const record = headers as JsonRecord;
  return String(record['message-id'] || record['Message-ID'] || record.message_id || '').trim();
}

function referencesFromHeaders(headers: unknown) {
  if (!headers) return '';
  if (Array.isArray(headers)) {
    const row = headers.find((item: any) => String(item?.name || item?.key || '').toLowerCase() === 'references');
    return String(row?.value || '').trim();
  }
  const record = headers as JsonRecord;
  return String(record.references || record.References || '').trim();
}

function inboundFields(event: JsonRecord, received: JsonRecord) {
  const data = event?.data || {};
  const from = normalizeEmail(firstValue(received.from, data.from));
  const to = normalizeEmailList(firstValue(received.to, data.to));
  const cc = normalizeEmailList(firstValue(received.cc, data.cc));
  const subject = String(firstValue(received.subject, data.subject, '') || '').trim();
  const text = String(firstValue(received.text, received.text_body, received.body_text, data.text, '') || '').trim();
  const html = String(firstValue(received.html, received.html_body, received.body_html, data.html, '') || '').trim();
  const bodyText = text || stripHtml(html);
  const headers = firstValue(received.headers, data.headers, {});
  return {
    providerEmailId: String(firstValue(received.id, data.email_id, data.id, '') || ''),
    from,
    to,
    cc,
    subject,
    text: bodyText,
    html,
    messageId: messageIdFromHeaders(headers),
    references: referencesFromHeaders(headers),
    attachmentsCount: Array.isArray(received.attachments) ? received.attachments.length : 0,
  };
}

async function loadLeadCandidates(db: any, fromEmail: string) {
  const exact = await unwrap(
    await db.database.from('leads').select('*').eq('email', fromEmail).limit(25),
    'Failed to load lead by inbound email'
  );
  if (exact?.length) return exact;
  try {
    return await unwrap(
      await db.database.from('leads').select('*').ilike('email', fromEmail).limit(25),
      'Failed to load lead by inbound email'
    );
  } catch {
    return [];
  }
}

async function loadTenant(db: any, tenantId: string) {
  const rows = await unwrap(
    await db.database.from('tenants').select('*').eq('id', tenantId).limit(1),
    'Failed to load tenant'
  );
  return rows?.[0] || null;
}

async function loadTenantAgents(db: any, tenantId: string) {
  return unwrap(
    await db.database.from('tenant_agents').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: true }).limit(50),
    'Failed to load tenant agents'
  );
}

function agentMatchesRecipient(agent: any, recipients: string[]) {
  const savedEmail = savedAgentEmail(agent);
  if (savedEmail && recipients.some((recipient) => normalizeEmail(recipient) === savedEmail)) return true;
  const local = String(agent?.email_local_part || agentEmailLocalPart(agent)).toLowerCase();
  return recipients.some((recipient) => emailLocalPart(recipient) === local);
}

async function resolveInboundContext(db: any, fields: ReturnType<typeof inboundFields>) {
  if (!fields.from) return { ignored: true, reason: 'missing_from_email' };
  const allowedDomains = configuredInboundDomains();
  const ownedRecipients = allowedDomains.length
    ? fields.to.filter((recipient) => allowedDomains.includes(emailDomain(recipient)))
    : fields.to;
  if (!ownedRecipients.length) return { ignored: true, reason: 'recipient_not_platform_domain' };

  const leads = await loadLeadCandidates(db, fields.from);
  if (!leads?.length) return { ignored: true, reason: 'lead_not_found' };

  const candidates = [];
  for (const lead of leads) {
    if (!lead?.tenant_id) continue;
    const [tenant, agents] = await Promise.all([
      loadTenant(db, lead.tenant_id),
      loadTenantAgents(db, lead.tenant_id),
    ]);
    const assigned = agents.find((agent: any) => agent.id === lead.assigned_tenant_agent_id) || null;
    const recipientAgent = agents.find((agent: any) => agentMatchesRecipient(agent, ownedRecipients)) || null;
    const fallbackAgent = assigned || agents.find((agent: any) => ['live', 'testing', 'active'].includes(agent.status)) || agents[0] || null;
    const agent = recipientAgent || fallbackAgent;
    const score = recipientAgent ? 100 : assigned ? 50 : 10;
    candidates.push({ lead, tenant, agent, score });
  }

  const sorted = candidates.filter((candidate) => candidate.tenant).sort((a, b) => b.score - a.score);
  if (!sorted.length) return { ignored: true, reason: 'tenant_not_found' };
  if (sorted.length > 1 && sorted[0].score === sorted[1].score && sorted[0].score < 100) {
    return { ignored: true, reason: 'ambiguous_lead_match' };
  }
  return sorted[0];
}

async function ensureEmailConversation(db: any, tenantId: string, lead: any) {
  const existing = await unwrap(
    await db.database.from('lead_conversations').select('*')
      .eq('tenant_id', tenantId).eq('lead_id', lead.id).eq('channel', 'email').limit(1),
    'Failed to load email conversation'
  );
  if (existing?.[0]) return existing[0];
  const created = await unwrap(
    await db.database.from('lead_conversations').insert([{
      tenant_id: tenantId,
      lead_id: lead.id,
      channel: 'email',
      status: 'active',
      conversation_status: 'lead_replied_email',
    }]).select(),
    'Failed to create email conversation'
  );
  return created?.[0] || null;
}

function emailReplyAllowed(lead: any) {
  if (lead?.do_not_contact) return { allowed: false, reason: 'Lead is marked do not contact' };
  if (lead?.opted_out_at && (!lead.opt_out_channel || lead.opt_out_channel === 'all' || lead.opt_out_channel === 'email')) {
    return { allowed: false, reason: 'Lead opted out of email' };
  }
  return { allowed: true, reason: 'Inbound email reply allowed' };
}

async function loadKnowledgeContext(db: any, tenant: any, agent: any) {
  const excerpts: JsonRecord[] = [];
  const pushRows = (rows: any[], scope: string) => {
    for (const row of rows || []) {
      const body = compactText(row.body_text || '', 1000);
      if (!body) continue;
      excerpts.push({ scope, title: row.title || 'Knowledge note', body });
      if (excerpts.length >= 10) break;
    }
  };

  try {
    const tenantRows = await unwrap(
      await db.database.from('tenant_knowledge_documents').select('title,body_text,source_type,source_url,status,tenant_agent_id')
        .eq('tenant_id', tenant.id).in('status', ['ready', 'uploaded']).limit(12),
      'Failed to load tenant knowledge'
    );
    pushRows((tenantRows || []).filter((row: any) => !row.tenant_agent_id || row.tenant_agent_id === agent?.id), 'tenant');
  } catch {
    // Knowledge should enrich replies, not block inbound email response.
  }

  try {
    const platformRows = await unwrap(
      await db.database.from('platform_knowledge_documents').select('title,scope,niche_key,body_text,source_type,source_url,status')
        .in('status', ['ready', 'uploaded']).limit(30),
      'Failed to load platform knowledge'
    );
    pushRows((platformRows || []).filter((row: any) => row.scope === 'global' || (tenant?.business_niche && row.niche_key === tenant.business_niche)), 'platform');
  } catch {
    // Platform knowledge is optional at runtime.
  }

  return excerpts.slice(0, 10);
}

async function loadRecentEmailMessages(db: any, tenantId: string, leadId: string) {
  try {
    return await unwrap(
      await db.database.from('lead_conversation_messages').select('direction,subject,body_text,status,created_at')
        .eq('tenant_id', tenantId).eq('lead_id', leadId).eq('channel', 'email')
        .order('created_at', { ascending: false }).limit(8),
      'Failed to load recent email messages'
    );
  } catch {
    return [];
  }
}

function leadName(lead: any) {
  return lead?.full_name || [lead?.first_name, lead?.last_name].filter(Boolean).join(' ') || 'there';
}

async function loadBookingIntegration(db: any, tenantId: string) {
  try {
    const rows = await unwrap(
      await db.database.from('tenant_booking_integrations').select('provider,status,booking_url,default_meeting_type,metadata')
        .eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(10),
      'Failed to load booking integration'
    );
    return (rows || []).find((row: any) => row.status === 'connected' && row.booking_url) || (rows || []).find((row: any) => row.booking_url) || null;
  } catch {
    return null;
  }
}

function locationTextForTimezone(lead: any, tenant: any) {
  const imported = lead?.custom_fields?.importedLeadData || {};
  return [
    lead?.location_summary,
    imported.location,
    imported.city,
    imported.state,
    imported.province,
    imported.country,
    tenant?.default_timezone,
  ].filter(Boolean).join(' ').toLowerCase();
}

function inferTimezoneFromLead(lead: any, tenant: any) {
  const text = locationTextForTimezone(lead, tenant);
  if (text.includes('sarnia') || text.includes('toronto') || text.includes('ontario') || text.includes(' on ') || text.includes('canada')) return 'America/Toronto';
  if (text.includes('vancouver') || text.includes('british columbia') || text.includes(' bc ')) return 'America/Vancouver';
  if (text.includes('calgary') || text.includes('edmonton') || text.includes('alberta') || text.includes(' ab ')) return 'America/Edmonton';
  if (text.includes('winnipeg') || text.includes('manitoba') || text.includes(' mb ')) return 'America/Winnipeg';
  if (text.includes('halifax') || text.includes('nova scotia') || text.includes(' ns ')) return 'America/Halifax';
  if (text.includes('newfoundland') || text.includes('st. john')) return 'America/St_Johns';
  if (text.includes('new york') || text.includes('florida') || text.includes('georgia') || text.includes('usa')) return 'America/New_York';
  if (text.includes('chicago') || text.includes('texas') || text.includes('illinois')) return 'America/Chicago';
  if (text.includes('denver') || text.includes('colorado')) return 'America/Denver';
  if (text.includes('los angeles') || text.includes('california') || text.includes('seattle') || text.includes('washington')) return 'America/Los_Angeles';
  return tenant?.default_timezone || 'UTC';
}

function timezoneOffsetMs(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).reduce((acc: JsonRecord, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - date.getTime();
}

function zonedLocalToUtc(dateLocal: string, timeLocal: string, timezone: string) {
  const [year, month, day] = String(dateLocal).split('-').map(Number);
  const [hour, minute] = String(timeLocal).split(':').map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  let utc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  for (let index = 0; index < 3; index += 1) {
    utc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0) - timezoneOffsetMs(utc, timezone));
  }
  return utc;
}

function localDateYmd(timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date()).reduce((acc: JsonRecord, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function bookingMeetingLink(booking: any) {
  return firstValue(
    booking?.metadata?.meetingLink,
    booking?.metadata?.meeting_link,
    booking?.metadata?.meetingUrl,
    booking?.metadata?.meeting_url,
    booking?.booking_url
  ) || null;
}

async function analyzeInboundBookingReply(input: {
  tenant: any;
  lead: any;
  inbound: ReturnType<typeof inboundFields>;
  timezone: string;
}) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return { intent: 'other', confidence: 0, missing: ['date_time'], reason: 'OPENAI_API_KEY is not configured' };
  const model = Deno.env.get('OPENAI_EMAIL_MODEL') || 'gpt-5.5';
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      instructions: [
        'Extract whether this inbound email clearly confirms a meeting date and time.',
        'Use the provided lead timezone/location; do not ask for timezone.',
        'If date and time are both clear, return intent confirm_booking with dateLocal YYYY-MM-DD and timeLocal HH:mm in 24-hour local time.',
        'If either date or time is missing/vague, return needs_more_info and identify only the missing date/time fields.',
        'If it is not a booking confirmation, return other.',
        'Resolve relative dates like tomorrow/Friday using currentDate in the provided timezone.',
      ].join(' '),
      input: JSON.stringify({
        currentDate: localDateYmd(input.timezone),
        timezone: input.timezone,
        lead: {
          name: leadName(input.lead),
          location: input.lead?.location_summary || null,
          preferredMeetingWindow: input.lead?.preferred_meeting_window || null,
        },
        tenant: { name: input.tenant?.name || null, defaultTimezone: input.tenant?.default_timezone || null },
        inboundEmail: { subject: input.inbound.subject || null, body: compactText(input.inbound.text, 4000) },
      }),
      text: {
        format: {
          type: 'json_schema',
          name: 'inbound_booking_reply_analysis',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['intent', 'confidence', 'dateLocal', 'timeLocal', 'durationMinutes', 'missing', 'reason'],
            properties: {
              intent: { type: 'string', enum: ['confirm_booking', 'needs_more_info', 'other'] },
              confidence: { type: 'number' },
              dateLocal: { type: ['string', 'null'] },
              timeLocal: { type: ['string', 'null'] },
              durationMinutes: { type: ['number', 'null'] },
              missing: { type: 'array', items: { type: 'string', enum: ['date', 'time'] } },
              reason: { type: 'string' },
            },
          },
        },
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { intent: 'other', confidence: 0, missing: ['date_time'], reason: data?.error?.message || `OpenAI analysis failed with ${response.status}` };
  try {
    return JSON.parse(extractOutputText(data) || '{}');
  } catch {
    return { intent: 'other', confidence: 0, missing: ['date_time'], reason: 'OpenAI returned invalid booking analysis' };
  }
}

function extractOutputText(response: any) {
  if (response?.output_text) return response.output_text;
  return (response?.output || []).flatMap((item: any) => item?.content || [])
    .filter((content: any) => content?.type === 'output_text')
    .map((content: any) => content.text)
    .join('');
}

async function draftEmailReply(db: any, input: {
  tenant: any;
  agent: any;
  lead: any;
  inbound: ReturnType<typeof inboundFields>;
  confirmedBooking?: any;
}) {
  if (input.confirmedBooking?.meeting) {
    const agentName = input.agent?.display_name || 'Joy';
    const tenantName = input.tenant?.name || 'our team';
    const timezone = input.confirmedBooking.meeting.timezone || input.tenant?.default_timezone || 'UTC';
    const start = new Date(input.confirmedBooking.meeting.start_time);
    const friendlyTime = start.toLocaleString('en-US', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' });
    const meetingUrl = input.confirmedBooking.meeting.meeting_url || input.confirmedBooking.meeting.location || '';
    const subject = `Confirmed: your appointment on ${friendlyTime}`;
    const text = [
      `Hi ${leadName(input.lead)},`,
      `Perfect — I’ve confirmed your appointment with ${tenantName} for ${friendlyTime}.`,
      meetingUrl ? `Meeting link: ${meetingUrl}` : 'The meeting link will be shared before the appointment.',
      'I’ll also send you a reminder before the appointment.',
      `Thank you,\n${agentName}`,
    ].filter(Boolean).join('\n\n');
    const html = [
      `<p>Hi ${escapeHtml(leadName(input.lead))},</p>`,
      `<p>Perfect — I’ve confirmed your appointment with ${escapeHtml(tenantName)} for <strong>${escapeHtml(friendlyTime)}</strong>.</p>`,
      meetingUrl ? `<p>Meeting link: <a href="${escapeHtml(meetingUrl)}">${escapeHtml(meetingUrl)}</a></p>` : '<p>The meeting link will be shared before the appointment.</p>',
      '<p>I’ll also send you a reminder before the appointment.</p>',
      `<p>Thank you,<br>${escapeHtml(agentName)}</p>`,
    ].filter(Boolean).join('');
    return {
      subject,
      text,
      html,
      model: 'deterministic-email-booking-confirmation',
      responseId: null,
      generatedBy: 'template',
      bookingConfirmed: true,
      meetingId: input.confirmedBooking.meeting.id,
    };
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  const model = Deno.env.get('OPENAI_EMAIL_MODEL') || 'gpt-5.5';
  const [knowledge, recentMessages, booking] = await Promise.all([
    loadKnowledgeContext(db, input.tenant, input.agent),
    loadRecentEmailMessages(db, input.tenant.id, input.lead.id),
    loadBookingIntegration(db, input.tenant.id),
  ]);
  const preferredLanguage = input.lead?.preferred_language || null;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      instructions: [
        'You are an automated email assistant for a service business.',
        'Return only valid JSON with keys subject, text, and html.',
        'The reply is sent automatically, so be accurate, concise, and helpful.',
        'Primary goal: answer the lead if the answer is known, then move toward booking a consultation/call as quickly as possible.',
        'Do not ask long qualification questions when the lead already provided useful context.',
        'If the lead gave a date or time but not both, ask only for the missing date or time. Do not ask for timezone; use the lead location already in context.',
        'Never invent prices, promises, availability, policies, discounts, or booking links.',
        'If exact information is missing, say that the team can confirm details on the call and offer the next booking step.',
        'Use only simple safe HTML tags: p, strong, em, ul, li, a, br.',
        preferredLanguage ? `Write the reply in ${preferredLanguage}.` : '',
      ].filter(Boolean).join(' '),
      input: JSON.stringify({
        tenant: {
          name: input.tenant?.name || null,
          industry: input.tenant?.industry || null,
          businessNiche: input.tenant?.business_niche || null,
        },
        agent: { name: input.agent?.display_name || 'Bob' },
        lead: {
          name: leadName(input.lead),
          email: input.lead?.email || null,
          serviceInterest: input.lead?.service_interest || null,
          preferredContactChannel: input.lead?.preferred_contact_channel || null,
          preferredMeetingWindow: input.lead?.preferred_meeting_window || null,
          location: input.lead?.location_summary || null,
          qualificationStatus: input.lead?.qualification_status || null,
          qualificationNotes: input.lead?.qualification_notes || null,
          customFields: input.lead?.custom_fields || null,
        },
        booking: {
          provider: booking?.provider || null,
          bookingUrl: booking?.booking_url || null,
          defaultMeetingType: booking?.default_meeting_type || null,
        },
        inboundEmail: {
          subject: input.inbound.subject || null,
          body: compactText(input.inbound.text, 7000),
        },
        recentEmailTimeline: (recentMessages || []).reverse().map((message: any) => ({
          direction: message.direction,
          subject: message.subject,
          body: compactText(message.body_text, 900),
          status: message.status,
        })),
        knowledge,
      }),
      text: {
        format: {
          type: 'json_schema',
          name: 'automated_inbound_email_reply',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['subject', 'text', 'html'],
            properties: {
              subject: { type: 'string' },
              text: { type: 'string' },
              html: { type: 'string' },
            },
          },
        },
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `OpenAI inbound email reply failed with ${response.status}`);
  let draft: any;
  try {
    draft = JSON.parse(extractOutputText(data));
  } catch {
    throw new Error('OpenAI returned an invalid inbound email draft');
  }
  if (!draft?.subject || !draft?.text || !draft?.html) throw new Error('OpenAI returned an incomplete inbound email draft');
  return { subject: draft.subject, text: draft.text, html: draft.html, model, responseId: data.id || null, generatedBy: 'openai' };
}

function fallbackDraft(input: { tenant: any; agent: any; lead: any; inbound: ReturnType<typeof inboundFields>; error?: unknown }) {
  const agentName = input.agent?.display_name || 'Bob';
  const tenantName = input.tenant?.name || 'our team';
  const subject = input.inbound.subject ? `Re: ${input.inbound.subject.replace(/^re:\s*/i, '')}` : `Re: Your message`;
  const text = [
    `Hi ${leadName(input.lead)},`,
    `Thanks for your message. This is ${agentName} from ${tenantName}. I can help you move this forward and book the best time for a quick call.`,
    input.lead?.preferred_meeting_window
      ? `I saw your preferred time is ${input.lead.preferred_meeting_window}. Does that still work?`
      : `What day and time works best for you?`,
    `Thank you.`,
  ].join('\n\n');
  const html = text.split('\n\n').map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('');
  return {
    subject,
    text,
    html,
    model: 'deterministic-inbound-email-fallback',
    responseId: null,
    generatedBy: 'template',
    generationError: safeError(input.error),
  };
}

async function sendViaResend(input: {
  sender: ReturnType<typeof senderForAgent>;
  to: string;
  draft: any;
  inbound: ReturnType<typeof inboundFields>;
}) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');
  const references = [input.inbound.references, input.inbound.messageId].filter(Boolean).join(' ').trim();
  const headers: JsonRecord = {};
  if (input.inbound.messageId) headers['In-Reply-To'] = input.inbound.messageId;
  if (references) headers.References = references;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: input.sender.from,
      to: [input.to],
      subject: input.draft.subject,
      html: input.draft.html,
      text: input.draft.text,
      reply_to: input.sender.fromEmail,
      headers: Object.keys(headers).length ? headers : undefined,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || data?.error || `Resend send failed with ${response.status}`);
  return data;
}

async function recordInbound(db: any, input: {
  tenantId: string;
  lead: any;
  conversation: any;
  inbound: ReturnType<typeof inboundFields>;
  event: JsonRecord;
}) {
  const providerId = input.inbound.providerEmailId || input.inbound.messageId || null;
  if (providerId) {
    const duplicate = await unwrap(
      await db.database.from('lead_conversation_messages').select('id').eq('tenant_id', input.tenantId).eq('provider_message_id', providerId).limit(1),
      'Failed to check duplicate inbound email'
    );
    if (duplicate?.[0]) return { message: duplicate[0], duplicate: true };
  }
  const rows = await unwrap(
    await db.database.from('lead_conversation_messages').insert([{
      tenant_id: input.tenantId,
      conversation_id: input.conversation?.id || null,
      lead_id: input.lead.id,
      direction: 'inbound',
      channel: 'email',
      message_type: 'email_reply',
      subject: input.inbound.subject || null,
      body_text: input.inbound.text || null,
      body_html: input.inbound.html || null,
      provider_message_id: providerId,
      provider_status: 'received',
      status: 'received',
      metadata: {
        source: 'resend_inbound',
        resendEmailId: input.inbound.providerEmailId || null,
        resendEventId: input.event?.id || null,
        from: input.inbound.from,
        to: input.inbound.to,
        cc: input.inbound.cc,
        messageId: input.inbound.messageId || null,
        attachmentsCount: input.inbound.attachmentsCount,
      },
    }]).select(),
    'Failed to record inbound email'
  );
  return { message: rows?.[0] || null, duplicate: false };
}

async function recordOutbound(db: any, input: {
  tenantId: string;
  lead: any;
  conversation: any;
  inboundMessageId?: string | null;
  sender: ReturnType<typeof senderForAgent>;
  draft: any;
  resend: any;
}) {
  const emailRows = await unwrap(
    await db.database.from('email_queue').insert([{
      tenant_id: input.tenantId,
      lead_id: input.lead.id,
      to_email: input.lead.email,
      from_email: input.sender.fromEmail,
      sender_display_name: input.sender.fromName,
      reply_to_email: input.sender.fromEmail,
      sender_resolution: 'platform_fallback',
      delivery_provider: 'resend',
      provider_message_id: input.resend?.id || null,
      message_id: input.resend?.id || null,
      subject: input.draft.subject,
      html_content: input.draft.html,
      text_content: input.draft.text,
      email_type: 'inbound_reply',
      status: 'sent',
      sent_at: nowIso(),
      generated_by: input.draft.generatedBy || 'openai',
      generation_model: input.draft.model || null,
      generation_status: input.draft.generationError ? 'failed' : 'generated',
      generation_error: input.draft.generationError || null,
      generated_at: nowIso(),
      metadata: {
        source: 'resend_inbound_auto_reply',
        openaiResponseId: input.draft.responseId || null,
        resend: input.resend || null,
        conversationId: input.conversation?.id || null,
        replyToLeadMessageId: input.inboundMessageId || null,
      },
    }]).select(),
    'Failed to record outbound email queue row'
  );
  const messageRows = await unwrap(
    await db.database.from('lead_conversation_messages').insert([{
      tenant_id: input.tenantId,
      conversation_id: input.conversation?.id || null,
      lead_id: input.lead.id,
      direction: 'outbound',
      channel: 'email',
      message_type: 'email_auto_reply',
      subject: input.draft.subject,
      body_text: input.draft.text,
      body_html: input.draft.html,
      provider_message_id: input.resend?.id || null,
      provider_status: 'sent',
      status: 'sent',
      sent_at: nowIso(),
      reply_to_message_id: input.inboundMessageId || null,
      ai_model: input.draft.model || null,
      ai_response_id: input.draft.responseId || null,
      metadata: {
        source: 'resend_inbound_auto_reply',
        from: input.sender.fromEmail,
        emailQueueId: emailRows?.[0]?.id || null,
      },
    }]).select(),
    'Failed to record outbound email timeline row'
  );
  return { queued: emailRows?.[0] || null, message: messageRows?.[0] || null };
}

async function upsertEmailReplyThread(db: any, input: {
  tenantId: string;
  lead: any;
  agent?: any;
  conversation: any;
  inbound: ReturnType<typeof inboundFields>;
  inboundMessageId?: string | null;
}) {
  const providerMessageId = input.inbound.providerEmailId || null;
  const messageIdHeader = input.inbound.messageId || null;
  let existing: any[] = [];
  if (providerMessageId) {
    existing = await unwrap(
      await db.database.from('email_reply_threads').select('*')
        .eq('tenant_id', input.tenantId)
        .eq('provider_message_id', providerMessageId)
        .limit(1),
      'Failed to inspect existing email reply thread'
    ) || [];
  }
  if (!existing.length && messageIdHeader) {
    existing = await unwrap(
      await db.database.from('email_reply_threads').select('*')
        .eq('tenant_id', input.tenantId)
        .eq('message_id_header', messageIdHeader)
        .limit(1),
      'Failed to inspect existing email reply thread'
    ) || [];
  }

  const row = {
    tenant_id: input.tenantId,
    lead_id: input.lead?.id || null,
    conversation_id: input.conversation?.id || null,
    assigned_tenant_agent_id: input.agent?.id || input.lead?.assigned_tenant_agent_id || null,
    last_inbound_message_id: input.inboundMessageId || null,
    from_email: input.inbound.from,
    to_email: input.inbound.to?.[0] || '',
    subject: input.inbound.subject || null,
    provider_thread_id: input.inbound.references || input.inbound.messageId || providerMessageId,
    provider_message_id: providerMessageId,
    message_id_header: messageIdHeader,
    references_header: input.inbound.references || null,
    status: 'pending',
    response_status: 'responding',
    response_mode: 'ai_auto',
    last_received_at: nowIso(),
    response_error: null,
    metadata: {
      source: 'resend_inbound',
      cc: input.inbound.cc,
      attachmentsCount: input.inbound.attachmentsCount,
    },
    updated_at: nowIso(),
  };

  if (existing?.[0]) {
    const updated = await unwrap(
      await db.database.from('email_reply_threads').update(row)
        .eq('tenant_id', input.tenantId)
        .eq('id', existing[0].id)
        .select(),
      'Failed to update email reply thread'
    );
    return updated?.[0] || existing[0];
  }

  const inserted = await unwrap(
    await db.database.from('email_reply_threads').insert([row]).select(),
    'Failed to create email reply thread'
  );
  return inserted?.[0] || null;
}

async function markEmailReplyThreadResponded(db: any, input: {
  tenantId: string;
  threadId?: string | null;
  outbound?: { queued?: any; message?: any } | null;
  error?: unknown;
}) {
  if (!input.threadId) return null;
  const failed = Boolean(input.error);
  const rows = await unwrap(
    await db.database.from('email_reply_threads').update({
      status: failed ? 'failed' : 'responded',
      response_status: failed ? 'failed' : 'responded',
      last_outbound_message_id: failed ? null : input.outbound?.message?.id || null,
      last_email_queue_id: failed ? null : input.outbound?.queued?.id || null,
      last_responded_at: failed ? null : nowIso(),
      response_error: failed ? safeError(input.error) : null,
      updated_at: nowIso(),
    }).eq('tenant_id', input.tenantId).eq('id', input.threadId).select(),
    'Failed to update email reply thread response status'
  );
  return rows?.[0] || null;
}

async function createConfirmedMeetingFromInbound(db: any, input: {
  tenant: any;
  lead: any;
  agent?: any;
  inbound: ReturnType<typeof inboundFields>;
  inboundMessageId?: string | null;
}) {
  const timezone = inferTimezoneFromLead(input.lead, input.tenant);
  const analysis = await analyzeInboundBookingReply({ tenant: input.tenant, lead: input.lead, inbound: input.inbound, timezone });
  if (analysis?.intent !== 'confirm_booking' || !analysis.dateLocal || !analysis.timeLocal || Number(analysis.confidence || 0) < 0.65) {
    return { booked: false, analysis, timezone };
  }

  const start = zonedLocalToUtc(String(analysis.dateLocal), String(analysis.timeLocal), timezone);
  if (!start || Number.isNaN(start.getTime()) || start.getTime() <= Date.now()) {
    return { booked: false, analysis: { ...analysis, reason: 'Parsed meeting time is invalid or in the past' }, timezone };
  }

  const existing = await unwrap(
    await db.database.from('meetings').select('*')
      .eq('tenant_id', input.tenant.id)
      .eq('lead_id', input.lead.id)
      .in('status', ['scheduled', 'confirmed'])
      .gte('start_time', new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .order('start_time', { ascending: true })
      .limit(1),
    'Failed to inspect existing lead meetings'
  );
  if (existing?.[0]) return { booked: true, meeting: existing[0], existing: true, analysis, timezone };

  const booking = await loadBookingIntegration(db, input.tenant.id);
  const meetingUrl = bookingMeetingLink(booking);
  const durationMinutes = Math.min(Math.max(Number(analysis.durationMinutes || 30), 15), 180);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  const title = input.lead?.service_interest || `Consultation with ${leadName(input.lead)}`;
  const rows = await unwrap(
    await db.database.from('meetings').insert([{
      tenant_id: input.tenant.id,
      lead_id: input.lead.id,
      meeting_type: 'consultation',
      title,
      description: `Confirmed by inbound email reply from ${input.inbound.from}.`,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      timezone,
      status: 'scheduled',
      meeting_url: meetingUrl,
      location: meetingUrl,
      attendee_email: input.lead.email || input.inbound.from,
      attendee_name: leadName(input.lead),
      attendee_phone: input.lead.phone || null,
      metadata: {
        source: 'resend_inbound_email_booking',
        tenantAgentId: input.agent?.id || input.lead.assigned_tenant_agent_id || null,
        leadLocation: input.lead.location_summary || null,
        inferredTimezone: timezone,
        inboundMessageId: input.inboundMessageId || null,
        bookingAnalysis: analysis,
        bookingProvider: booking?.provider || null,
        configuredMeetingLink: meetingUrl,
      },
    }]).select(),
    'Failed to create inbound email booking'
  );
  const meeting = rows?.[0] || null;

  await db.database.from('leads').update({
    status: 'booked',
    meeting_scheduled: true,
    scheduling_state: 'scheduled',
    scheduled_at: start.toISOString(),
    meeting_end_time: end.toISOString(),
    meeting_location: meetingUrl,
    preferred_contact_channel: 'email',
    updated_at: nowIso(),
  }).eq('tenant_id', input.tenant.id).eq('id', input.lead.id);

  const reminderRows = [
    { hours: 24, method: 'email' },
    { hours: 24, method: 'sms' },
    { hours: 1, method: 'sms' },
  ].map((reminder) => {
    const scheduledFor = new Date(start.getTime() - reminder.hours * 60 * 60 * 1000);
    const hasConsent = reminder.method === 'email'
      ? Boolean(input.lead.email && input.lead.email_consent && !input.lead.do_not_contact)
      : Boolean(input.lead.phone && input.lead.sms_consent && !input.lead.do_not_contact);
    return {
      tenant_id: input.tenant.id,
      meeting_id: meeting?.id || null,
      reminder_type: `${reminder.hours}h`,
      delivery_method: reminder.method,
      scheduled_for: scheduledFor.toISOString(),
      status: scheduledFor.getTime() > Date.now() && hasConsent ? 'pending' : 'skipped',
      error_message: hasConsent ? null : `Missing ${reminder.method} consent or contact details`,
    };
  });
  if (meeting?.id) {
    await unwrap(await db.database.from('meeting_reminders').insert(reminderRows), 'Failed to schedule inbound email booking reminders');
  }

  return {
    booked: true,
    meeting,
    existing: false,
    analysis,
    timezone,
    meetingUrl,
    remindersScheduled: reminderRows.filter((row) => row.status === 'pending').length,
  };
}

async function processInboundEmail(db: any, event: JsonRecord) {
  const emailId = eventEmailId(event);
  if (!emailId) return { ignored: true, reason: 'missing_email_id' };
  const received = await fetchReceivedEmail(emailId);
  const inbound = inboundFields(event, received);
  const resolved = await resolveInboundContext(db, inbound);
  if ((resolved as JsonRecord).ignored) return resolved;

  const { lead, tenant, agent } = resolved as JsonRecord;
  const policy = emailReplyAllowed(lead);
  if (!policy.allowed) return { ignored: true, reason: policy.reason };
  const conversation = await ensureEmailConversation(db, tenant.id, lead);
  const inboundRecord = await recordInbound(db, { tenantId: tenant.id, lead, conversation, inbound, event });
  if (inboundRecord.duplicate) return { success: true, duplicate: true, leadId: lead.id, tenantId: tenant.id };
  const replyThread = await upsertEmailReplyThread(db, {
    tenantId: tenant.id,
    lead,
    agent,
    conversation,
    inbound,
    inboundMessageId: inboundRecord.message?.id || null,
  });

  const now = nowIso();
  await db.database.from('lead_conversations').update({
    conversation_status: 'lead_replied_email',
    next_action: 'resend_inbound_auto_reply',
    human_review_required: false,
    last_inbound_at: now,
    last_intent: 'email_reply',
    last_intent_at: now,
    last_summary: `Lead replied by email: ${compactText(inbound.subject || inbound.text, 180)}`,
    updated_at: now,
  }).eq('tenant_id', tenant.id).eq('id', conversation.id);

  let confirmedBooking: any = null;
  try {
    const bookingResult = await createConfirmedMeetingFromInbound(db, {
      tenant,
      lead,
      agent,
      inbound,
      inboundMessageId: inboundRecord.message?.id || null,
    });
    if (bookingResult.booked) confirmedBooking = bookingResult;
  } catch (error) {
    await db.database.from('email_reply_threads').update({
      response_status: 'manual_review',
      response_error: safeError(error),
      metadata: {
        ...(replyThread?.metadata || {}),
        bookingAutomationError: safeError(error),
      },
      updated_at: nowIso(),
    }).eq('tenant_id', tenant.id).eq('id', replyThread?.id || '');
  }

  let draft;
  try {
    draft = await draftEmailReply(db, { tenant, agent, lead, inbound, confirmedBooking });
  } catch (error) {
    draft = fallbackDraft({ tenant, agent, lead, inbound, error });
  }

  const sender = senderForAgent(agent);
  let outbound;
  let resend;
  try {
    resend = await sendViaResend({ sender, to: lead.email, draft, inbound });
    outbound = await recordOutbound(db, {
      tenantId: tenant.id,
      lead,
      conversation,
      inboundMessageId: inboundRecord.message?.id || null,
      sender,
      draft,
      resend,
    });
    await markEmailReplyThreadResponded(db, { tenantId: tenant.id, threadId: replyThread?.id || null, outbound });
  } catch (error) {
    await markEmailReplyThreadResponded(db, { tenantId: tenant.id, threadId: replyThread?.id || null, error });
    throw error;
  }

  await db.database.from('lead_conversations').update({
    conversation_status: confirmedBooking?.booked ? 'email_booking_confirmed' : 'auto_replied_email',
    next_action: confirmedBooking?.booked ? 'send_meeting_reminders' : 'await_lead_email_reply',
    human_review_required: false,
    last_outbound_at: nowIso(),
    updated_at: nowIso(),
  }).eq('tenant_id', tenant.id).eq('id', conversation.id);
  const leadPatch: JsonRecord = {
    last_contacted_at: nowIso(),
    preferred_contact_channel: 'email',
    updated_at: nowIso(),
  };
  if (confirmedBooking?.booked) {
    leadPatch.status = 'booked';
    leadPatch.meeting_scheduled = true;
    leadPatch.scheduling_state = 'scheduled';
  }
  await db.database.from('leads').update(leadPatch).eq('tenant_id', tenant.id).eq('id', lead.id);

  return {
    success: true,
    tenantId: tenant.id,
    leadId: lead.id,
    agentId: agent?.id || null,
    inboundMessageId: inboundRecord.message?.id || null,
    outboundMessageId: outbound.message?.id || null,
    meetingId: confirmedBooking?.meeting?.id || null,
    remindersScheduled: confirmedBooking?.remindersScheduled || 0,
    providerMessageId: resend?.id || null,
    draft: { model: draft.model, generatedBy: draft.generatedBy, fallback: draft.generatedBy === 'template' },
    sender: { fromEmail: sender.fromEmail },
  };
}

export default async function(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method === 'GET') {
    return jsonResponse({
      success: true,
      service: 'resend-email-webhook',
      actions: ['email.received'],
      configured: {
        resendApi: Boolean(Deno.env.get('RESEND_API_KEY')),
        resendWebhookSecret: Boolean(Deno.env.get('RESEND_WEBHOOK_SECRET')),
        openai: Boolean(Deno.env.get('OPENAI_API_KEY')),
        senderDomain: emailDomain(Deno.env.get('EMAIL_FROM')) || null,
        inboundDomains: configuredInboundDomains(),
      },
    });
  }

  try {
    const rawBody = await req.text();
    await verifyResendWebhook(req, rawBody);
    const event = JSON.parse(rawBody || '{}');
    if (event?.type && event.type !== 'email.received') {
      return jsonResponse({ success: true, ignored: true, reason: 'unsupported_event_type', type: event.type });
    }
    const db = createInsForgeClient();
    const result = await processInboundEmail(db, event);
    return jsonResponse(result);
  } catch (error) {
    const message = safeError(error);
    const status = /signature|unauthorized|secret|timestamp/i.test(message) ? 401 : 500;
    return jsonResponse({ success: false, error: message }, status);
  }
}

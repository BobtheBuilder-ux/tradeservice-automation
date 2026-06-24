import { createClient } from 'npm:@insforge/sdk';

const EMAIL_ACTIONS = ['send-email', 'queue-email', 'send-template-email', 'send-booking-confirmation', 'send-reminder'];
type JsonRecord = Record<string, any>;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
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

function deliverySecret() {
  return Deno.env.get('EMAIL_ACTIONS_SECRET') || Deno.env.get('ELEVENLABS_TOOL_SECRET') || '';
}

function bearerToken(value: string | null) {
  if (!value) return '';
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : value.trim();
}

function assertDeliveryAuthorized(req: Request) {
  const expected = deliverySecret();
  if (!expected) throw new Error('Email delivery authorization is not configured');
  const provided = req.headers.get('x-email-actions-secret')
    || req.headers.get('x-elevenlabs-tool-secret')
    || bearerToken(req.headers.get('authorization'));
  if (provided !== expected) {
    return jsonResponse({ success: false, error: 'Unauthorized email action' }, 401);
  }
  return null;
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function leadServiceInterest(lead: any, input: any = {}) {
  const imported = lead?.custom_fields?.importedLeadData || {};
  return firstValue(
    lead?.service_interest,
    lead?.service,
    lead?.interest,
    imported.service_interest,
    imported.service,
    imported.interest,
    imported.coverage_type_needed,
    input.serviceInterest,
    input.service_interest,
    input.coverage_type_needed,
    'insurance coverage'
  );
}

function requiredTenantId(input: any) {
  const tenantId = firstValue(input?.tenantId, input?.tenant_id);
  if (!tenantId) throw new Error('tenantId is required');
  return String(tenantId);
}

function escapeHtml(value: unknown) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function compactText(value: unknown, maxLength = 1200) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function renderTemplate(template = '', variables: Record<string, unknown> = {}) {
  return template.replace(/{{\s*([\w.]+)\s*}}/g, (_match, key) => {
    const value = key.split('.').reduce((current: any, part: string) => current?.[part], variables);
    return value === undefined || value === null ? '' : String(value);
  });
}

async function loadSingle(client: any, table: string, tenantId: string, id?: string | null) {
  if (!id) return null;
  const { data, error } = await client.database.from(table).select('*').eq('tenant_id', tenantId).eq('id', id).limit(1);
  if (error) throw new Error(error.message || `Failed to load ${table}`);
  return data?.[0] || null;
}

function isRunnableEmailAgent(agent: any) {
  return Boolean(agent?.id && ['live', 'testing', 'active'].includes(String(agent.status || '').toLowerCase()));
}

async function loadDefaultEmailAgent(client: any, tenantId: string) {
  const { data, error } = await client.database
    .from('tenant_agents')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('status', ['live', 'testing', 'active'])
    .order('status', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(10);
  if (error) throw new Error(error.message || 'Failed to load default tenant email agent');
  return (data || []).find(isRunnableEmailAgent) || data?.[0] || null;
}

async function loadEmailContext(client: any, tenantId: string, input: any) {
  const requestedAgentId = firstValue(input.tenantAgentId, input.tenant_agent_id, input.agentId, input.agent_id);
  const [tenantResult, lead, requestedAgent] = await Promise.all([
    client.database.from('tenants').select('*').eq('id', tenantId).limit(1),
    loadSingle(client, 'leads', tenantId, firstValue(input.leadId, input.lead_id)),
    loadSingle(client, 'tenant_agents', tenantId, requestedAgentId),
  ]);
  if (tenantResult.error) throw new Error(tenantResult.error.message || 'Failed to load tenant for email');
  const assignedAgent = !requestedAgent && lead?.assigned_tenant_agent_id
    ? await loadSingle(client, 'tenant_agents', tenantId, lead.assigned_tenant_agent_id)
    : null;
  const agent = requestedAgent || assignedAgent || await loadDefaultEmailAgent(client, tenantId);
  const tenant = tenantResult.data?.[0] || null;
  const knowledgeContext = await loadKnowledgeContext(client, tenant, agent).catch(() => []);
  return { tenant, lead, agent, knowledgeContext };
}

function knowledgeExcerpt(row: JsonRecord, scope: string) {
  const body = compactText(row.body_text || row.metadata?.extractedText || row.metadata?.extracted_text || '', 1200);
  const reference = !body && row.source_url ? `Reference URL: ${row.source_url}` : '';
  const fileReference = !body && (row.metadata?.originalFileName || row.storage_key)
    ? `Uploaded document reference: ${row.metadata?.originalFileName || row.storage_key}`
    : '';
  const content = body || reference || fileReference;
  if (!content) return null;
  return {
    scope,
    title: row.title || 'Knowledge document',
    sourceType: row.source_type || null,
    content,
    hasExcerpt: Boolean(body),
  };
}

async function loadKnowledgeContext(client: any, tenant: any, agent: any) {
  if (!tenant?.id) return [];
  const excerpts: JsonRecord[] = [];
  const addRows = (rows: any[], scope: string) => {
    for (const row of rows || []) {
      const excerpt = knowledgeExcerpt(row, scope);
      if (excerpt) excerpts.push(excerpt);
      if (excerpts.length >= 12) break;
    }
  };

  try {
    const { data } = await client.database
      .from('tenant_knowledge_documents')
      .select('title,body_text,source_type,source_url,storage_key,status,tenant_agent_id,metadata,updated_at')
      .eq('tenant_id', tenant.id)
      .in('status', ['ready', 'uploaded'])
      .order('updated_at', { ascending: false })
      .limit(20);
    addRows((data || []).filter((row: any) => !row.tenant_agent_id || row.tenant_agent_id === agent?.id), 'tenant');
  } catch {
    // Knowledge enriches copy, but delivery should not fail when context lookup is unavailable.
  }

  try {
    const assignmentResult = await client.database
      .from('tenant_knowledge_assignments')
      .select('platform_knowledge_document_id')
      .eq('tenant_id', tenant.id)
      .eq('status', 'active')
      .or(agent?.id ? `tenant_agent_id.is.null,tenant_agent_id.eq.${agent.id}` : 'tenant_agent_id.is.null')
      .limit(100);
    const assignedIds = [...new Set((assignmentResult.data || []).map((row: any) => row.platform_knowledge_document_id).filter(Boolean))];
    const platformResult = await client.database
      .from('platform_knowledge_documents')
      .select('id,title,scope,niche_key,body_text,source_type,source_url,storage_key,status,metadata,updated_at')
      .in('status', ['ready', 'uploaded'])
      .order('updated_at', { ascending: false })
      .limit(80);
    const platformRows = (platformResult.data || []).filter((row: any) => (
      row.scope === 'global'
      || (tenant.business_niche && row.scope === 'niche' && row.niche_key === tenant.business_niche)
      || assignedIds.includes(row.id)
    ));
    addRows(platformRows, 'platform');
  } catch {
    // Platform knowledge is optional runtime context.
  }

  return excerpts.slice(0, 12);
}

async function assertEmailAllowed(lead: any) {
  if (!lead) return;
  if (lead.do_not_contact) throw new Error('Lead is marked do not contact');
  if (lead.opted_out_at && (!lead.opt_out_channel || lead.opt_out_channel === 'all' || lead.opt_out_channel === 'email')) {
    throw new Error('Lead opted out of email');
  }
  if (!lead.email_consent) throw new Error('Missing email consent');
}

function safeSenderName(value: any) {
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

function platformSender(agent?: any) {
  const fallbackEmail = Deno.env.get('EMAIL_FROM');
  const name = safeSenderName(agent?.display_name) || Deno.env.get('EMAIL_FROM_NAME') || 'Bob Automation';
  if (!fallbackEmail) throw new Error('Platform fallback sender is not configured');
  const [, domain] = String(fallbackEmail).split('@');
  const email = savedAgentEmail(agent) || (domain ? `${agentEmailLocalPart(agent)}@${domain}` : fallbackEmail);
  return { from: `${name} <${email}>`, fromEmail: email, fromName: name, replyTo: null, resolution: 'platform_fallback', identityId: null };
}

async function resolveSender(client: any, tenantId: string, agent?: any) {
  return platformSender(agent);
}

function emailIntent(action: string, input: any) {
  if (action === 'send-booking-confirmation') return 'booking_confirmation';
  if (action === 'send-reminder') return 'booking_reminder';
  return String(firstValue(input.emailType, input.email_type, 'follow_up'));
}

function buildDraftInstructions(action: string, context: any, input: any) {
  const intent = emailIntent(action, input);
  const interest = leadServiceInterest(context.lead, input);
  return {
    role: 'system',
    content: `You write concise, accurate automated business emails. Return only valid JSON with keys subject, text, and html. Use the provided knowledgeContext as source-of-truth context for company services, policies, objections, offers, qualification guidance, and booking rules. If a knowledge item is only a file or URL reference without an excerpt, do not claim details from its unseen contents. Never invent booking details, pricing, promises, or links. Keep the tone warm and professional. If this is a first outreach/follow-up email, behave as the assigned AI agent starting the conversation by email and move quickly toward booking a call; do not imply the lead emailed first. Use this first-outreach intro format: "I’m [agent name]. You filled our form on insurance, and I see you’re interested in [service_interest or coverage_type_needed]. Would you like to book a consultation with one of our experts?" If the lead replies yes later, ask what day and time they will be available. The HTML must use only simple safe tags: p, strong, em, ul, li, a, br.`,
    input: {
      intent,
      tenant: { name: context.tenant?.name || null, industry: context.tenant?.industry || null },
      agent: { name: context.agent?.display_name || null },
      recipient: {
        name: context.lead?.full_name || [context.lead?.first_name, context.lead?.last_name].filter(Boolean).join(' ') || input.leadName || input.name || null,
        email: context.lead?.email || firstValue(input.to, input.toEmail, input.to_email) || null,
        serviceInterest: interest || null,
        importedLeadData: context.lead?.custom_fields?.importedLeadData || null,
        preferredLanguage: context.lead?.preferred_language || input.preferredLanguage || input.preferred_language || null,
      },
      booking: {
        time: firstValue(input.time, input.startTime, input.start_time) || null,
        meetingUrl: firstValue(input.meetingUrl, input.meeting_url, input.bookingUrl, input.booking_url) || null,
        location: input.location || null,
      },
      knowledgeContext: context.knowledgeContext || [],
      requestedMessage: input.message || input.text || input.bodyText || null,
    },
  };
}

function extractOutputText(response: any) {
  if (response?.output_text) return response.output_text;
  return (response?.output || []).flatMap((item: any) => item?.content || [])
    .filter((content: any) => content?.type === 'output_text')
    .map((content: any) => content.text)
    .join('');
}

async function draftWithOpenAI(action: string, context: any, input: any) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  const model = Deno.env.get('OPENAI_EMAIL_MODEL') || 'gpt-5.5';
  const instructions = buildDraftInstructions(action, context, input);
  const preferredLanguage = context.lead?.preferred_language || input.preferredLanguage || input.preferred_language;
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      instructions: `${instructions.content}${preferredLanguage ? ` Write the email in ${preferredLanguage}.` : ''}`,
      input: JSON.stringify(instructions.input),
      text: {
        format: {
          type: 'json_schema',
          name: 'automated_email',
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
  if (!response.ok) throw new Error(data?.error?.message || `OpenAI email draft failed with ${response.status}`);
  const output = extractOutputText(data);
  let draft: any;
  try {
    draft = JSON.parse(output);
  } catch {
    throw new Error('OpenAI returned an invalid email draft');
  }
  if (!draft?.subject || !draft?.text || !draft?.html) throw new Error('OpenAI returned an incomplete email draft');
  return { subject: draft.subject, text: draft.text, html: draft.html, model, responseId: data.id || null };
}

function formatBookingTime(input: any, tenant: any) {
  const raw = firstValue(input.time, input.startTime, input.start_time);
  if (!raw) return null;
  const date = new Date(String(raw));
  if (Number.isNaN(date.getTime())) return String(raw);
  const timezone = input.timezone || tenant?.default_timezone || 'UTC';
  return date.toLocaleString('en-US', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' });
}

function deterministicBookingDraft(action: string, context: any, input: any) {
  if (emailIntent(action, input) !== 'booking_confirmation') return null;
  const recipientName = context.lead?.full_name || [context.lead?.first_name, context.lead?.last_name].filter(Boolean).join(' ') || 'there';
  const service = context.lead?.service_interest || input.serviceInterest || input.service_interest || 'consultation';
  const time = formatBookingTime(input, context.tenant);
  const meetingUrl = firstValue(input.meetingUrl, input.meeting_url) || null;
  const subject = service + ' appointment confirmed';
  const timeText = time ? ' for ' + time : '';
  const text = [
    'Hi ' + recipientName + ',',
    'Your ' + service + ' appointment is confirmed' + timeText + '.',
    meetingUrl ? 'Meeting link: ' + meetingUrl : '',
    'Thank you.',
  ].filter(Boolean).join('\\n\\n');
  const html = [
    '<p>Hi ' + escapeHtml(recipientName) + ',</p>',
    '<p>Your ' + escapeHtml(service) + ' appointment is confirmed' + (time ? ' for <strong>' + escapeHtml(time) + '</strong>' : '') + '.</p>',
    meetingUrl ? '<p>Meeting link: <a href="' + escapeHtml(meetingUrl) + '">' + escapeHtml(meetingUrl) + '</a></p>' : '',
    '<p>Thank you.</p>',
  ].filter(Boolean).join('');
  return { subject, text, html, model: 'deterministic-booking-confirmation', responseId: null, generatedBy: 'template' };
}

async function sendViaResend(input: any, sender: any) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');
  const to = firstValue(input.to, input.toEmail, input.to_email);
  if (!to) throw new Error('Recipient email is required');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: sender.from,
      to: Array.isArray(to) ? to : [to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      reply_to: sender.replyTo || undefined,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || data?.error || `Resend failed with ${response.status}`);
  return data;
}

async function recordDelivery(client: any, tenantId: string, input: any, sender: any, draft: any, resend: any, status = 'sent', generationError: string | null = null) {
  const toEmail = firstValue(input.to, input.toEmail, input.to_email);
  const { data, error } = await client.database.from('email_queue').insert([{
    tenant_id: tenantId,
    lead_id: firstValue(input.leadId, input.lead_id) || null,
    to_email: toEmail,
    from_email: sender.fromEmail,
    sender_identity_id: sender.identityId,
    sender_display_name: sender.fromName,
    reply_to_email: sender.replyTo,
    sender_resolution: sender.resolution,
    delivery_provider: 'resend',
    provider_message_id: resend?.id || null,
    subject: draft?.subject || input.subject || 'Automated email',
    html_content: draft?.html || input.html || `<p>${escapeHtml(input.text || '')}</p>`,
    text_content: draft?.text || input.text || null,
    email_type: emailIntent(input.action || 'send-email', input),
    status,
    sent_at: status === 'sent' ? new Date().toISOString() : null,
    generated_by: draft?.generatedBy || (draft ? 'openai' : null),
    generation_model: draft?.model || null,
    generation_status: generationError ? 'failed' : draft ? 'generated' : 'skipped',
    generation_error: generationError,
    generated_at: draft ? new Date().toISOString() : null,
    scheduled_for: input.scheduledFor || input.scheduled_for || null,
    metadata: { ...(input.metadata || {}), openaiResponseId: draft?.responseId || null, resend: resend || null },
    tracking_id: input.trackingId || input.tracking_id || null,
  }]).select();
  if (error) throw new Error(error.message || 'Failed to record email delivery');
  return data?.[0] || null;
}

async function sendAutomatedEmail(client: any, action: string, input: any) {
  const tenantId = requiredTenantId(input);
  const context = await loadEmailContext(client, tenantId, input);
  await assertEmailAllowed(context.lead);
  const sender = await resolveSender(client, tenantId, context.agent);
  const draft = deterministicBookingDraft(action, context, input) || await draftWithOpenAI(action, context, input);
  const resend = await sendViaResend({ ...input, ...draft }, sender);
  const queued = await recordDelivery(client, tenantId, { ...input, action }, sender, draft, resend);
  return { queued, resend, sender: { resolution: sender.resolution, fromEmail: sender.fromEmail }, draft: { model: draft.model, subject: draft.subject } };
}

async function queueEmailIntent(client: any, input: any) {
  const tenantId = requiredTenantId(input);
  const context = await loadEmailContext(client, tenantId, input);
  await assertEmailAllowed(context.lead);
  const sender = await resolveSender(client, tenantId, context.agent);
  const toEmail = firstValue(input.to, input.toEmail, input.to_email, context.lead?.email);
  if (!toEmail) throw new Error('Recipient email is required');
  return recordDelivery(client, tenantId, { ...input, to: toEmail }, sender, null, null, 'pending');
}

export default async function(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method === 'GET') {
    return jsonResponse({
      success: true,
      service: 'email-actions',
      actions: EMAIL_ACTIONS,
      writer: 'openai',
      configured: {
        openai: Boolean(Deno.env.get('OPENAI_API_KEY')),
        emailProvider: Boolean(Deno.env.get('RESEND_API_KEY')),
        platformFallback: Boolean(Deno.env.get('EMAIL_FROM')),
        deliveryAuth: Boolean(deliverySecret()),
      },
    });
  }

  const unauthorized = assertDeliveryAuthorized(req);
  if (unauthorized) return unauthorized;

  const client = createInsForgeClient();
  const action = new URL(req.url).searchParams.get('action') || 'send-email';
  const body = await req.json().catch(() => ({}));
  if (!EMAIL_ACTIONS.includes(action)) return jsonResponse({ success: false, error: 'Unsupported email action' }, 400);

  try {
    if (action === 'queue-email') {
      const queued = await queueEmailIntent(client, body);
      return jsonResponse({ success: true, queued, writer: 'openai' });
    }
    const result = await sendAutomatedEmail(client, action, body);
    return jsonResponse({ success: true, ...result, writer: 'openai' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Email action failed';
    return jsonResponse({ success: false, error: message }, 500);
  }
}

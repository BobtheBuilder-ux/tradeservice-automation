import { createClient } from 'npm:@insforge/sdk';

const DEFAULT_TENANT_ID = '00000000-0000-4000-8000-000000000001';
const EMAIL_ACTIONS = ['send-email', 'queue-email', 'send-template-email', 'send-booking-confirmation', 'send-reminder'];

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

function escapeHtml(value: unknown) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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

async function loadEmailContext(client: any, tenantId: string, input: any) {
  const [tenantResult, lead, agent] = await Promise.all([
    client.database.from('tenants').select('*').eq('id', tenantId).limit(1),
    loadSingle(client, 'leads', tenantId, firstValue(input.leadId, input.lead_id)),
    loadSingle(client, 'tenant_agents', tenantId, firstValue(input.tenantAgentId, input.tenant_agent_id, input.agentId, input.agent_id)),
  ]);
  if (tenantResult.error) throw new Error(tenantResult.error.message || 'Failed to load tenant for email');
  return { tenant: tenantResult.data?.[0] || null, lead, agent };
}

async function assertEmailAllowed(lead: any) {
  if (!lead) return;
  if (lead.do_not_contact) throw new Error('Lead is marked do not contact');
  if (lead.opted_out_at && (!lead.opt_out_channel || lead.opt_out_channel === 'all' || lead.opt_out_channel === 'email')) {
    throw new Error('Lead opted out of email');
  }
  if (!lead.email_consent) throw new Error('Missing email consent');
}

function platformSender() {
  const email = Deno.env.get('EMAIL_FROM');
  const name = Deno.env.get('EMAIL_FROM_NAME') || 'Bob Automation';
  if (!email) throw new Error('Platform fallback sender is not configured');
  return { from: `${name} <${email}>`, fromEmail: email, fromName: name, replyTo: null, resolution: 'platform_fallback', identityId: null };
}

async function resolveSender(client: any, tenantId: string) {
  const { data, error } = await client.database
    .from('tenant_email_identities')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .eq('verified_status', 'verified')
    .limit(1);
  if (error) throw new Error(error.message || 'Failed to resolve sender identity');
  const identity = data?.[0];
  if (!identity?.from_email) return platformSender();
  return {
    from: `${identity.from_name || 'Support'} <${identity.from_email}>`,
    fromEmail: identity.from_email,
    fromName: identity.from_name || 'Support',
    replyTo: identity.reply_to_email || null,
    resolution: 'tenant_verified',
    identityId: identity.id,
  };
}

function emailIntent(action: string, input: any) {
  if (action === 'send-booking-confirmation') return 'booking_confirmation';
  if (action === 'send-reminder') return 'booking_reminder';
  return String(firstValue(input.emailType, input.email_type, 'follow_up'));
}

function buildDraftInstructions(action: string, context: any, input: any) {
  const intent = emailIntent(action, input);
  return {
    role: 'system',
    content: `You write concise, accurate automated business emails. Return only valid JSON with keys subject, text, and html. Never invent booking details, pricing, promises, or links. Keep the tone warm and professional. The HTML must use only simple safe tags: p, strong, em, ul, li, a, br.`,
    input: {
      intent,
      tenant: { name: context.tenant?.name || null, industry: context.tenant?.industry || null },
      agent: { name: context.agent?.display_name || null },
      recipient: {
        name: context.lead?.full_name || [context.lead?.first_name, context.lead?.last_name].filter(Boolean).join(' ') || input.leadName || input.name || null,
        email: context.lead?.email || firstValue(input.to, input.toEmail, input.to_email) || null,
        serviceInterest: context.lead?.service_interest || input.serviceInterest || input.service_interest || null,
      },
      booking: {
        time: firstValue(input.time, input.startTime, input.start_time) || null,
        meetingUrl: firstValue(input.meetingUrl, input.meeting_url, input.bookingUrl, input.booking_url) || null,
        location: input.location || null,
      },
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
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      instructions: instructions.content,
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
    generated_by: draft ? 'openai' : null,
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
  const tenantId = firstValue(input.tenantId, input.tenant_id, DEFAULT_TENANT_ID);
  const context = await loadEmailContext(client, tenantId, input);
  await assertEmailAllowed(context.lead);
  const sender = await resolveSender(client, tenantId);
  const draft = await draftWithOpenAI(action, context, input);
  const resend = await sendViaResend({ ...input, ...draft }, sender);
  const queued = await recordDelivery(client, tenantId, { ...input, action }, sender, draft, resend);
  return { queued, resend, sender: { resolution: sender.resolution, fromEmail: sender.fromEmail }, draft: { model: draft.model, subject: draft.subject } };
}

async function queueEmailIntent(client: any, input: any) {
  const tenantId = firstValue(input.tenantId, input.tenant_id, DEFAULT_TENANT_ID);
  const context = await loadEmailContext(client, tenantId, input);
  await assertEmailAllowed(context.lead);
  const sender = await resolveSender(client, tenantId);
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

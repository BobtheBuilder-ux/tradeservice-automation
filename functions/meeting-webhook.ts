import { createClient } from 'npm:@insforge/sdk';

function createInsForgeClient() {
  return createClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    anonKey: Deno.env.get('ANON_KEY'),
  });
}


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Meeting-Actions-Secret',
};

function optionsResponse() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

function jsonResponse(data: unknown, status = 200) {
  return Response.json(data, { status, headers: corsHeaders });
}

function nowIso() {
  return new Date().toISOString();
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');
}

function safeError(error: unknown, fallback = 'Meeting automation failed') {
  return String(error instanceof Error ? error.message : fallback)
    .replace(/(authorization|bearer|token|secret|api[_-]?key)(=|:)?\s*[^\s,}]+/gi, '$1=[redacted]')
    .slice(0, 500);
}

function escapeHtml(value: unknown) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function unwrap(result: any, message: string) {
  if (result?.error) throw new Error(result.error.message || message);
  return result?.data;
}

function deliverySecret() {
  return Deno.env.get('MEETING_ACTIONS_SECRET') || Deno.env.get('ELEVENLABS_TOOL_SECRET') || '';
}

function assertMeetingActionAuthorized(req: Request) {
  const expected = deliverySecret();
  if (!expected) throw new Error('Meeting automation authorization is not configured');
  const authorization = req.headers.get('authorization') || '';
  const bearer = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : authorization.trim();
  const provided = req.headers.get('x-meeting-actions-secret') || req.headers.get('x-elevenlabs-tool-secret') || bearer;
  if (provided !== expected) throw new Error('Unauthorized meeting automation action');
}

function normalizePhone(phone: string) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  return digits ? `+${digits}` : raw;
}

function formatReminderTime(meeting: any, tenant: any, reminderType = '24h') {
  const raw = meeting?.start_time;
  const date = new Date(String(raw || ''));
  if (Number.isNaN(date.getTime())) return String(raw || 'the scheduled time');
  const timezone = meeting?.timezone || tenant?.default_timezone || 'UTC';
  const relative = reminderType === '24h' ? 'tomorrow' : 'soon';
  const time = date.toLocaleTimeString('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' });
  const full = date.toLocaleString('en-US', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' });
  return reminderType === '24h' ? `${relative} at ${time}` : full;
}

async function resolveReminderContext(db: any, reminder: any) {
  const meetingRows = await unwrap(
    await db.database.from('meetings').select('*').eq('tenant_id', reminder.tenant_id).eq('id', reminder.meeting_id).limit(1),
    'Failed to load reminder meeting'
  );
  const meeting = meetingRows?.[0] || null;
  if (!meeting) throw new Error('Reminder meeting was not found');

  const [tenantRows, leadRows, agentRows, phoneRows, emailIdentityRows] = await Promise.all([
    unwrap(await db.database.from('tenants').select('*').eq('id', reminder.tenant_id).limit(1), 'Failed to load tenant'),
    meeting.lead_id
      ? unwrap(await db.database.from('leads').select('*').eq('tenant_id', reminder.tenant_id).eq('id', meeting.lead_id).limit(1), 'Failed to load lead')
      : Promise.resolve([]),
    unwrap(
      await db.database
        .from('tenant_agents')
        .select('*')
        .eq('tenant_id', reminder.tenant_id)
        .in('status', ['live', 'testing'])
        .order('updated_at', { ascending: false })
        .limit(1),
      'Failed to load tenant agent'
    ),
    unwrap(
      await db.database
        .from('tenant_phone_numbers')
        .select('*')
        .eq('tenant_id', reminder.tenant_id)
        .eq('status', 'active')
        .eq('sms_enabled', true)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(1),
      'Failed to load tenant SMS sender'
    ),
    unwrap(
      await db.database
        .from('tenant_email_identities')
        .select('*')
        .eq('tenant_id', reminder.tenant_id)
        .eq('status', 'active')
        .eq('verified_status', 'verified')
        .order('created_at', { ascending: false })
        .limit(1),
      'Failed to load tenant email sender'
    ),
  ]);

  return {
    reminder,
    meeting,
    tenant: tenantRows?.[0] || null,
    lead: leadRows?.[0] || null,
    agent: agentRows?.[0] || null,
    phoneNumber: phoneRows?.[0] || null,
    emailIdentity: emailIdentityRows?.[0] || null,
  };
}

function leadName(lead: any, fallback = 'there') {
  return lead?.full_name || [lead?.first_name, lead?.last_name].filter(Boolean).join(' ') || fallback;
}

function agentName(context: any) {
  return context.agent?.display_name || 'your appointment assistant';
}

function reminderSmsBody(context: any) {
  const timeText = formatReminderTime(context.meeting, context.tenant, context.reminder.reminder_type);
  const meetingUrl = context.meeting?.meeting_url || context.meeting?.location || '';
  if (context.reminder?.reminder_type === 'confirmation') {
    return `Hi, this is ${agentName(context)}. Your appointment is confirmed for ${timeText}.${meetingUrl ? ` Meeting link: ${meetingUrl}` : ''}`;
  }
  return `Hi, this is ${agentName(context)}. Just a reminder about your appointment ${timeText}.${meetingUrl ? ` Meeting link: ${meetingUrl}` : ''} See you then!`;
}

function fallbackReminderEmailDraft(context: any) {
  const recipientName = leadName(context.lead);
  const assistantName = agentName(context);
  const service = context.lead?.service_interest || context.meeting?.title || 'appointment';
  const timeText = formatReminderTime(context.meeting, context.tenant, context.reminder.reminder_type);
  const meetingUrl = context.meeting?.meeting_url || context.meeting?.location || '';
  const subject = `Reminder: your ${service} appointment is ${timeText}`;
  const text = [
    `Hello again ${recipientName},`,
    `It's ${assistantName}. Just checking on you and also reminding you about your upcoming ${service} appointment ${timeText}.`,
    meetingUrl ? `Meeting link: ${meetingUrl}` : '',
    'See you then!',
  ].filter(Boolean).join('\n\n');
  const html = [
    `<p>Hello again ${escapeHtml(recipientName)},</p>`,
    `<p>It's ${escapeHtml(assistantName)}. Just checking on you and also reminding you about your upcoming ${escapeHtml(service)} appointment <strong>${escapeHtml(timeText)}</strong>.</p>`,
    meetingUrl ? `<p>Meeting link: <a href="${escapeHtml(meetingUrl)}">${escapeHtml(meetingUrl)}</a></p>` : '',
    '<p>See you then!</p>',
  ].filter(Boolean).join('');
  return { subject, text, html, model: 'deterministic-reminder-fallback', responseId: null, generatedBy: 'template' };
}

function extractOutputText(response: any) {
  if (response?.output_text) return response.output_text;
  return (response?.output || []).flatMap((item: any) => item?.content || [])
    .filter((content: any) => content?.type === 'output_text')
    .map((content: any) => content.text)
    .join('');
}

async function draftReminderEmailWithOpenAI(context: any) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  const model = Deno.env.get('OPENAI_EMAIL_MODEL') || 'gpt-5.5';
  const preferredLanguage = context.lead?.preferred_language || null;
  const payload = {
    intent: context.reminder?.reminder_type === 'confirmation' ? 'booking_confirmation' : '24_hour_booking_reminder',
    requiredTone: 'friendly, warm, concise',
    requiredOpening: context.reminder?.reminder_type === 'confirmation'
      ? `Hello, it's ${agentName(context)}. Your appointment is confirmed.`
      : `Hello again, it's ${agentName(context)}. Just checking on you and also reminding you about the upcoming appointment.`,
    tenant: { name: context.tenant?.name || null, industry: context.tenant?.industry || null },
    agent: { name: agentName(context) },
    recipient: {
      name: leadName(context.lead),
      email: context.lead?.email || context.meeting?.attendee_email || null,
      serviceInterest: context.lead?.service_interest || null,
      preferredLanguage,
    },
    booking: {
      title: context.meeting?.title || null,
      time: context.meeting?.start_time || null,
      friendlyTime: formatReminderTime(context.meeting, context.tenant, context.reminder.reminder_type),
      timezone: context.meeting?.timezone || context.tenant?.default_timezone || null,
      meetingUrl: context.meeting?.meeting_url || context.meeting?.location || null,
    },
  };
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      instructions: `${context.reminder?.reminder_type === 'confirmation' ? 'Write an automated booking confirmation email.' : 'Write an automated 24-hour appointment reminder email.'} Return only valid JSON with keys subject, text, and html. Keep it friendly and ready to send without human approval. Use the agent name. Include the meeting link if provided. Do not invent details. HTML may only use p, strong, em, a, br.${preferredLanguage ? ` Write the email in ${preferredLanguage}.` : ''}`,
      input: JSON.stringify(payload),
      text: {
        format: {
          type: 'json_schema',
          name: 'appointment_reminder_email',
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
  if (!response.ok) throw new Error(data?.error?.message || `OpenAI reminder draft failed with ${response.status}`);
  const output = extractOutputText(data);
  const draft = JSON.parse(output || '{}');
  if (!draft?.subject || !draft?.text || !draft?.html) throw new Error('OpenAI returned an incomplete reminder draft');
  return { subject: draft.subject, text: draft.text, html: draft.html, model, responseId: data.id || null, generatedBy: 'openai' };
}

function resolveEmailSender(context: any) {
  const identity = context.emailIdentity;
  if (identity?.from_email) {
    return {
      from: `${identity.from_name || agentName(context)} <${identity.from_email}>`,
      fromEmail: identity.from_email,
      fromName: identity.from_name || agentName(context),
      replyTo: identity.reply_to_email || null,
      resolution: 'tenant_verified',
      identityId: identity.id,
    };
  }
  const fallbackEmail = Deno.env.get('EMAIL_FROM');
  const fallbackName = Deno.env.get('EMAIL_FROM_NAME') || 'SetMyMeet';
  if (!fallbackEmail) throw new Error('Platform fallback sender is not configured');
  const agentEmail = String(context.agent?.email_address || '').trim().toLowerCase();
  const hasAgentEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(agentEmail);
  const fromEmail = hasAgentEmail ? agentEmail : fallbackEmail;
  const fromName = hasAgentEmail ? agentName(context) : fallbackName;
  return { from: `${fromName} <${fromEmail}>`, fromEmail, fromName, replyTo: null, resolution: 'platform_fallback', identityId: null };
}

async function sendReminderEmail(db: any, context: any) {
  const lead = context.lead;
  if (!lead?.email && !context.meeting?.attendee_email) throw new Error('Lead email is required');
  if (lead?.do_not_contact) throw new Error('Lead is marked do not contact');
  if (lead?.opted_out_at && (!lead.opt_out_channel || lead.opt_out_channel === 'all' || lead.opt_out_channel === 'email')) throw new Error('Lead opted out of email');
  if (lead && !lead.email_consent) throw new Error('Missing email consent');

  let draft;
  try {
    draft = await draftReminderEmailWithOpenAI(context);
  } catch (error) {
    draft = fallbackReminderEmailDraft(context);
    draft.generationError = safeError(error, 'OpenAI reminder draft failed');
  }

  const sender = resolveEmailSender(context);
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');
  const toEmail = lead?.email || context.meeting?.attendee_email;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: sender.from,
      to: [toEmail],
      subject: draft.subject,
      html: draft.html,
      text: draft.text,
      reply_to: sender.replyTo || undefined,
    }),
  });
  const resend = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(resend?.message || resend?.error || `Resend reminder failed with ${response.status}`);

  const queued = await unwrap(
    await db.database.from('email_queue').insert([{
      tenant_id: context.reminder.tenant_id,
      lead_id: context.meeting.lead_id || null,
      to_email: toEmail,
      from_email: sender.fromEmail,
      sender_identity_id: sender.identityId,
      sender_display_name: sender.fromName,
      reply_to_email: sender.replyTo,
      sender_resolution: sender.resolution,
      delivery_provider: 'resend',
      provider_message_id: resend?.id || null,
      subject: draft.subject,
      html_content: draft.html,
      text_content: draft.text,
      email_type: context.reminder?.reminder_type === 'confirmation' ? 'booking_confirmation' : 'booking_reminder',
      status: 'sent',
      sent_at: nowIso(),
      generated_by: draft.generatedBy || 'openai',
      generation_model: draft.model || null,
      generation_status: draft.generationError ? 'failed' : 'generated',
      generation_error: draft.generationError || null,
      generated_at: nowIso(),
      scheduled_for: context.reminder.scheduled_for,
      metadata: { source: 'meeting_reminder_processor', meetingId: context.meeting.id, reminderId: context.reminder.id, openaiResponseId: draft.responseId || null },
    }]).select(),
    'Failed to record reminder email'
  );

  return { providerMessageId: resend?.id || null, emailQueueId: queued?.[0]?.id || null };
}

async function sendReminderSms(context: any) {
  const lead = context.lead;
  if (!lead?.phone && !context.meeting?.attendee_phone) throw new Error('Lead phone is required');
  if (lead?.do_not_contact) throw new Error('Lead is marked do not contact');
  if (lead?.opted_out_at && (!lead.opt_out_channel || lead.opt_out_channel === 'all' || lead.opt_out_channel === 'sms')) throw new Error('Lead opted out of SMS');
  if (lead && !lead.sms_consent) throw new Error('Missing SMS consent');

  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  if (!accountSid || !authToken) throw new Error('Twilio credentials are not configured');
  const from = normalizePhone(context.phoneNumber?.phone_number || Deno.env.get('TWILIO_PHONE_NUMBER') || '');
  const to = normalizePhone(lead?.phone || context.meeting?.attendee_phone || '');
  if (!from) throw new Error('No SMS sender is configured');
  if (!to) throw new Error('Lead phone is required');

  const body = reminderSmsBody(context);
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: from, To: to, Body: body }),
  });
  const twilio = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(twilio?.message || `Twilio reminder failed with ${response.status}`);
  return { providerMessageId: twilio?.sid || null, body };
}

async function processDueReminders(db: any, req: Request, input: any) {
  assertMeetingActionAuthorized(req);
  const limit = Math.min(Math.max(Number(input.limit || 20), 1), 100);
  const dueRows = await unwrap(
    await db.database
      .from('meeting_reminders')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', nowIso())
      .order('scheduled_for', { ascending: true })
      .limit(limit),
    'Failed to load due meeting reminders'
  );

  const results = [];
  for (const reminder of dueRows || []) {
    const startedAt = nowIso();
    try {
      await db.database.from('meeting_reminders').update({ status: 'processing', updated_at: startedAt }).eq('id', reminder.id).eq('tenant_id', reminder.tenant_id).eq('status', 'pending');
      const context = await resolveReminderContext(db, reminder);
      let delivery;
      if (reminder.delivery_method === 'email') {
        delivery = await sendReminderEmail(db, context);
        await db.database.from('meeting_reminders').update({
          status: 'sent',
          sent_at: nowIso(),
          email_message_id: delivery.providerMessageId,
          updated_at: nowIso(),
        }).eq('id', reminder.id).eq('tenant_id', reminder.tenant_id);
      } else if (reminder.delivery_method === 'sms') {
        delivery = await sendReminderSms(context);
        await db.database.from('meeting_reminders').update({
          status: 'sent',
          sent_at: nowIso(),
          sms_message_sid: delivery.providerMessageId,
          updated_at: nowIso(),
        }).eq('id', reminder.id).eq('tenant_id', reminder.tenant_id);
      } else {
        throw new Error(`Unsupported reminder delivery method: ${reminder.delivery_method}`);
      }
      results.push({ id: reminder.id, status: 'sent', deliveryMethod: reminder.delivery_method, providerMessageId: delivery.providerMessageId || null });
    } catch (error) {
      const message = safeError(error, 'Reminder delivery failed');
      await db.database.from('meeting_reminders').update({
        status: 'failed',
        error_message: message,
        updated_at: nowIso(),
      }).eq('id', reminder.id).eq('tenant_id', reminder.tenant_id);
      results.push({ id: reminder.id, status: 'failed', deliveryMethod: reminder.delivery_method, error: message });
    }
  }

  return { processed: results.length, results };
}

async function readRequestBody(req: Request) {
  const text = await req.text();
  const type = req.headers.get('content-type') || '';
  if (type.includes('application/json')) return JSON.parse(text || '{}');
  return Object.fromEntries(new URLSearchParams(text));
}

function emptyTwilioXmlResponse() {
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
  });
}

function twimlResponse(message: string, gatherUrl?: string) {
  const body = gatherUrl
    ? `<Response><Gather input="speech dtmf" action="${gatherUrl}" method="POST" speechTimeout="auto" timeout="6"><Say>${message}</Say></Gather><Say>I did not hear a response. A team member will follow up. Goodbye.</Say><Hangup/></Response>`
    : `<Response><Say>${message}</Say><Hangup/></Response>`;
  return new Response(body, { headers: { ...corsHeaders, 'Content-Type': 'text/xml' } });
}



export default async function(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse();
  if (req.method === 'GET') {
    return jsonResponse({
      status: 'ok',
      service: 'meeting-webhook',
      actions: ['update-meeting', 'process-reminders'],
      reminderAutomationConfigured: Boolean(deliverySecret()),
    });
  }

  const db = createInsForgeClient();
  const data = await req.json().catch(() => ({}));
  const action = new URL(req.url).searchParams.get('action') || data.action || 'update-meeting';
  if (action === 'process-reminders') {
    try {
      return jsonResponse({ success: true, ...(await processDueReminders(db, req, data)) });
    } catch (error) {
      const message = safeError(error);
      return jsonResponse({ success: false, error: message }, /auth|secret|unauthorized/i.test(message) ? 401 : 500);
    }
  }

  const tenantId = data.tenantId || data.tenant_id;
  const leadId = data.leadId || data.lead_id;
  if (!tenantId) return jsonResponse({ success: false, error: 'tenantId is required' }, 400);
  if (!leadId) return jsonResponse({ success: false, error: 'leadId is required' }, 400);

  const patch = {
    status: 'scheduled',
    meeting_scheduled: true,
    scheduled_at: data.startTime || data.start_time || null,
    meeting_location: data.meetingUrl || data.meeting_url || data.location || null,
    updated_at: new Date().toISOString(),
  };
  const { data: leads } = await db.database.from('leads').update(patch).eq('tenant_id', tenantId).eq('id', leadId).select();
  return jsonResponse({ success: true, lead: leads?.[0] || null });
}

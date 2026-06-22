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
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function optionsResponse() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

function jsonResponse(data: unknown, status = 200) {
  return Response.json(data, { status, headers: corsHeaders });
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


function extractCalendlyPayload(raw: any) {
  const payload = raw?.eventData?.payload || raw?.payload || raw;
  const event = raw?.eventData?.event || raw?.event || 'invitee.created';
  const invitee = payload?.invitee || payload;
  return { payload, event, invitee };
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

async function processCalendlyWebhook(db: any, raw: any) {
  const { payload, event, invitee } = extractCalendlyPayload(raw);
  const email = invitee?.email;
  if (!email) {
    return { success: false, error: 'missing_invitee_email', status: 400 };
  }

  const tenantId = firstValue(raw?.tenantId, raw?.tenant_id, payload?.tenantId, payload?.tenant_id, payload?.metadata?.tenantId, payload?.metadata?.tenant_id);
  let leadQuery = db.database
    .from('leads')
    .select('*')
    .eq('email', String(email).toLowerCase());
  if (tenantId) leadQuery = leadQuery.eq('tenant_id', tenantId);
  const { data: leads } = await leadQuery.limit(2);
  if (!tenantId && (leads?.length || 0) > 1) {
    return { success: true, event, leadUpdated: false, ignored: true, reason: 'ambiguous_tenant', status: 200 };
  }
  const lead = leads?.[0] || null;

  if (lead) {
    const cancelled = event.includes('canceled');
    const start = payload?.event?.start_time || payload?.scheduled_event?.start_time || null;
    await db.database.from('leads').update({
      status: cancelled ? 'cancelled' : 'scheduled',
      meeting_scheduled: !cancelled,
      scheduled_at: start,
      calendly_event_uri: payload?.event?.uri || null,
      calendly_invitee_uri: invitee?.uri || null,
      updated_at: new Date().toISOString(),
    }).eq('id', lead.id).eq('tenant_id', lead.tenant_id);

    if (!cancelled && start) {
      await db.database.from('meetings').insert([{
        tenant_id: lead.tenant_id,
        lead_id: lead.id,
        title: payload?.event?.name || 'Consultation',
        start_time: start,
        end_time: payload?.event?.end_time || start,
        timezone: payload?.timezone || 'UTC',
        status: 'scheduled',
        meeting_url: payload?.event?.location?.join_url || null,
        attendee_email: email,
        attendee_name: invitee?.name || lead.full_name || email,
        metadata: payload,
      }]);
    }
  }

  return { success: true, event, leadUpdated: Boolean(lead), status: 200 };
}



export default async function(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse();
  if (req.method === 'GET') return jsonResponse({ status: 'ok', service: 'calendly-webhook' });

  const db = createInsForgeClient();
  const raw = await req.json().catch(() => ({}));
  const result = await processCalendlyWebhook(db, raw);
  if (result.status && result.status >= 400) {
    return jsonResponse({ success: false, error: result.error }, result.status);
  }
  return jsonResponse({ success: true, event: result.event, leadUpdated: result.leadUpdated });
}

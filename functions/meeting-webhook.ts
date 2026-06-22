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



export default async function(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse();
  if (req.method === 'GET') return jsonResponse({ status: 'ok', service: 'meeting-webhook' });

  const db = createInsForgeClient();
  const data = await req.json().catch(() => ({}));
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

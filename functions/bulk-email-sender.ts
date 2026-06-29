import { createAdminClient, createClient } from 'npm:@insforge/sdk';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Bulk-Email-Secret',
};
const BULK_EMAIL_BATCH_SIZE = 50;

function createInsForgeClient(token?: string) {
  return createClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    anonKey: Deno.env.get('ANON_KEY'),
    ...(token ? { edgeFunctionToken: token } : {}),
  });
}

function createInsForgeAdminClient() {
  const apiKey = Deno.env.get('API_KEY');
  if (!apiKey) throw new Error('API_KEY is not configured');
  return createAdminClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    apiKey,
  });
}

function jsonResponse(data: unknown, status = 200) {
  return Response.json(data, { status, headers: corsHeaders });
}

function bearerToken(value: string | null) {
  if (!value) return '';
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : value.trim();
}

// Direct parse JWT token to avoid resolve_current_portal_user execution restrictions
function parseJwt(token: string) {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const jsonPayload = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

async function readJson(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

async function resolveTenantContext(token: string, requestedTenantId?: string): Promise<{ tenantId: string; userId: string }> {
  const payload = parseJwt(token);
  const userId = payload?.sub || payload?.user_id || payload?.userId || payload?.id;
  if (!userId) throw new Error('Authentication required');

  const tokenTenantId = payload?.tenant_id || payload?.tenantId;
  const tenantIdToCheck = requestedTenantId || tokenTenantId;
  const admin = createInsForgeAdminClient();

  let query = admin.database
    .from('tenant_users')
    .select('tenant_id, role, status')
    .eq('user_id', String(userId))
    .eq('status', 'active')
    .limit(1);

  if (tenantIdToCheck) {
    query = query.eq('tenant_id', String(tenantIdToCheck));
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Failed to resolve tenant context');
  if (!data?.length) {
    throw new Error(tenantIdToCheck ? 'Requested tenant does not match signed-in tenant' : 'Tenant context is required');
  }

  return { tenantId: String(data[0].tenant_id), userId: String(userId) };
}

// Helper to substitute placeholders
function substitutePlaceholders(template: string, values: Record<string, string>): string {
  if (!template) return '';
  const leadName = values.leadName || 'Friend';
  return template
    .replace(/{lead_name}/g, leadName)
    .replace(/{leadName}/g, leadName)
    .replace(/{name}/g, leadName)
    .replace(/{sender_name}/g, values.senderName || '')
    .replace(/{sender_email}/g, values.senderEmail || '')
    .replace(/{company_name}/g, values.companyName || values.senderName || 'SetMyMeet');
}

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildFallbackEmailHtml(subject: string, body: string) {
  const paragraphs = String(body || '')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 16px;color:#4b5565;font-size:15px;line-height:24px;">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f6f7fb;padding:24px;font-family:Inter,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e3e8ef;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="background:#121926;padding:24px 28px;">
          <div style="color:#ffffff;font-size:18px;font-weight:700;line-height:24px;">${escapeHtml(subject)}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:28px;">
          ${paragraphs}
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function firstNonEmpty(...values: unknown[]) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function leadNameFromRecipient(recipient: any) {
  const fields = recipient?.custom_fields || {};
  return firstNonEmpty(
    recipient?.name,
    fields.lead_name,
    fields.lead_full_name,
    fields.full_name,
    fields.fullname,
    fields.contact_name,
    fields.customer_name,
    fields.client_name,
    fields.recipient_name,
    firstNonEmpty(fields.first_name, fields.firstname, fields.first) &&
      `${firstNonEmpty(fields.first_name, fields.firstname, fields.first)} ${firstNonEmpty(fields.last_name, fields.lastname, fields.last, fields.surname)}`.trim()
  );
}

export default async function(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'health';
  // Extract Bearer token upfront; webhook handler doesn't have one
  const authHeader = req.headers.get('authorization') || '';
  const userToken = bearerToken(authHeader) || undefined;

  if (action === 'health') {
    return jsonResponse({
      success: true,
      service: 'bulk-email-sender',
      actions: ['create-campaign', 'tick', 'pause-campaign', 'resume-campaign', 'cancel-campaign', 'resend-webhook'],
    });
  }

  // Handle Webhook action separately as it does not carry a user auth token
  if (action === 'resend-webhook') {
    const client = createInsForgeAdminClient();
    try {
      const payload = await readJson(req);
      const eventType = payload?.type; // e.g. email.delivered or email.bounced
      const data = payload?.data;
      const providerMessageId = data?.id;

      if (!providerMessageId) {
        return jsonResponse({ success: false, error: 'No provider message ID found in webhook' }, 400);
      }

      // Query recipient by provider message id using the service role bypass
      // InsForge runs SQL commands under service role bypass on server-side queries when needed
      const { data: recipientData, error: findError } = await client.database
        .from('tenant_bulk_email_recipients')
        .select('*')
        .eq('provider_message_id', providerMessageId)
        .limit(1);

      if (findError || !recipientData?.length) {
        return jsonResponse({ success: true, message: 'Message not associated with bulk email campaigns' });
      }

      const recipient = recipientData[0];
      const campaignId = recipient.campaign_id;
      const tenantId = recipient.tenant_id;

      let statusUpdate = 'sent';
      let errorMsg = null;
      let isDelivery = false;
      let isFailure = false;

      if (eventType === 'email.delivered') {
        statusUpdate = 'delivered';
        isDelivery = true;
      } else if (eventType === 'email.bounced' || eventType === 'email.complained') {
        statusUpdate = 'bounced';
        errorMsg = payload?.data?.error?.message || 'Bounced or complained';
        isFailure = true;
      }

      // Update recipient status
      await client.database
        .from('tenant_bulk_email_recipients')
        .update({
          status: statusUpdate,
          delivered_at: isDelivery ? new Date().toISOString() : recipient.delivered_at,
          failed_at: isFailure ? new Date().toISOString() : recipient.failed_at,
          error_message: errorMsg,
        })
        .eq('id', recipient.id);

      // Load campaign counts
      const { data: countsData } = await client.database
        .from('tenant_bulk_email_recipients')
        .select('status')
        .eq('campaign_id', campaignId);

      if (countsData) {
        const deliveredCount = countsData.filter((r: any) => r.status === 'delivered').length;
        const failedCount = countsData.filter((r: any) => ['failed', 'bounced'].includes(r.status)).length;
        const sentCount = countsData.filter((r: any) => r.status !== 'pending').length;

        // Update campaign status if everything is processed
        let campaignStatus = 'sending';
        const pendingCount = countsData.filter((r: any) => r.status === 'pending').length;
        if (pendingCount === 0) {
          campaignStatus = 'completed';
        }

        await client.database
          .from('tenant_bulk_email_campaigns')
          .update({
            delivered_count: deliveredCount,
            failed_count: failedCount,
            sent_count: sentCount,
            status: campaignStatus,
            completed_at: pendingCount === 0 ? new Date().toISOString() : null,
          })
          .eq('id', campaignId);
      }

      return jsonResponse({ success: true });
    } catch (err: any) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }

  // Auth actions — create client authenticated as the calling user
  try {
    if (!userToken) return jsonResponse({ success: false, error: 'Authorization header is required' }, 401);
    const client = createInsForgeClient(userToken);
    const body = await readJson(req);
    const portal = await resolveTenantContext(userToken, body?.tenantId);
    const tenantId = portal.tenantId;

    if (action === 'create-campaign') {
      const { name, subject, bodyText, bodyHtml, metadata, recipients } = body;

      if (!name || !subject || !bodyText) {
        return jsonResponse({ success: false, error: 'Name, subject, and bodyText are required' }, 400);
      }
      if (!Array.isArray(recipients) || recipients.length === 0) {
        return jsonResponse({ success: false, error: 'recipients must be a non-empty array' }, 400);
      }

      // Check if tenant already has an active campaign (status queued or sending)
      const { data: activeCampaigns, error: checkError } = await client.database
        .from('tenant_bulk_email_campaigns')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .in('status', ['queued', 'sending'])
        .limit(1);

      if (checkError) throw new Error(checkError.message);
      if (activeCampaigns?.length) {
        return jsonResponse({
          success: false,
          error: `Another campaign is currently active: "${activeCampaigns[0].name}". Tenants can only run one active campaign at a time.`,
        }, 400);
      }

      // Resolve tenant verified email identity
      const { data: senderIdentity } = await client.database
        .from('tenant_email_identities')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('verified_status', 'verified')
        .limit(1);

      const resolvedFromEmail = senderIdentity?.[0]?.from_email || Deno.env.get('EMAIL_FROM') || 'hello@setmymeet.ca';
      const resolvedFromName = senderIdentity?.[0]?.from_name || Deno.env.get('EMAIL_FROM_NAME') || 'Outreach Manager';

      // Insert campaign
      const { data: campaign, error: campaignError } = await client.database
        .from('tenant_bulk_email_campaigns')
        .insert([{
          tenant_id: tenantId,
          created_by_user_id: portal.userId,
          name,
          subject,
          body_text: bodyText,
          body_html: bodyHtml || null,
          metadata: metadata && typeof metadata === 'object' ? metadata : {},
          from_email: resolvedFromEmail,
          from_name: resolvedFromName,
          recipient_count: recipients.length,
          status: 'sending',
          started_at: new Date().toISOString(),
        }])
        .select();

      if (campaignError || !campaign?.[0]) {
        throw new Error(campaignError?.message || 'Failed to create bulk campaign');
      }

      const campaignId = campaign[0].id;

      // Insert recipients
      const recipientPayloads = recipients.map((r: any) => ({
        tenant_id: tenantId,
        campaign_id: campaignId,
        email: r.email,
        name: firstNonEmpty(r.name, r.leadName, r.fullName, r.full_name) || null,
        custom_fields: r.customFields || {},
        status: 'pending',
      }));

      const { error: recipientError } = await client.database
        .from('tenant_bulk_email_recipients')
        .insert(recipientPayloads);

      if (recipientError) {
        // Rollback campaign
        await client.database.from('tenant_bulk_email_campaigns').delete().eq('id', campaignId);
        throw new Error(recipientError.message || 'Failed to insert recipients');
      }

      return jsonResponse({ success: true, campaign: campaign[0] });
    }

    if (action === 'tick') {
      const campaignId = body.campaignId;
      if (!campaignId) return jsonResponse({ success: false, error: 'campaignId is required' }, 400);

      // Load campaign
      const { data: campaignData, error: campaignError } = await client.database
        .from('tenant_bulk_email_campaigns')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('id', campaignId)
        .limit(1);

      if (campaignError || !campaignData?.length) {
        return jsonResponse({ success: false, error: 'Campaign not found' }, 404);
      }

      const campaign = campaignData[0];
      if (campaign.status === 'paused') {
        return jsonResponse({ success: true, message: 'Campaign is paused', status: 'paused' });
      }
      if (campaign.status === 'completed' || campaign.status === 'failed') {
        return jsonResponse({ success: true, message: 'Campaign already completed/failed', status: campaign.status });
      }

      // Get the next pending recipient batch. Keep a sane per-invocation cap so
      // a large upload does not hold the function open indefinitely.
      const { data: pendingRecipients, error: pendingError } = await client.database
        .from('tenant_bulk_email_recipients')
        .select('*')
        .eq('campaign_id', campaignId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(BULK_EMAIL_BATCH_SIZE);

      if (pendingError) throw new Error(pendingError.message);

      if (!pendingRecipients || pendingRecipients.length === 0) {
        // Complete campaign
        await client.database
          .from('tenant_bulk_email_campaigns')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', campaignId);

        return jsonResponse({ success: true, status: 'completed', message: 'No more pending recipients' });
      }

      // Update status of campaign to sending if not already
      if (campaign.status === 'queued') {
        await client.database
          .from('tenant_bulk_email_campaigns')
          .update({ status: 'sending', started_at: new Date().toISOString() })
          .eq('id', campaignId);
      }

      const apiKey = Deno.env.get('RESEND_API_KEY');
      if (!apiKey) throw new Error('RESEND_API_KEY is not configured');
      const resendFrom = `${campaign.from_name} <${campaign.from_email}>`;

      const results = [];
      for (const recipient of pendingRecipients) {
        const nameForSub = leadNameFromRecipient(recipient);
        const placeholderValues = {
          leadName: nameForSub,
          senderName: campaign.from_name || '',
          senderEmail: campaign.from_email || '',
          companyName: campaign.from_name || 'SetMyMeet',
        };
        const personalizedSubject = substitutePlaceholders(campaign.subject, placeholderValues);
        const personalizedBody = substitutePlaceholders(campaign.body_text, placeholderValues);
        const personalizedHtml = campaign.body_html
          ? substitutePlaceholders(campaign.body_html, placeholderValues)
          : buildFallbackEmailHtml(personalizedSubject, personalizedBody);

        const sendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: resendFrom,
            to: [recipient.email],
            subject: personalizedSubject,
            text: personalizedBody,
            html: personalizedHtml,
            headers: {
              'X-Bulk-Campaign-Id': campaignId,
            },
          }),
        });

        const resJson = await sendRes.json().catch(() => ({}));
        if (!sendRes.ok) {
          const errorMsg = resJson?.message || resJson?.error || `Resend failed with HTTP ${sendRes.status}`;
          await client.database
            .from('tenant_bulk_email_recipients')
            .update({
              status: 'failed',
              sent_at: new Date().toISOString(),
              failed_at: new Date().toISOString(),
              error_message: errorMsg,
            })
            .eq('id', recipient.id);
          results.push({ email: recipient.email, sent: false, error: errorMsg });
        } else {
          await client.database
            .from('tenant_bulk_email_recipients')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              provider_message_id: resJson?.id,
            })
            .eq('id', recipient.id);
          results.push({ email: recipient.email, sent: true });
        }
      }

      const { data: statusRows } = await client.database
        .from('tenant_bulk_email_recipients')
        .select('status')
        .eq('campaign_id', campaignId);

      const rows = statusRows || [];
      const pendingCount = rows.filter((row: any) => row.status === 'pending').length;
      const deliveredCount = rows.filter((row: any) => row.status === 'delivered').length;
      const failedCount = rows.filter((row: any) => ['failed', 'bounced'].includes(row.status)).length;
      const sentCount = rows.filter((row: any) => row.status !== 'pending').length;
      const nextStatus = pendingCount === 0 ? 'completed' : 'sending';

      await client.database
        .from('tenant_bulk_email_campaigns')
        .update({
          sent_count: sentCount,
          delivered_count: deliveredCount,
          failed_count: failedCount,
          status: nextStatus,
          completed_at: pendingCount === 0 ? new Date().toISOString() : null,
        })
        .eq('id', campaignId);

      return jsonResponse({
        success: true,
        status: nextStatus,
        processed: results.length,
        sent: results.filter((result) => result.sent).length,
        failed: results.filter((result) => !result.sent).length,
        pending: pendingCount,
        results,
      });
    }

    if (action === 'pause-campaign') {
      const campaignId = body.campaignId;
      if (!campaignId) return jsonResponse({ success: false, error: 'campaignId is required' }, 400);

      const { data, error } = await client.database
        .from('tenant_bulk_email_campaigns')
        .update({ status: 'paused' })
        .eq('tenant_id', tenantId)
        .eq('id', campaignId)
        .select();

      if (error) throw new Error(error.message);
      return jsonResponse({ success: true, campaign: data?.[0] });
    }

    if (action === 'resume-campaign') {
      const campaignId = body.campaignId;
      if (!campaignId) return jsonResponse({ success: false, error: 'campaignId is required' }, 400);

      // Check if tenant has another campaign active
      const { data: activeCampaigns } = await client.database
        .from('tenant_bulk_email_campaigns')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .in('status', ['queued', 'sending'])
        .neq('id', campaignId)
        .limit(1);

      if (activeCampaigns?.length) {
        return jsonResponse({
          success: false,
          error: `Cannot resume. Another campaign is currently active: "${activeCampaigns[0].name}".`,
        }, 400);
      }

      const { data, error } = await client.database
        .from('tenant_bulk_email_campaigns')
        .update({ status: 'sending' })
        .eq('tenant_id', tenantId)
        .eq('id', campaignId)
        .select();

      if (error) throw new Error(error.message);
      return jsonResponse({ success: true, campaign: data?.[0] });
    }

    if (action === 'cancel-campaign') {
      const campaignId = body.campaignId;
      if (!campaignId) return jsonResponse({ success: false, error: 'campaignId is required' }, 400);

      const { data, error } = await client.database
        .from('tenant_bulk_email_campaigns')
        .update({ status: 'failed', completed_at: new Date().toISOString(), metadata: { cancelled: true } })
        .eq('tenant_id', tenantId)
        .eq('id', campaignId)
        .select();

      if (error) throw new Error(error.message);
      return jsonResponse({ success: true, campaign: data?.[0] });
    }

    return jsonResponse({ success: false, error: 'Unsupported action' }, 400);
  } catch (error: any) {
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

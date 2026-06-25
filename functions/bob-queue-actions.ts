import { createClient } from 'npm:@insforge/sdk';
import twilio from 'npm:twilio';

const CALL_CONTEXT_TTL_MS = 20 * 60 * 1000;

type JsonRecord = Record<string, any>;

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

function normalizePhone(phone: string) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  return digits ? `+${digits}` : raw;
}

function nowIso() {
  return new Date().toISOString();
}

function firstValue(...values: any[]) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return null;
}

function consentDefaultTrue(value: any) {
  if (value === undefined || value === null || value === '') return true;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return true;
  if (['0', 'false', 'no', 'n', 'denied', 'deny', 'not allowed', 'opted out', 'opt-out', 'unsubscribed'].includes(normalized)) return false;
  return true;
}

function publicCall(call: any, session: any) {
  return {
    sid: call?.sid || null,
    status: call?.status || 'queued',
    from: call?.from || null,
    to: call?.to || null,
    voiceCallSessionId: session?.id || null,
    conversationId: session?.conversation_id || null,
    tenantAgentId: session?.tenant_agent_id || null,
    elevenlabsAgentId: session?.elevenlabs_agent_id || null,
  };
}

async function unwrap(result: any, message: string) {
  if (result?.error) throw new Error(result.error.message || message);
  return result?.data;
}

function requiredTenantId(input: any) {
  const tenantId = input?.tenantId || input?.tenant_id;
  if (!tenantId) throw new Error('tenantId is required');
  return String(tenantId);
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomContextToken() {
  return `${crypto.randomUUID()}.${crypto.randomUUID()}`;
}

async function resolveTenantIdByPhone(db: any, phone: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const { data } = await db.database.rpc('resolve_tenant_by_phone_number', {
    p_phone_number: normalized,
  });
  return data || null;
}

async function getTenantPrimaryPhoneNumber(db: any, tenantId: string) {
  if (!tenantId) return null;
  const { data } = await db.database.rpc('get_tenant_primary_phone_number', {
    p_tenant_id: tenantId,
  });
  return Array.isArray(data) ? data[0] || null : data || null;
}

async function getTenantPhoneNumberForChannel(db: any, tenantId: string, channel: 'voice' | 'sms' | 'whatsapp') {
  if (!tenantId) return null;
  let query = db.database.from('tenant_phone_numbers').select('*').eq('tenant_id', tenantId).eq('status', 'active');
  if (channel === 'voice') query = query.eq('voice_enabled', true);
  if (channel === 'sms') query = query.eq('sms_enabled', true);
  if (channel === 'whatsapp') query = query.eq('whatsapp_status', 'active');
  const rows = await unwrap(
    await query.order('is_primary', { ascending: false }).order('created_at', { ascending: true }).limit(1),
    `Failed to load tenant ${channel} phone number`
  );
  return rows?.[0] || null;
}

async function loadTenant(db: any, tenantId: string) {
  if (!tenantId) return null;
  const rows = await unwrap(
    await db.database.from('tenants').select('*').eq('id', tenantId).limit(1),
    'Failed to load tenant'
  );
  return rows?.[0] || null;
}

function defaultLifecycleRules(tenantId?: string | null) {
  return {
    tenantId: tenantId || null,
    maxCallAttempts: 3,
    channelOrder: ['call', 'sms', 'whatsapp', 'email'],
    voicemailAllowed: false,
    noAnswerPolicy: {
      first: { afterAttempt: 1, actionType: 'send_sms', channel: 'sms', delayMinutes: 10, requiresConsent: true },
      second: { afterAttempt: 2, actionType: 'queue_call_attempt', channel: 'call', delayBusinessDays: 1, respectBusinessHours: true },
      third: { afterAttempt: 3, actionType: 'enter_nurture', preferredChannels: ['email', 'whatsapp', 'sms'] },
    },
    busyPolicy: { actionType: 'schedule_callback', defaultDelayMinutes: 60, askForConvenientTime: true, respectBusinessHours: true },
    notAvailablePolicy: { actionType: 'schedule_callback', askForConvenientTime: true, askForPreferredChannel: true, respectBusinessHours: true },
    voicemailPolicy: { actionType: 'send_recap', delayMinutes: 5, preferredChannels: ['sms', 'email', 'whatsapp'], requiresConsent: true },
    nurturePolicy: { notInterestedNowDelayDays: 30, checkupCadenceDays: [7, 14, 30], maxCheckups: 3, preferredChannels: ['email', 'whatsapp', 'sms'] },
    humanReviewTriggers: { missingConsent: true, missingChannelSetup: true, ambiguousIntent: true, providerFailureLimit: 2, repeatedFailedAttempts: true },
    offDutyCallPolicy: { behavior: 'defer_to_next_business_window', respectTenantBusinessHours: true },
  };
}

function normalizeLifecycleRules(raw: any, tenantId?: string | null) {
  const base = defaultLifecycleRules(tenantId);
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    ...base,
    ...source,
    maxCallAttempts: Math.min(Math.max(Number(source.maxCallAttempts ?? source.max_call_attempts ?? base.maxCallAttempts) || 3, 1), 10),
    channelOrder: Array.isArray(source.channelOrder || source.channel_order)
      ? (source.channelOrder || source.channel_order).filter((channel: any) => ['call', 'sms', 'whatsapp', 'email'].includes(String(channel)))
      : base.channelOrder,
  };
}

async function loadEffectiveLifecycleRules(db: any, tenantId: string) {
  if (!tenantId) return defaultLifecycleRules(null);
  const result = await db.database.rpc('get_effective_tenant_lifecycle_rules', { p_tenant_id: tenantId });
  if (result?.error) {
    console.warn('Failed to load tenant lifecycle rules; using defaults', result.error.message || result.error);
    return defaultLifecycleRules(tenantId);
  }
  return normalizeLifecycleRules(result?.data, tenantId);
}

function parseBusinessTime(value: any, fallback: string) {
  const match = String(value || fallback).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return parseBusinessTime(fallback, '10:00');
  const hour = Math.min(Math.max(Number(match[1]), 0), 23);
  const minute = Math.min(Math.max(Number(match[2]), 0), 59);
  return { hour, minute, totalMinutes: hour * 60 + minute, label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
}

function normalizedTimeZone(value: any) {
  const timeZone = String(value || 'UTC').trim() || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return 'UTC';
  }
}

function timeZoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour === 24 ? 0 : values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = timeZoneParts(date, timeZone);
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return localAsUtc - date.getTime();
}

function zonedLocalTimeToUtc(parts: { year: number; month: number; day: number; hour: number; minute: number }, timeZone: string) {
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  let utc = new Date(localAsUtc - timeZoneOffsetMs(new Date(localAsUtc), timeZone));
  utc = new Date(localAsUtc - timeZoneOffsetMs(utc, timeZone));
  return utc;
}

function formatBusinessTime(time: { hour: number; minute: number }) {
  const suffix = time.hour >= 12 ? 'PM' : 'AM';
  const hour12 = time.hour % 12 || 12;
  return `${hour12}:${String(time.minute).padStart(2, '0')} ${suffix}`;
}

function businessHoursStatus(tenant: any, now = new Date()) {
  const timeZone = normalizedTimeZone(tenant?.default_timezone);
  const start = parseBusinessTime(tenant?.business_hours_start, '10:00');
  const end = parseBusinessTime(tenant?.business_hours_end, '17:00');
  const local = timeZoneParts(now, timeZone);
  const localMinutes = local.hour * 60 + local.minute;
  const allowed = localMinutes >= start.totalMinutes && localMinutes < end.totalMinutes;
  const nextLocalDayOffset = localMinutes < start.totalMinutes ? 0 : 1;
  const nextLocalMidnight = new Date(Date.UTC(local.year, local.month - 1, local.day + nextLocalDayOffset));
  const nextAllowedAt = zonedLocalTimeToUtc({
    year: nextLocalMidnight.getUTCFullYear(),
    month: nextLocalMidnight.getUTCMonth() + 1,
    day: nextLocalMidnight.getUTCDate(),
    hour: start.hour,
    minute: start.minute,
  }, timeZone);

  return {
    allowed,
    timeZone,
    start,
    end,
    nextAllowedAt: nextAllowedAt.toISOString(),
    localNow: `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`,
    label: `${formatBusinessTime(start)} - ${formatBusinessTime(end)} ${timeZone}`,
  };
}

function businessHoursBlockedMessage(status: ReturnType<typeof businessHoursStatus>) {
  return `Voice calls are allowed only during tenant business hours (${status.label}). Next calling window starts at ${status.nextAllowedAt}.`;
}

async function loadLead(db: any, tenantId: string, leadId: string) {
  if (!leadId) return null;
  const rows = await unwrap(
    await db.database.from('leads').select('*').eq('tenant_id', tenantId).eq('id', leadId).limit(1),
    'Failed to load lead'
  );
  return rows?.[0] || null;
}

async function ensureLeadConversation(db: any, tenantId: string, lead: any, channel: string) {
  if (!lead?.id) return null;
  const existing = await unwrap(
    await db.database
      .from('lead_conversations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('lead_id', lead.id)
      .eq('channel', channel)
      .limit(1),
    'Failed to load lead conversation'
  );
  if (existing?.[0]) return existing[0];

  const created = await unwrap(
    await db.database
      .from('lead_conversations')
      .insert([{ tenant_id: tenantId, lead_id: lead.id, channel, status: 'active', conversation_status: 'active_voice_call' }])
      .select(),
    'Failed to create lead conversation'
  );
  return created?.[0] || null;
}

async function loadTenantAgent(db: any, tenantId: string, agentId?: string | null) {
  if (!tenantId || !agentId) return null;
  const rows = await unwrap(
    await db.database.from('tenant_agents').select('*').eq('tenant_id', tenantId).eq('id', agentId).limit(1),
    'Failed to load tenant agent'
  );
  return rows?.[0] || null;
}

function isEmailCapableTenantAgent(agent: any) {
  return Boolean(agent?.id && ['live', 'testing', 'active'].includes(String(agent.status || '').toLowerCase()));
}

async function resolveEmailTenantAgent(db: any, tenantId: string, lead?: any, requestedAgentId?: string | null) {
  const requested = requestedAgentId ? await loadTenantAgent(db, tenantId, requestedAgentId) : null;
  if (isEmailCapableTenantAgent(requested)) return requested;

  const assigned = lead?.assigned_tenant_agent_id && lead.assigned_tenant_agent_id !== requestedAgentId
    ? await loadTenantAgent(db, tenantId, lead.assigned_tenant_agent_id)
    : null;
  if (isEmailCapableTenantAgent(assigned)) return assigned;

  const active = await unwrap(
    await db.database
      .from('tenant_agents')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('status', ['live', 'testing', 'active'])
      .order('status', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(25),
    'Failed to load active tenant email agent'
  );
  return (active || []).find(isEmailCapableTenantAgent) || null;
}

function isCallableTenantAgent(agent: any) {
  return Boolean(agent?.id && ['live', 'testing'].includes(agent.status) && agent.elevenlabs_agent_id);
}

async function resolveTenantAgent(db: any, tenantId: string, lead: any, requestedAgentId?: string | null) {
  const requested = requestedAgentId ? await loadTenantAgent(db, tenantId, requestedAgentId) : null;
  if (isCallableTenantAgent(requested)) return requested;

  const assigned = lead?.assigned_tenant_agent_id && lead.assigned_tenant_agent_id !== requestedAgentId
    ? await loadTenantAgent(db, tenantId, lead.assigned_tenant_agent_id)
    : null;
  if (isCallableTenantAgent(assigned)) return assigned;

  if (lead?.id && (requestedAgentId || lead.assigned_tenant_agent_id)) {
    await db.database.from('leads').update({
      assigned_tenant_agent_id: null,
      updated_at: nowIso(),
    }).eq('tenant_id', tenantId).eq('id', lead.id);
  }

  const active = await unwrap(
    await db.database
      .from('tenant_agents')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('status', ['live', 'testing'])
      .order('status', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(25),
    'Failed to load active tenant agent'
  );
  return (active || []).find(isCallableTenantAgent) || null;
}

function channelConsentColumn(channel: string) {
  if (channel === 'call' || channel === 'phone' || channel === 'voice') return 'call_consent';
  if (channel === 'sms') return 'sms_consent';
  if (channel === 'whatsapp') return 'whatsapp_consent';
  if (channel === 'email') return 'email_consent';
  return null;
}

function leadAllowsChannel(lead: any, channel: string) {
  const normalized = channel === 'phone' || channel === 'voice' ? 'call' : channel;
  const consentColumn = channelConsentColumn(normalized);
  if (!consentColumn) return { allowed: false, reason: 'Unsupported outreach channel' };
  if (lead?.automation_paused) return { allowed: false, reason: 'Lead automation is paused' };
  if (lead?.meeting_scheduled || lead?.lead_stage === 'booked' || lead?.scheduling_state === 'booked' || ['booked', 'scheduled'].includes(String(lead?.status || '').toLowerCase())) {
    return { allowed: false, reason: 'Lead is already booked' };
  }
  if (['closed_won', 'closed_lost', 'do_not_contact'].includes(String(lead?.lead_stage || '').toLowerCase())) {
    return { allowed: false, reason: 'Lead is in a stop state' };
  }
  if (lead?.do_not_contact) return { allowed: false, reason: 'Lead is marked do not contact' };
  if (lead?.opted_out_at && (!lead.opt_out_channel || lead.opt_out_channel === 'all' || lead.opt_out_channel === normalized)) {
    return { allowed: false, reason: 'Lead opted out of this channel' };
  }
  if (!lead?.[consentColumn]) return { allowed: false, reason: 'Missing channel consent' };
  return { allowed: true, reason: 'Consent is present' };
}

function normalizePreferredContactChannel(value: any) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '_');
  if (['phone', 'voice', 'call', 'calls', 'phone_call', 'phonecall', 'telephone'].includes(normalized)) return 'call';
  if (['email', 'e_mail', 'mail'].includes(normalized)) return 'email';
  if (['sms', 'text', 'text_message'].includes(normalized)) return 'sms';
  if (['whatsapp', 'wa'].includes(normalized)) return 'whatsapp';
  return normalized || '';
}

function leadPreferredContactChannel(lead: any) {
  const explicit = normalizePreferredContactChannel(lead?.preferred_contact_channel);
  const imported = lead?.custom_fields?.importedLeadData || {};
  const importedPreference = normalizePreferredContactChannel(
    imported.preferred_contact_method
      || imported.preferred_contact_channel
      || imported.preferred_method
      || imported.contact_method
      || ''
  );
  if (importedPreference && importedPreference !== explicit) {
    if (!explicit || explicit === 'email') return importedPreference;
  }
  return explicit;
}

function leadPrefersEmail(lead: any) {
  return leadPreferredContactChannel(lead) === 'email';
}

async function campaignLeadAttemptCount(db: any, action: any) {
  if (!action?.campaign_lead_id) return Number(action?.result?.attemptCount || action?.payload?.attemptCount || 0);
  const rows = await unwrap(
    await db.database
      .from('campaign_leads')
      .select('attempt_count')
      .eq('tenant_id', action.tenant_id)
      .eq('id', action.campaign_lead_id)
      .limit(1),
    'Failed to load campaign lead attempt count'
  );
  return Number(rows?.[0]?.attempt_count || action?.result?.attemptCount || action?.payload?.attemptCount || 0);
}

async function recordLifecycleBlockedEvent(db: any, input: {
  tenantId: string;
  lead: any;
  action?: any;
  outcome?: string;
  reason: string;
  blockedReason: string;
  metadata?: JsonRecord;
}) {
  if (!input.tenantId || !input.lead?.id) return;
  const { error } = await db.database.from('lead_lifecycle_events').insert([{
    tenant_id: input.tenantId,
    lead_id: input.lead.id,
    source_action_id: input.action?.id || null,
    source_channel: input.action?.channel === 'phone' ? 'call' : (input.action?.channel || 'system'),
    previous_stage: input.lead.lead_stage || null,
    next_stage: input.lead.lead_stage || null,
    previous_scheduling_state: input.lead.scheduling_state || null,
    next_scheduling_state: input.lead.scheduling_state || null,
    outcome: input.outcome || 'needs_human_review',
    reason: input.reason,
    blocked_reason: input.blockedReason,
    metadata: {
      source: 'phase22_rule_guard',
      ...(input.metadata || {}),
    },
  }]);
  if (error) console.warn('Failed to record Phase 22 lifecycle blocked event', error.message || error);
}

async function recordNurtureLifecycleEvent(db: any, input: {
  tenantId: string;
  lead: any;
  action?: any;
  outcome?: string;
  nextAction?: JsonRecord | null;
  nextActionType?: string | null;
  nextActionChannel?: string | null;
  nextActionAt?: string | null;
  reason: string;
  blockedReason?: string | null;
  metadata?: JsonRecord;
}) {
  if (!input.tenantId || !input.lead?.id) return null;
  const event = {
    id: crypto.randomUUID(),
    tenant_id: input.tenantId,
    lead_id: input.lead.id,
    source_action_id: input.action?.id || null,
    source_channel: canonicalEventChannel(input.action?.channel || input.nextActionChannel || 'system'),
    previous_stage: input.lead.lead_stage || null,
    next_stage: input.blockedReason ? (input.lead.lead_stage || 'nurture') : 'nurture',
    previous_scheduling_state: input.lead.scheduling_state || null,
    next_scheduling_state: input.blockedReason ? (input.lead.scheduling_state || 'needs_follow_up') : 'needs_follow_up',
    outcome: input.outcome || 'not_interested_now',
    next_action_type: input.nextActionType || input.nextAction?.action_type || null,
    next_action_channel: input.nextActionChannel || input.nextAction?.channel || null,
    next_action_at: input.nextActionAt || input.nextAction?.scheduled_for || null,
    reason: input.reason,
    blocked_reason: input.blockedReason || null,
    metadata: {
      source: 'phase31_nurture_scheduler',
      ruleVersion: 'phase31',
      ...(input.metadata || {}),
    },
  };
  const { error } = await db.database.from('lead_lifecycle_events').insert([event]);
  if (error) {
    console.warn('Failed to record Phase 31 nurture lifecycle event', error.message || error);
    return null;
  }
  return event;
}

async function findExistingNurtureFollowup(db: any, tenantId: string, leadId: string, actionId: string) {
  const rows = await unwrap(
    await db.database
      .from('bob_actions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('lead_id', leadId)
      .in('status', ['pending', 'awaiting_call', 'calling'])
      .order('created_at', { ascending: false })
      .limit(50),
    'Failed to inspect existing nurture follow-ups'
  );
  return (rows || []).find((row: any) => row?.payload?.nurture?.previousActionId === actionId) || null;
}

async function stopNurtureActionIfBlocked(db: any, action: any, lead: any) {
  if (!isNurtureAction(action)) return false;
  const blockedReason = nurtureStopReason(lead);
  if (!blockedReason) return false;
  const reason = `Nurture stopped because ${blockedReason.replace(/_/g, ' ')}.`;
  await db.database.from('bob_actions').update({
    status: 'skipped',
    executed_at: nowIso(),
    updated_at: nowIso(),
    result: {
      ...(action.result || {}),
      skipped: true,
      blockedReason,
      phase31Nurture: { stoppedAt: nowIso(), reason },
    },
  }).eq('tenant_id', action.tenant_id).eq('id', action.id);
  await recordNurtureLifecycleEvent(db, {
    tenantId: action.tenant_id,
    lead,
    action,
    reason,
    blockedReason,
    metadata: { actionStatus: action.status, nurtureStep: nurtureStepFromAction(action) },
  });
  if (action.campaign_lead_id) {
    await db.database.from('campaign_leads').update({
      status: 'stopped',
      current_step: 'nurture_stopped',
      next_action_at: null,
      stop_reason: reason,
      updated_at: nowIso(),
    }).eq('tenant_id', action.tenant_id).eq('id', action.campaign_lead_id);
  }
  return true;
}

async function scheduleNextNurtureCheckup(db: any, input: { tenantId: string; lead: any; action: any; rules: any; sentChannel: string }) {
  if (!isNurtureAction(input.action)) return null;
  const lead = await loadLead(db, input.tenantId, input.lead.id);
  const blockedReason = nurtureStopReason(lead);
  if (blockedReason) {
    await recordNurtureLifecycleEvent(db, {
      tenantId: input.tenantId,
      lead: lead || input.lead,
      action: input.action,
      reason: `Nurture did not schedule another checkup because ${blockedReason.replace(/_/g, ' ')}.`,
      blockedReason,
      metadata: { sentChannel: input.sentChannel, nurtureStep: nurtureStepFromAction(input.action) },
    });
    return null;
  }

  const existing = await findExistingNurtureFollowup(db, input.tenantId, lead.id, input.action.id);
  if (existing) return existing;

  const policy = nurturePolicyFromRules(input.rules);
  const currentStep = nurtureStepFromAction(input.action);
  if (currentStep >= policy.maxCheckups) {
    const reason = `Nurture checkup limit reached (${currentStep}/${policy.maxCheckups}); human review is required before more outreach.`;
    await db.database.from('leads').update({
      requires_human_review: true,
      escalation_reason: 'nurture_limit_reached',
      next_contact_at: null,
      updated_at: nowIso(),
    }).eq('tenant_id', input.tenantId).eq('id', lead.id);
    await recordNurtureLifecycleEvent(db, {
      tenantId: input.tenantId,
      lead,
      action: input.action,
      reason,
      blockedReason: 'nurture_limit_reached',
      metadata: { sentChannel: input.sentChannel, nurtureStep: currentStep, maxCheckups: policy.maxCheckups },
    });
    if (input.action.campaign_lead_id) {
      await db.database.from('campaign_leads').update({
        status: 'stopped',
        current_step: 'nurture_limit_reached',
        next_action_at: null,
        stop_reason: reason,
        updated_at: nowIso(),
      }).eq('tenant_id', input.tenantId).eq('id', input.action.campaign_lead_id);
    }
    return null;
  }

  const nextStep = currentStep + 1;
  const delayDays = policy.cadenceDays[Math.min(nextStep - 1, policy.cadenceDays.length - 1)] || 30;
  const selected = await chooseAllowedChannel(db, input.tenantId, lead, nurtureChannelCandidates(lead, input.rules));
  if (!selected) {
    const reason = 'Nurture could not schedule another checkup because no consented and configured channel is available.';
    await db.database.from('leads').update({
      requires_human_review: true,
      escalation_reason: 'missing_consent_or_channel_setup',
      next_contact_at: null,
      updated_at: nowIso(),
    }).eq('tenant_id', input.tenantId).eq('id', lead.id);
    await recordNurtureLifecycleEvent(db, {
      tenantId: input.tenantId,
      lead,
      action: input.action,
      reason,
      blockedReason: 'missing_consent_or_channel_setup',
      metadata: { sentChannel: input.sentChannel, nurtureStep: currentStep, maxCheckups: policy.maxCheckups },
    });
    if (input.action.campaign_lead_id) {
      await db.database.from('campaign_leads').update({
        status: 'stopped',
        current_step: 'nurture_channel_blocked',
        next_action_at: null,
        stop_reason: reason,
        updated_at: nowIso(),
      }).eq('tenant_id', input.tenantId).eq('id', input.action.campaign_lead_id);
    }
    return null;
  }

  const tenant = selected.channel === 'call' ? await loadTenant(db, input.tenantId) : null;
  let scheduledFor = addDays(new Date(), delayDays);
  if (selected.channel === 'call' && tenant?.id) {
    const hours = businessHoursStatus(tenant, scheduledFor);
    if (!hours.allowed) scheduledFor = new Date(hours.nextAllowedAt);
  }
  const reason = `Schedule nurture checkup ${nextStep}/${policy.maxCheckups} in ${delayDays} day(s) through ${selected.channel}.`;
  const rows = await unwrap(
    await db.database.from('bob_actions').insert([{
      tenant_id: input.tenantId,
      campaign_id: input.action.campaign_id || null,
      campaign_lead_id: input.action.campaign_lead_id || null,
      lead_id: lead.id,
      conversation_id: input.action.conversation_id || null,
      action_type: channelActionType(selected.channel),
      channel: actionChannel(selected.channel),
      status: actionStatusForChannel(selected.channel),
      reason,
      scheduled_for: scheduledFor.toISOString(),
      payload: {
        source: 'phase31_nurture_scheduler',
        sourceActionId: input.action.id,
        sourceOutcome: input.action.payload?.sourceOutcome || 'not_interested_now',
        tenantAgentId: input.action.payload?.tenantAgentId || input.action.payload?.tenant_agent_id || lead.assigned_tenant_agent_id || null,
        nurture: {
          active: true,
          step: nextStep,
          maxCheckups: policy.maxCheckups,
          cadenceDays: policy.cadenceDays,
          previousActionId: input.action.id,
          previousChannel: input.sentChannel,
        },
        lifecycle: {
          stage: 'nurture',
          schedulingState: 'needs_follow_up',
          channel: selected.channel,
          actionAt: scheduledFor.toISOString(),
          reason,
          nurtureStep: nextStep,
        },
      },
    }]).select(),
    'Failed to create nurture follow-up action'
  );
  const nextAction = rows?.[0] || null;
  await db.database.from('leads').update({
    lead_stage: 'nurture',
    scheduling_state: 'needs_follow_up',
    next_contact_at: scheduledFor.toISOString(),
    requires_human_review: false,
    escalation_reason: null,
    updated_at: nowIso(),
  }).eq('tenant_id', input.tenantId).eq('id', lead.id);
  if (input.action.campaign_lead_id) {
    await db.database.from('campaign_leads').update({
      status: 'queued',
      current_step: `nurture_checkup_${nextStep}`,
      next_action_at: scheduledFor.toISOString(),
      stop_reason: null,
      updated_at: nowIso(),
    }).eq('tenant_id', input.tenantId).eq('id', input.action.campaign_lead_id);
  }
  await recordNurtureLifecycleEvent(db, {
    tenantId: input.tenantId,
    lead,
    action: input.action,
    nextAction,
    nextActionType: nextAction?.action_type || null,
    nextActionChannel: selected.channel,
    nextActionAt: scheduledFor.toISOString(),
    reason,
    metadata: {
      sentChannel: input.sentChannel,
      previousNurtureStep: currentStep,
      nextNurtureStep: nextStep,
      maxCheckups: policy.maxCheckups,
      delayDays,
      channelSetup: selected.setup,
    },
  });
  return nextAction;
}

async function safeScheduleNextNurtureCheckup(db: any, input: { tenantId: string; lead: any; action: any; rules: any; sentChannel: string }) {
  if (!isNurtureAction(input.action)) return { action: null, error: null };
  try {
    const action = await scheduleNextNurtureCheckup(db, input);
    return { action, error: null };
  } catch (error) {
    const message = String(error?.message || 'Nurture scheduling failed');
    console.warn('Phase 31 nurture scheduling failed', message);
    return { action: null, error: message };
  }
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + Math.max(0, Number(minutes) || 0) * 60 * 1000);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + Math.max(0, Number(days) || 0) * 24 * 60 * 60 * 1000);
}

function normalizeLifecycleOutcome(value: any) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const aliases: JsonRecord = {
    noanswer: 'no_answer',
    no_answered: 'no_answer',
    unanswered: 'no_answer',
    completed: 'answered',
    canceled: 'failed',
    cancelled: 'failed',
    human_review: 'needs_human_review',
    not_available_now: 'not_available',
    channel_switch: 'channel_switch_requested',
    callback: 'callback_requested',
    opt_out: 'opted_out',
    dnc: 'opted_out',
    do_not_contact: 'opted_out',
    booked_meeting: 'booked',
    left_voicemail: 'voicemail_left',
    voicemail: 'voicemail_left',
    answering_machine: 'voicemail_left',
    machine: 'voicemail_left',
    machine_answered: 'voicemail_left',
  };
  const outcome = aliases[normalized] || normalized;
  const allowed = new Set([
    'answered',
    'no_answer',
    'busy',
    'voicemail_left',
    'callback_requested',
    'not_available',
    'channel_switch_requested',
    'not_interested_now',
    'not_interested_final',
    'wrong_number',
    'opted_out',
    'booked',
    'failed',
    'interrupted',
    'needs_human_review',
  ]);
  return allowed.has(outcome) ? outcome : 'needs_human_review';
}

function canonicalEventChannel(channel: any) {
  const normalized = normalizePreferredContactChannel(channel);
  if (normalized === 'call') return 'call';
  if (['sms', 'whatsapp', 'email', 'messenger'].includes(normalized)) return normalized;
  return 'system';
}

function actionChannel(channel: string) {
  return channel === 'call' ? 'phone' : channel;
}

function channelActionType(channel: string) {
  if (channel === 'call') return 'queue_call_attempt';
  if (channel === 'sms') return 'send_sms';
  if (channel === 'whatsapp') return 'send_whatsapp';
  if (channel === 'email') return 'send_email';
  return 'human_review';
}

function actionStatusForChannel(channel: string) {
  return channel === 'call' ? 'awaiting_call' : 'pending';
}

function parseIsoDate(value: any) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function scheduledAtBusinessWindow(tenant: any, baseDate: Date, dayOffset = 0) {
  const timeZone = normalizedTimeZone(tenant?.default_timezone);
  const start = parseBusinessTime(tenant?.business_hours_start, '10:00');
  const local = timeZoneParts(baseDate, timeZone);
  const targetMidnight = new Date(Date.UTC(local.year, local.month - 1, local.day + Math.max(0, Number(dayOffset) || 0)));
  const target = zonedLocalTimeToUtc({
    year: targetMidnight.getUTCFullYear(),
    month: targetMidnight.getUTCMonth() + 1,
    day: targetMidnight.getUTCDate(),
    hour: start.hour,
    minute: start.minute,
  }, timeZone);
  return target <= baseDate ? scheduledAtBusinessWindow(tenant, baseDate, dayOffset + 1) : target;
}

function normalizeRequestedChannel(value: any) {
  const channel = normalizePreferredContactChannel(value);
  return ['call', 'sms', 'whatsapp', 'email'].includes(channel) ? channel : '';
}

async function channelSetupStatus(db: any, tenantId: string, lead: any, channel: string) {
  const consent = leadAllowsChannel(lead, channel);
  if (!consent.allowed) return { allowed: false, blockedReason: 'missing_consent_or_stop_state', reason: consent.reason };

  if (channel === 'email') {
    if (!lead?.email) return { allowed: false, blockedReason: 'missing_channel_setup', reason: 'Lead email address is missing' };
    return { allowed: true, reason: consent.reason };
  }

  if (channel === 'call') {
    if (!lead?.phone) return { allowed: false, blockedReason: 'missing_channel_setup', reason: 'Lead phone number is missing' };
    const phone = await getTenantPhoneNumberForChannel(db, tenantId, 'voice');
    if (!phone?.id) return { allowed: false, blockedReason: 'missing_channel_setup', reason: 'Tenant has no active voice sender' };
    return { allowed: true, reason: consent.reason };
  }

  if (channel === 'sms') {
    if (!lead?.phone) return { allowed: false, blockedReason: 'missing_channel_setup', reason: 'Lead phone number is missing' };
    const phone = await getTenantPhoneNumberForChannel(db, tenantId, 'sms');
    if (!phone?.id) return { allowed: false, blockedReason: 'missing_channel_setup', reason: 'Tenant has no active SMS sender' };
    return { allowed: true, reason: consent.reason };
  }

  if (channel === 'whatsapp') {
    if (!lead?.phone) return { allowed: false, blockedReason: 'missing_channel_setup', reason: 'Lead phone number is missing' };
    if (globalWhatsappSenderPhone()) return { allowed: true, reason: consent.reason };
    const phone = await getTenantPhoneNumberForChannel(db, tenantId, 'whatsapp');
    if (!phone?.id) return { allowed: false, blockedReason: 'missing_channel_setup', reason: 'Tenant WhatsApp sender is not active' };
    return { allowed: true, reason: consent.reason };
  }

  return { allowed: false, blockedReason: 'unsupported_channel', reason: 'Unsupported lifecycle channel' };
}

async function chooseAllowedChannel(db: any, tenantId: string, lead: any, channels: string[]) {
  for (const rawChannel of channels) {
    const channel = normalizeRequestedChannel(rawChannel);
    if (!channel) continue;
    const setup = await channelSetupStatus(db, tenantId, lead, channel);
    if (setup.allowed) return { channel, setup };
  }
  return null;
}

async function loadBobAction(db: any, tenantId: string | null, actionId: string | null) {
  if (!actionId) return null;
  let query = db.database.from('bob_actions').select('*').eq('id', actionId).limit(1);
  if (tenantId) query = query.eq('tenant_id', tenantId);
  const rows = await unwrap(await query, 'Failed to load lifecycle source action');
  return rows?.[0] || null;
}

async function existingPhase23Event(db: any, tenantId: string, sourceActionId?: string | null) {
  if (!sourceActionId) return null;
  const rows = await unwrap(
    await db.database
      .from('lead_lifecycle_events')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('source_action_id', sourceActionId)
      .order('created_at', { ascending: false })
      .limit(10),
    'Failed to inspect lifecycle events'
  );
  return (rows || []).find((row: any) => row?.metadata?.source === 'phase23_lifecycle_evaluator') || null;
}

async function findExistingLifecycleAction(db: any, tenantId: string, leadId: string, eventId: string) {
  const rows = await unwrap(
    await db.database
      .from('bob_actions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('lead_id', leadId)
      .in('status', ['pending', 'awaiting_call', 'calling'])
      .order('created_at', { ascending: false })
      .limit(50),
    'Failed to inspect existing lifecycle actions'
  );
  return (rows || []).find((row: any) => row?.payload?.sourceLifecycleEventId === eventId) || null;
}

async function countLeadCallAttempts(db: any, tenantId: string, leadId: string, action?: any) {
  if (action?.campaign_lead_id) return campaignLeadAttemptCount(db, action);
  const rows = await unwrap(
    await db.database
      .from('bob_actions')
      .select('id,status,result,action_type')
      .eq('tenant_id', tenantId)
      .eq('lead_id', leadId)
      .eq('action_type', 'queue_call_attempt')
      .in('status', ['calling', 'completed', 'failed', 'skipped', 'awaiting_human'])
      .limit(100),
    'Failed to count lead call attempts'
  );
  return rows?.length || 0;
}

async function insertLifecycleEvent(db: any, input: {
  tenantId: string;
  lead: any;
  sourceAction?: any;
  sourceChannel: string;
  outcome: string;
  nextStage: string;
  nextSchedulingState: string;
  nextActionType?: string | null;
  nextActionChannel?: string | null;
  nextActionAt?: string | null;
  reason: string;
  blockedReason?: string | null;
  metadata?: JsonRecord;
}) {
  const event = {
      id: crypto.randomUUID(),
      tenant_id: input.tenantId,
      lead_id: input.lead.id,
      source_action_id: input.sourceAction?.id || null,
      source_channel: canonicalEventChannel(input.sourceChannel),
      previous_stage: input.lead.lead_stage || null,
      next_stage: input.nextStage || input.lead.lead_stage || null,
      previous_scheduling_state: input.lead.scheduling_state || null,
      next_scheduling_state: input.nextSchedulingState || input.lead.scheduling_state || null,
      outcome: input.outcome,
      next_action_type: input.nextActionType || null,
      next_action_channel: input.nextActionChannel || null,
      next_action_at: input.nextActionAt || null,
      reason: input.reason,
      blocked_reason: input.blockedReason || null,
      metadata: {
        source: 'phase23_lifecycle_evaluator',
        ruleVersion: 'phase23',
        ...(input.metadata || {}),
      },
    };
  await unwrap(
    await db.database.from('lead_lifecycle_events').insert([event]),
    'Failed to write lifecycle event'
  );
  return event;
}

async function evaluateLeadLifecycle(db: any, body: JsonRecord) {
  const inputTenantId = body.tenantId || body.tenant_id || null;
  const sourceActionId = body.actionId || body.action_id || body.sourceActionId || body.source_action_id || null;
  const sourceAction = await loadBobAction(db, inputTenantId ? String(inputTenantId) : null, sourceActionId ? String(sourceActionId) : null);
  const tenantId = String(inputTenantId || sourceAction?.tenant_id || '');
  if (!tenantId) throw new Error('tenantId is required');

  const leadId = String(body.leadId || body.lead_id || sourceAction?.lead_id || '');
  if (!leadId) throw new Error('leadId is required');

  const existingEvent = await existingPhase23Event(db, tenantId, sourceAction?.id || sourceActionId);
  if (existingEvent) {
    const existingAction = await findExistingLifecycleAction(db, tenantId, leadId, existingEvent.id);
    return { idempotent: true, event: existingEvent, action: existingAction };
  }

  const lead = await loadLead(db, tenantId, leadId);
  if (!lead?.id) throw new Error('Tenant lead was not found');
  const tenant = await loadTenant(db, tenantId);
  if (!tenant?.id) throw new Error('Tenant was not found');

  const rules = await loadEffectiveLifecycleRules(db, tenantId);
  const outcome = normalizeLifecycleOutcome(body.outcome || sourceAction?.result?.outcome || sourceAction?.result?.callStatus || sourceAction?.result?.status);
  const requestedChannel = normalizeRequestedChannel(body.requestedChannel || body.requested_channel || body.preferredChannel || body.preferred_channel);
  const requestedAt = parseIsoDate(body.requestedCallbackAt || body.requested_callback_at || body.nextActionAt || body.next_action_at);
  const sourceChannel = body.sourceChannel || body.source_channel || sourceAction?.channel || 'system';
  const attemptCount = Number(body.attemptCount || body.attempt_count || await countLeadCallAttempts(db, tenantId, leadId, sourceAction));
  const now = new Date();

  let decision: JsonRecord = {
    allowed: false,
    nextStage: lead.lead_stage || 'new',
    nextSchedulingState: lead.scheduling_state || 'not_started',
    nextActionType: null,
    nextActionChannel: null,
    nextActionAt: null,
    reason: 'Lifecycle evaluator could not select an automated next action.',
    blockedReason: 'needs_human_review',
    requiresHumanReview: true,
    leadPatch: {},
    payload: {},
  };

  const stopPatch = (stage: string, schedulingState: string, reason: string, extra: JsonRecord = {}) => {
    decision = {
      ...decision,
      allowed: false,
      nextStage: stage,
      nextSchedulingState: schedulingState,
      reason,
      blockedReason: null,
      requiresHumanReview: false,
      leadPatch: {
        lead_stage: stage,
        scheduling_state: schedulingState,
        next_contact_at: null,
        requires_human_review: false,
        escalation_reason: null,
        ...extra,
      },
    };
  };

  const setHumanReview = (reason: string, blockedReason: string, stage = lead.lead_stage || 'new', schedulingState = lead.scheduling_state || 'not_started') => {
    decision = {
      ...decision,
      allowed: false,
      nextStage: stage,
      nextSchedulingState: schedulingState,
      reason,
      blockedReason,
      requiresHumanReview: true,
      leadPatch: {
        requires_human_review: true,
        escalation_reason: blockedReason,
        next_contact_at: null,
      },
    };
  };

  const setAction = async (input: {
    stage: string;
    schedulingState: string;
    channels: string[];
    scheduledFor: Date;
    reason: string;
    payload?: JsonRecord;
  }) => {
    const selected = await chooseAllowedChannel(db, tenantId, lead, input.channels);
    if (!selected) {
      setHumanReview('No consented and configured channel is available for the lifecycle next action.', 'missing_consent_or_channel_setup', input.stage, input.schedulingState);
      return;
    }
    let scheduledFor = input.scheduledFor;
    if (selected.channel === 'call') {
      const hours = businessHoursStatus(tenant, scheduledFor);
      if (!hours.allowed) scheduledFor = new Date(hours.nextAllowedAt);
    }
    decision = {
      ...decision,
      allowed: true,
      nextStage: input.stage,
      nextSchedulingState: input.schedulingState,
      nextActionType: channelActionType(selected.channel),
      nextActionChannel: selected.channel,
      nextActionAt: scheduledFor.toISOString(),
      reason: input.reason,
      blockedReason: null,
      requiresHumanReview: false,
      leadPatch: {
        lead_stage: input.stage,
        scheduling_state: input.schedulingState,
        next_contact_at: scheduledFor.toISOString(),
        requires_human_review: false,
        escalation_reason: null,
      },
      payload: {
        ...(input.payload || {}),
        channelSetup: selected.setup,
      },
    };
  };

  if (lead?.do_not_contact || lead?.lead_stage === 'do_not_contact') {
    stopPatch('do_not_contact', lead.scheduling_state || 'not_started', 'Lead is marked do-not-contact; automation remains stopped.', { do_not_contact: true });
  } else if (lead?.meeting_scheduled || lead?.lead_stage === 'booked' || lead?.scheduling_state === 'booked') {
    stopPatch('booked', 'booked', 'Lead is already booked; sales outreach is stopped.');
  } else if (outcome === 'booked') {
    stopPatch('booked', 'booked', 'Booking is confirmed; sales outreach is stopped.');
  } else if (outcome === 'opted_out' || outcome === 'wrong_number' || outcome === 'not_interested_final') {
    const optOutChannel = canonicalEventChannel(sourceChannel);
    stopPatch('do_not_contact', lead.scheduling_state || 'not_started', 'Lead reached a final stop outcome; automation is stopped.', {
      do_not_contact: true,
      opted_out_at: outcome === 'opted_out' ? now.toISOString() : lead.opted_out_at || null,
      opt_out_channel: outcome === 'opted_out' ? (['call', 'sms', 'whatsapp', 'email'].includes(optOutChannel) ? optOutChannel : 'all') : lead.opt_out_channel || null,
    });
  } else if (lead?.automation_paused) {
    setHumanReview('Lead automation is paused; lifecycle scheduling is blocked.', 'automation_paused');
  } else if (outcome === 'no_answer') {
    const nextAttempt = attemptCount + 1;
    if (nextAttempt >= Number(rules.maxCallAttempts || 3)) {
      const nurtureChannels = rules?.noAnswerPolicy?.third?.preferredChannels || rules?.nurturePolicy?.preferredChannels || ['email', 'whatsapp', 'sms'];
      const nurturePolicy = nurturePolicyFromRules(rules);
      const delayDays = nurturePolicy.cadenceDays[0] || 7;
      await setAction({
        stage: 'nurture',
        schedulingState: 'needs_follow_up',
        channels: nurtureChannels,
        scheduledFor: addDays(now, delayDays),
        reason: `No answer after ${nextAttempt} call attempt(s); move to nurture and check in after ${delayDays} day(s) through the best consented channel.`,
        payload: {
          outcome,
          attemptCount,
          nextAttempt,
          lifecyclePath: 'no_answer_third_nurture',
          nurture: { active: true, step: 1, maxCheckups: nurturePolicy.maxCheckups, cadenceDays: nurturePolicy.cadenceDays },
        },
      });
    } else if (nextAttempt === 1) {
      const policy = rules?.noAnswerPolicy?.first || {};
      await setAction({
        stage: 'attempting_contact',
        schedulingState: 'needs_follow_up',
        channels: [policy.channel || 'sms'],
        scheduledFor: addMinutes(now, Number(policy.delayMinutes || 10)),
        reason: policy.reason || 'First no-answer: send a short SMS follow-up when allowed.',
        payload: { outcome, attemptCount, nextAttempt, lifecyclePath: 'no_answer_first_sms' },
      });
    } else {
      const policy = rules?.noAnswerPolicy?.second || {};
      await setAction({
        stage: 'attempting_contact',
        schedulingState: 'needs_follow_up',
        channels: [policy.channel || 'call'],
        scheduledFor: scheduledAtBusinessWindow(tenant, now, Number(policy.delayBusinessDays || 1)),
        reason: policy.reason || 'Second no-answer: retry the call next business day inside tenant calling hours.',
        payload: { outcome, attemptCount, nextAttempt, lifecyclePath: 'no_answer_second_call' },
      });
    }
  } else if (outcome === 'busy' || outcome === 'not_available' || outcome === 'callback_requested') {
    const scheduledFor = requestedAt || addMinutes(now, Number(rules?.busyPolicy?.defaultDelayMinutes || 60));
    await setAction({
      stage: 'callback_scheduled',
      schedulingState: 'callback_requested',
      channels: [requestedChannel || 'call', ...(rules.channelOrder || ['call', 'sms', 'whatsapp', 'email'])],
      scheduledFor,
      reason: requestedAt ? 'Lead requested a callback time; schedule the next consent-safe action.' : 'Lead was busy or unavailable; schedule a conservative callback.',
      payload: { outcome, requestedChannel: requestedChannel || null, requestedAt: requestedAt?.toISOString() || null, lifecyclePath: 'callback' },
    });
  } else if (outcome === 'channel_switch_requested') {
    await setAction({
      stage: 'engaged',
      schedulingState: 'needs_follow_up',
      channels: [requestedChannel, ...(rules.channelOrder || ['sms', 'email', 'whatsapp', 'call'])].filter(Boolean),
      scheduledFor: requestedAt || addMinutes(now, 5),
      reason: requestedChannel ? `Lead requested ${requestedChannel}; schedule follow-up only if consent and setup allow it.` : 'Lead requested a channel switch; choose the best consented configured channel.',
      payload: { outcome, requestedChannel: requestedChannel || null, lifecyclePath: 'channel_switch' },
    });
  } else if (outcome === 'voicemail_left') {
    const policy = rules?.voicemailPolicy || {};
    await setAction({
      stage: 'attempting_contact',
      schedulingState: 'needs_follow_up',
      channels: policy.preferredChannels || ['sms', 'email', 'whatsapp'],
      scheduledFor: addMinutes(now, Number(policy.delayMinutes || 5)),
      reason: policy.reason || 'Voicemail left: send a short recap through the best consented channel.',
      payload: { outcome, lifecyclePath: 'voicemail_recap' },
    });
  } else if (outcome === 'not_interested_now') {
    const days = Number(rules?.nurturePolicy?.notInterestedNowDelayDays || 30);
    const nurturePolicy = nurturePolicyFromRules(rules);
    await setAction({
      stage: 'nurture',
      schedulingState: 'needs_follow_up',
      channels: rules?.nurturePolicy?.preferredChannels || ['email', 'whatsapp', 'sms'],
      scheduledFor: addDays(now, days),
      reason: `Lead is not ready now; move to nurture and follow up in ${days} day(s) if consent remains valid.`,
      payload: {
        outcome,
        lifecyclePath: 'not_interested_now_nurture',
        nurtureDelayDays: days,
        nurture: { active: true, step: 1, maxCheckups: nurturePolicy.maxCheckups, cadenceDays: nurturePolicy.cadenceDays },
      },
    });
  } else if (outcome === 'answered' && body.bookingIntent) {
    stopPatch('booking_offered', 'booking_requested', 'Lead requested booking details; wait for date/time or continue the active booking flow.', {
      preferred_contact_channel: requestedChannel || lead.preferred_contact_channel || null,
    });
  } else if (outcome === 'answered') {
    stopPatch('contacted', lead.scheduling_state || 'not_started', 'Lead was contacted; no autonomous recovery action is needed yet.');
  } else {
    setHumanReview('Lifecycle outcome needs human review before more automation is scheduled.', 'ambiguous_or_failed_outcome');
  }

  const event = await insertLifecycleEvent(db, {
    tenantId,
    lead,
    sourceAction,
    sourceChannel,
    outcome,
    nextStage: decision.nextStage,
    nextSchedulingState: decision.nextSchedulingState,
    nextActionType: decision.nextActionType,
    nextActionChannel: decision.nextActionChannel,
    nextActionAt: decision.nextActionAt,
    reason: decision.reason,
    blockedReason: decision.blockedReason,
    metadata: {
      attemptCount,
      sourceActionStatus: sourceAction?.status || null,
      requestedChannel: requestedChannel || null,
      requestedAt: requestedAt?.toISOString() || null,
      decisionAllowed: decision.allowed,
      ...(decision.payload || {}),
      ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
    },
  });

  await db.database.from('leads').update({
    ...(decision.leadPatch || {}),
    updated_at: nowIso(),
  }).eq('tenant_id', tenantId).eq('id', lead.id);

  let nextAction = null;
  if (decision.allowed && decision.nextActionType && decision.nextActionAt && event?.id) {
    const existingAction = await findExistingLifecycleAction(db, tenantId, lead.id, event.id);
    if (existingAction) {
      nextAction = existingAction;
    } else {
      const rows = await unwrap(
        await db.database.from('bob_actions').insert([{
          tenant_id: tenantId,
          campaign_id: sourceAction?.campaign_id || body.campaignId || body.campaign_id || null,
          campaign_lead_id: sourceAction?.campaign_lead_id || body.campaignLeadId || body.campaign_lead_id || null,
          lead_id: lead.id,
          conversation_id: sourceAction?.conversation_id || body.conversationId || body.conversation_id || null,
          action_type: decision.nextActionType,
          channel: actionChannel(decision.nextActionChannel),
          status: actionStatusForChannel(decision.nextActionChannel),
          reason: decision.reason,
          scheduled_for: decision.nextActionAt,
          payload: {
            source: 'phase23_lifecycle_evaluator',
            sourceLifecycleEventId: event.id,
            sourceActionId: sourceAction?.id || null,
            sourceOutcome: outcome,
            tenantAgentId: sourceAction?.payload?.tenantAgentId || sourceAction?.payload?.tenant_agent_id || lead.assigned_tenant_agent_id || null,
            ...(decision.payload || {}),
            lifecycle: {
              stage: decision.nextStage,
              schedulingState: decision.nextSchedulingState,
              channel: decision.nextActionChannel,
              actionAt: decision.nextActionAt,
              reason: decision.reason,
              nurtureStep: decision.payload?.nurture?.step || null,
            },
          },
        }]).select(),
        'Failed to create lifecycle Bob action'
      );
      nextAction = rows?.[0] || null;
    }
  }

  if (sourceAction?.campaign_lead_id) {
    const patch = decision.allowed
      ? {
        status: 'queued',
        current_step: `lifecycle_${decision.nextActionType}`,
        next_action_at: decision.nextActionAt,
        stop_reason: null,
        updated_at: nowIso(),
      }
      : {
        status: decision.requiresHumanReview ? 'stopped' : 'completed',
        current_step: decision.requiresHumanReview ? 'lifecycle_human_review' : `lifecycle_${decision.nextStage}`,
        next_action_at: null,
        stop_reason: decision.requiresHumanReview ? decision.reason : null,
        updated_at: nowIso(),
      };
    await db.database.from('campaign_leads').update(patch).eq('tenant_id', tenantId).eq('id', sourceAction.campaign_lead_id);
  }

  return {
    idempotent: false,
    decision: {
      outcome,
      nextStage: decision.nextStage,
      nextSchedulingState: decision.nextSchedulingState,
      nextActionType: decision.nextActionType,
      nextActionChannel: decision.nextActionChannel,
      nextActionAt: decision.nextActionAt,
      reason: decision.reason,
      blockedReason: decision.blockedReason,
      requiresHumanReview: decision.requiresHumanReview,
    },
    event,
    action: nextAction,
  };
}

function getTwilioClient() {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials are not configured for this function');
  }
  return twilio(accountSid, authToken);
}

function functionBaseUrl() {
  const configured = Deno.env.get('INSFORGE_FUNCTION_BASE_URL');
  if (!configured) throw new Error('INSFORGE_FUNCTION_BASE_URL is required for Twilio voice callbacks');
  return configured.replace(/\/$/, '');
}

function voiceWebhookUrl(params: JsonRecord) {
  const url = new URL('/twilio-voice-webhook', functionBaseUrl());
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== '') url.searchParams.set(key, String(value));
  });
  return url.toString();
}

async function startOutboundCall(input: { to: string; from: string; twimlUrl: string; statusCallbackUrl: string }) {
  if (!input.to) throw new Error('Call recipient phone number is required');
  if (!input.from) throw new Error('Caller phone number is required');
  const client = getTwilioClient();
  return client.calls.create({
    to: input.to,
    from: input.from,
    url: input.twimlUrl,
    method: 'POST',
    timeout: 60,
    statusCallback: input.statusCallbackUrl,
    statusCallbackMethod: 'POST',
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
  });
}

async function sendDashboardTestSms(db: any, body: JsonRecord) {
  const tenantId = requiredTenantId(body);
  const lead = await loadLead(db, tenantId, body.leadId || body.lead_id);
  if (!lead) throw new Error('Tenant lead was not found');
  const policy = leadAllowsChannel(lead, 'sms');
  if (!policy.allowed) throw new Error(policy.reason);

  const primaryPhone = await getTenantPhoneNumberForChannel(db, tenantId, 'sms');
  const fallbackFrom = normalizePhone(Deno.env.get('TWILIO_PHONE_NUMBER') || '');
  const tenantFrom = primaryPhone?.status === 'active' && primaryPhone?.sms_enabled ? normalizePhone(primaryPhone.phone_number) : '';
  const from = tenantFrom || fallbackFrom;
  const to = normalizePhone(lead.phone || '');
  const message = String(body.message || 'This is a tenant SMS test message. Reply STOP to opt out.').trim();
  if (!from) throw new Error('No tenant or fallback SMS sender is configured');
  if (!to) throw new Error('Lead phone number is required');
  if (!message) throw new Error('SMS message body is required');

  const callback = new URL('/twilio-sms-webhook', functionBaseUrl());
  callback.searchParams.set('mode', 'status');
  const sms = await getTwilioClient().messages.create({
    from,
    to,
    body: message,
    statusCallback: callback.toString(),
  });
  const conversation = await ensureLeadConversation(db, tenantId, lead, 'sms');
  const rows = await unwrap(
    await db.database.from('lead_conversation_messages').insert([{
      tenant_id: tenantId,
      conversation_id: conversation?.id || null,
      lead_id: lead.id,
      direction: 'outbound',
      channel: 'sms',
      message_type: 'sms',
      body_text: message,
      provider_message_id: sms.sid || null,
      provider_status: sms.status || 'queued',
      status: sms.status || 'queued',
      sent_at: nowIso(),
      metadata: { source: 'admin_dashboard_test_sms', senderResolution: tenantFrom ? 'tenant_primary' : 'fallback_secret' },
    }]).select(),
    'Failed to record SMS test message'
  );
  return { providerMessageId: sms.sid || null, status: sms.status || 'queued', message: rows?.[0] || null };
}

function whatsappAddress(phone: string) {
  const normalized = normalizePhone(phone || '');
  return normalized ? `whatsapp:${normalized}` : '';
}

function globalWhatsappSenderPhone() {
  return normalizePhone(
    Deno.env.get('TWILIO_WHATSAPP_PHONE_NUMBER')
    || Deno.env.get('TWILIO_WHATSAPP_FROM')
    || ''
  );
}

function whatsappTemplateVariables(lead: any) {
  return JSON.stringify({
    '1': leadName(lead),
    '2': 'the AI assistant',
    '3': 'the team',
    '4': lead?.service_interest || 'your request',
  });
}

async function sendDashboardTestWhatsapp(db: any, body: JsonRecord) {
  const tenantId = requiredTenantId(body);
  const lead = await loadLead(db, tenantId, body.leadId || body.lead_id);
  if (!lead) throw new Error('Tenant lead was not found');
  const policy = leadAllowsChannel(lead, 'whatsapp');
  if (!policy.allowed) throw new Error(policy.reason);

  const globalFrom = globalWhatsappSenderPhone();
  const primaryPhone = await getTenantPhoneNumberForChannel(db, tenantId, 'whatsapp');
  const tenantFrom = primaryPhone?.status === 'active' && primaryPhone?.whatsapp_status === 'active' ? normalizePhone(primaryPhone.phone_number) : '';
  const from = whatsappAddress(globalFrom || tenantFrom);
  const to = whatsappAddress(lead.phone || '');
  const message = String(body.message || 'This is a tenant WhatsApp test message. Reply STOP to opt out.').trim();
  if (!from) throw new Error('No global or tenant WhatsApp sender is configured');
  if (!to) throw new Error('Lead WhatsApp phone number is required');
  if (!message) throw new Error('WhatsApp message body is required');

  const callback = new URL('/twilio-sms-webhook', functionBaseUrl());
  callback.searchParams.set('mode', 'status');
  const contentSid = Deno.env.get('TWILIO_WHATSAPP_TEMPLATE_CONTENT_SID');
  const whatsappPayload: any = contentSid
    ? { from, to, contentSid, contentVariables: whatsappTemplateVariables(lead), statusCallback: callback.toString() }
    : { from, to, body: message, statusCallback: callback.toString() };
  const whatsapp = await getTwilioClient().messages.create(whatsappPayload);
  const conversation = await ensureLeadConversation(db, tenantId, lead, 'whatsapp');
  const rows = await unwrap(
    await db.database.from('lead_conversation_messages').insert([{
      tenant_id: tenantId,
      conversation_id: conversation?.id || null,
      lead_id: lead.id,
      direction: 'outbound',
      channel: 'whatsapp',
      message_type: 'whatsapp',
      body_text: contentSid ? `WhatsApp template sent: ${contentSid}` : message,
      provider_message_id: whatsapp.sid || null,
      provider_status: whatsapp.status || 'queued',
      status: whatsapp.status || 'queued',
      sent_at: nowIso(),
      metadata: { source: 'admin_dashboard_test_whatsapp', senderResolution: globalFrom ? 'global_whatsapp_secret' : 'tenant_active', contentSid: contentSid || null },
    }]).select(),
    'Failed to record WhatsApp test message'
  );
  return { providerMessageId: whatsapp.sid || null, status: whatsapp.status || 'queued', message: rows?.[0] || null };
}

function leadName(lead: any) {
  return lead?.full_name || [lead?.first_name, lead?.last_name].filter(Boolean).join(' ') || 'there';
}

function leadServiceInterest(lead: any) {
  const imported = lead?.custom_fields?.importedLeadData || {};
  return lead?.service_interest
    || lead?.service
    || lead?.interest
    || imported.service_interest
    || imported.service
    || imported.interest
    || imported.coverage_type_needed
    || '';
}

function spokenField(value: any) {
  return String(value || '').trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function reboundOpening(input: JsonRecord, lead: any, tenantAgent: any) {
  const agentName = tenantAgent?.display_name || 'the AI assistant';
  const service = spokenField(leadServiceInterest(lead));
  const reason = service ? ` about ${service}` : '';
  const generated = `Hi ${leadName(lead)}, this is ${agentName}. Sorry for the interruption, I am calling back${reason}. Can we book a quick consultation now?`;
  const requested = String(input.reboundOpening || input.rebound_opening || '').trim();
  if (!requested) return generated;
  const cleaned = requested.replace(/\b(Bob|James)\b/g, agentName);
  return /book/i.test(cleaned) ? cleaned : `${cleaned.replace(/\s+$/, '')} Can we book a quick consultation now?`;
}

function defaultCampaignSmsBody(input: { tenant?: any; agent?: any; lead: any }) {
  const tenantName = input.tenant?.name || 'our team';
  const agentName = input.agent?.display_name || 'the AI assistant';
  const service = input.lead?.service_interest ? ` about ${input.lead.service_interest}` : '';
  return `Hi ${leadName(input.lead)}, this is ${agentName} from ${tenantName}. We’re following up${service}. Reply here and we can help book the best time. Reply STOP to opt out.`;
}

function defaultCampaignEmailMessage(input: { tenant?: any; agent?: any; lead: any }) {
  const agentName = input.agent?.display_name || 'the AI assistant';
  const service = spokenField(leadServiceInterest(input.lead) || 'insurance coverage');
  return [
    `Write a concise first outreach email from ${agentName}.`,
    `The lead preferred email, so do not mention that we tried to call first.`,
    `Use this opening format: "I’m ${agentName}. You filled our form on insurance, and I see you’re interested in ${service}. Would you like to book a consultation with one of our experts?"`,
    `If the lead replies yes, the next email should ask what day and time they will be available.`,
    input.lead?.qualification_notes ? `Lead notes: ${input.lead.qualification_notes}.` : '',
    input.lead?.preferred_meeting_window ? `Preferred meeting window: ${input.lead.preferred_meeting_window}.` : '',
    'Do not ask long qualification questions. Keep it warm, specific, and action-oriented.',
  ].filter(Boolean).join(' ');
}

function normalizePositiveInteger(value: any, fallback: number, min = 1, max = 30) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

function normalizeCadenceDays(value: any) {
  const source = Array.isArray(value) ? value : [7, 14, 30];
  const days = source
    .map((item) => normalizePositiveInteger(item, 0, 1, 365))
    .filter(Boolean);
  return days.length ? days : [7, 14, 30];
}

function nurturePolicyFromRules(rules: any) {
  const policy = rules?.nurturePolicy || {};
  return {
    cadenceDays: normalizeCadenceDays(policy.checkupCadenceDays),
    maxCheckups: normalizePositiveInteger(policy.maxCheckups, 3, 1, 12),
    preferredChannels: Array.isArray(policy.preferredChannels) && policy.preferredChannels.length
      ? policy.preferredChannels
      : ['email', 'whatsapp', 'sms'],
  };
}

function isNurtureAction(action: any) {
  const payload = action?.payload || {};
  const lifecycle = payload.lifecycle || {};
  return lifecycle.stage === 'nurture'
    || payload.nurture?.active === true
    || String(payload.lifecyclePath || '').includes('nurture')
    || String(payload.sourceOutcome || '').includes('not_interested_now');
}

function nurtureStepFromAction(action: any) {
  const payload = action?.payload || {};
  return normalizePositiveInteger(
    payload.nurture?.step
      || payload.lifecycle?.nurtureStep
      || payload.nurtureStep
      || 1,
    1,
    1,
    12
  );
}

function nurtureStopReason(lead: any) {
  if (!lead?.id) return 'lead_missing';
  if (lead.automation_paused) return 'automation_paused';
  if (lead.do_not_contact) return 'do_not_contact';
  if (lead.opted_out_at) return 'opted_out';
  if (lead.meeting_scheduled || lead.lead_stage === 'booked' || lead.scheduling_state === 'booked' || ['booked', 'scheduled'].includes(String(lead.status || '').toLowerCase())) return 'booked';
  if (['closed_won', 'closed_lost', 'do_not_contact'].includes(String(lead.lead_stage || '').toLowerCase())) return `lead_stage_${lead.lead_stage}`;
  return '';
}

function nurtureChannelCandidates(lead: any, rules: any) {
  const policy = nurturePolicyFromRules(rules);
  const preferred = normalizeRequestedChannel(leadPreferredContactChannel(lead));
  return [...new Set([preferred, ...policy.preferredChannels].filter(Boolean))];
}

function defaultNurtureText(input: { tenant?: any; agent?: any; lead: any; channel: string; action?: any }) {
  const agentName = input.agent?.display_name || 'the AI assistant';
  const tenantName = input.tenant?.name || 'the team';
  const service = spokenField(leadServiceInterest(input.lead) || 'your request');
  const opener = `Hi ${leadName(input.lead)}, this is ${agentName} from ${tenantName}.`;
  const body = `Just checking in about ${service}. If now is a better time, reply with a day and time that works and we can help with the next step.`;
  const optOut = ['sms', 'whatsapp'].includes(input.channel) ? ' Reply STOP to opt out.' : '';
  return `${opener} ${body}${optOut}`;
}

async function loadLeadMemoryContext(db: any, tenantId: string, leadId: string) {
  if (!tenantId || !leadId) return [];
  try {
    const rows = await unwrap(
      await db.database
        .from('lead_memory_entries')
        .select('title,summary,memory_payload,follow_up_recommendation,status,created_at,updated_at')
        .eq('tenant_id', tenantId)
        .eq('lead_id', leadId)
        .in('status', ['approved', 'active'])
        .order('updated_at', { ascending: false })
        .limit(5),
      'Failed to load lead memory context'
    );
    return (rows || []).map((row: any) => ({
      title: row.title || 'Lead memory',
      summary: compactText(row.summary || '', 600),
      facts: row.memory_payload || null,
      followUp: row.follow_up_recommendation || null,
      status: row.status || null,
      createdAt: row.created_at || null,
    }));
  } catch {
    return [];
  }
}

async function draftNurtureText(input: {
  tenant?: any;
  agent?: any;
  lead: any;
  channel: string;
  action?: any;
  rules?: any;
  knowledgeContext?: JsonRecord[];
  leadMemoryContext?: JsonRecord[];
}) {
  const fallback = defaultNurtureText(input);
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return { text: fallback, model: 'deterministic-nurture-text-fallback', responseId: null, generatedBy: 'template', generationError: null };

  const step = nurtureStepFromAction(input.action);
  const policy = nurturePolicyFromRules(input.rules);
  const model = Deno.env.get('OPENAI_TEXT_MODEL') || Deno.env.get('OPENAI_EMAIL_MODEL') || 'gpt-5.5';
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      instructions: [
        'You write short, friendly nurture follow-up messages for service-business leads.',
        'Return only valid JSON with key text.',
        'The lead is not ready now or did not respond earlier; be gentle and useful, never pushy.',
        'Ask for a simple reply with a good day/time only if they are ready.',
        'Use tenant, agent, service interest, lead memory, and knowledge context when available.',
        'Do not invent prices, guarantees, discounts, availability, or policy details.',
        input.channel === 'sms' || input.channel === 'whatsapp'
          ? 'Keep it under 320 characters and include STOP opt-out wording.'
          : 'Keep it concise.',
      ].join(' '),
      input: JSON.stringify({
        channel: input.channel,
        nurture: {
          step,
          maxCheckups: policy.maxCheckups,
          cadenceDays: policy.cadenceDays,
          sourceOutcome: input.action?.payload?.sourceOutcome || null,
        },
        tenant: { name: input.tenant?.name || null, industry: input.tenant?.industry || null },
        agent: { name: input.agent?.display_name || 'the AI assistant' },
        lead: {
          name: leadName(input.lead),
          serviceInterest: leadServiceInterest(input.lead) || null,
          preferredContactChannel: leadPreferredContactChannel(input.lead) || null,
          qualificationNotes: input.lead?.qualification_notes || null,
          importedLeadData: input.lead?.custom_fields?.importedLeadData || null,
        },
        leadMemory: input.leadMemoryContext || [],
        knowledgeContext: input.knowledgeContext || [],
      }),
      text: {
        format: {
          type: 'json_schema',
          name: 'nurture_text_message',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['text'],
            properties: { text: { type: 'string' } },
          },
        },
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { text: fallback, model, responseId: data?.id || null, generatedBy: 'template', generationError: data?.error?.message || `OpenAI nurture draft failed with ${response.status}` };
  try {
    const draft = JSON.parse(extractOutputText(data));
    if (draft?.text) return { text: String(draft.text).trim(), model, responseId: data.id || null, generatedBy: 'openai', generationError: null };
  } catch {
    // Fall through to deterministic copy.
  }
  return { text: fallback, model, responseId: data?.id || null, generatedBy: 'template', generationError: 'OpenAI returned an invalid nurture draft' };
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

function safeSenderName(value: unknown) {
  return String(value || '').trim().replace(/[<>]/g, '').slice(0, 80);
}

function normalizeEmail(value: unknown) {
  const text = typeof value === 'object' && value !== null
    ? String((value as JsonRecord).email || (value as JsonRecord).address || '')
    : String(value || '');
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return (match?.[0] || '').trim().toLowerCase();
}

function emailDomain(value: unknown) {
  const email = normalizeEmail(value);
  return email.includes('@') ? email.split('@').pop() || '' : '';
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

async function loadKnowledgeContext(db: any, tenant: any, agent: any) {
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
    const tenantRows = await unwrap(
      await db.database
        .from('tenant_knowledge_documents')
        .select('title,body_text,source_type,source_url,storage_key,status,tenant_agent_id,metadata,updated_at')
        .eq('tenant_id', tenant.id)
        .in('status', ['ready', 'uploaded'])
        .order('updated_at', { ascending: false })
        .limit(20),
      'Failed to load tenant knowledge context'
    );
    addRows((tenantRows || []).filter((row: any) => !row.tenant_agent_id || row.tenant_agent_id === agent?.id), 'tenant');
  } catch {
    // Knowledge context should not block queued delivery.
  }

  try {
    const assignments = await unwrap(
      await db.database
        .from('tenant_knowledge_assignments')
        .select('platform_knowledge_document_id')
        .eq('tenant_id', tenant.id)
        .eq('status', 'active')
        .or(agent?.id ? `tenant_agent_id.is.null,tenant_agent_id.eq.${agent.id}` : 'tenant_agent_id.is.null')
        .limit(100),
      'Failed to load shared knowledge assignments'
    );
    const assignedIds = [...new Set((assignments || []).map((row: any) => row.platform_knowledge_document_id).filter(Boolean))];
    const platformRows = await unwrap(
      await db.database
        .from('platform_knowledge_documents')
        .select('id,title,scope,niche_key,body_text,source_type,source_url,storage_key,status,metadata,updated_at')
        .in('status', ['ready', 'uploaded'])
        .order('updated_at', { ascending: false })
        .limit(80),
      'Failed to load platform knowledge context'
    );
    addRows((platformRows || []).filter((row: any) => (
      row.scope === 'global'
      || (tenant.business_niche && row.scope === 'niche' && row.niche_key === tenant.business_niche)
      || assignedIds.includes(row.id)
    )), 'platform');
  } catch {
    // Shared knowledge is optional for message generation.
  }

  return excerpts.slice(0, 12);
}

function platformEmailSender(agent?: any) {
  const fallbackEmail = Deno.env.get('EMAIL_FROM');
  if (!fallbackEmail) throw new Error('EMAIL_FROM is not configured');
  const domain = emailDomain(fallbackEmail);
  if (!domain) throw new Error('EMAIL_FROM must include a valid domain');
  const fromName = safeSenderName(agent?.display_name) || Deno.env.get('EMAIL_FROM_NAME') || 'Bob Automation';
  const fromEmail = savedAgentEmail(agent) || `${agentEmailLocalPart(agent)}@${domain}`;
  return {
    from: `${fromName} <${fromEmail}>`,
    fromName,
    fromEmail,
    replyTo: fromEmail,
    resolution: 'platform_fallback',
  };
}

function extractOutputText(response: any) {
  if (response?.output_text) return response.output_text;
  return (response?.output || []).flatMap((item: any) => item?.content || [])
    .filter((content: any) => content?.type === 'output_text')
    .map((content: any) => content.text)
    .join('');
}

async function draftQueuedEmail(input: {
  tenant?: any;
  agent?: any;
  lead: any;
  message: string;
  knowledgeContext?: JsonRecord[];
  purpose?: string;
  lifecycle?: JsonRecord;
  leadMemoryContext?: JsonRecord[];
}) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  const service = spokenField(leadServiceInterest(input.lead) || 'insurance coverage');
  const isNurture = input.purpose === 'nurture';
  const fallbackSubject = isNurture ? `Checking in about ${service}` : `Consultation about ${service}`;
  const fallbackText = isNurture
    ? [
      `Hi ${leadName(input.lead)},`,
      `I’m ${input.agent?.display_name || 'the AI assistant'}. Just checking in about ${service}.`,
      `If now is a better time, reply with a day and time that works and we can help with the next step.`,
      `Thank you.`,
    ].join('\n\n')
    : [
      `Hi ${leadName(input.lead)},`,
      `I’m ${input.agent?.display_name || 'the AI assistant'}. You filled our form on insurance, and I see you’re interested in ${service}. Would you like to book a consultation with one of our experts?`,
      input.lead?.preferred_meeting_window
        ? `I saw your preferred time is ${input.lead.preferred_meeting_window}. Does that still work for you?`
        : 'If yes, what day and time will you be available?',
      'Thank you.',
    ].join('\n\n');
  const fallback = {
    subject: fallbackSubject,
    text: fallbackText,
    html: fallbackText.split('\n\n').map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join(''),
    model: 'deterministic-queued-email-fallback',
    responseId: null,
    generatedBy: 'template',
    generationError: apiKey ? null : 'OPENAI_API_KEY is not configured',
  };
  if (!apiKey) return fallback;

  const model = Deno.env.get('OPENAI_EMAIL_MODEL') || 'gpt-5.5';
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      instructions: [
        'You write concise, accurate automated business emails.',
        'Return only valid JSON with keys subject, text, and html.',
        isNurture
          ? 'This is a nurture/checkup email after a lead was not ready or did not respond. Be friendly, low-pressure, and useful.'
          : 'This is the AI agent starting the conversation by email first, so do not imply the lead emailed first.',
        isNurture
          ? 'Primary goal: gently check whether now is a better time and invite the lead to reply with a good day/time if they want help.'
          : 'Primary goal: use this intro format: "I’m [agent name]. You filled our form on insurance, and I see you’re interested in [service_interest or coverage_type_needed]. Would you like to book a consultation with one of our experts?"',
        isNurture
          ? 'Do not restart long qualification; use any lead memory to make the check-in relevant.'
          : 'If the lead replies yes later, ask what day and time they will be available.',
        'Do not ask long qualification questions when the lead already provided context.',
        'Use knowledgeContext as source-of-truth context for services, policies, objections, offers, qualification guidance, and booking rules.',
        'If a knowledge item is only a file or URL reference without an excerpt, do not claim details from its unseen contents.',
        'Never invent prices, promises, availability, policies, discounts, or booking links.',
        'Use only simple safe HTML tags: p, strong, em, ul, li, a, br.',
      ].join(' '),
      input: JSON.stringify({
        tenant: { name: input.tenant?.name || null, industry: input.tenant?.industry || null },
        agent: { name: input.agent?.display_name || 'the AI assistant', email: savedAgentEmail(input.agent) || null },
        lead: {
          name: leadName(input.lead),
          email: input.lead?.email || null,
          serviceInterest: leadServiceInterest(input.lead) || null,
          importedLeadData: input.lead?.custom_fields?.importedLeadData || null,
          preferredMeetingWindow: input.lead?.preferred_meeting_window || null,
          qualificationNotes: input.lead?.qualification_notes || null,
          preferredContactChannel: input.lead?.preferred_contact_channel || null,
        },
        knowledgeContext: input.knowledgeContext || [],
        leadMemory: input.leadMemoryContext || [],
        lifecycle: input.lifecycle || null,
        requestedMessage: input.message,
      }),
      text: {
        format: {
          type: 'json_schema',
          name: 'queued_first_email',
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
  if (!response.ok) return { ...fallback, generationError: data?.error?.message || `OpenAI email draft failed with ${response.status}` };
  try {
    const draft = JSON.parse(extractOutputText(data));
    if (draft?.subject && draft?.text && draft?.html) {
      return { ...draft, model, responseId: data.id || null, generatedBy: 'openai', generationError: null };
    }
  } catch {
    // Fall through to deterministic copy if OpenAI returns malformed JSON.
  }
  return { ...fallback, generationError: 'OpenAI returned an invalid queued email draft' };
}

async function sendResendEmail(input: { sender: ReturnType<typeof platformEmailSender>; to: string; draft: any }) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: input.sender.from,
      to: [input.to],
      subject: input.draft.subject,
      html: input.draft.html,
      text: input.draft.text,
      reply_to: input.sender.replyTo,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || data?.error || `Resend send failed with ${response.status}`);
  return data;
}

async function sendTenantEmailDirect(db: any, input: {
  tenantId: string;
  lead: any;
  agent?: any;
  tenant?: any;
  message: string;
  source: string;
  conversationId?: string | null;
  metadata?: JsonRecord;
}) {
  const policy = leadAllowsChannel(input.lead, 'email');
  if (!policy.allowed) throw new Error(policy.reason);
  if (!input.lead?.email) throw new Error('Lead email address is required');
  const conversation = input.conversationId
    ? null
    : await ensureLeadConversation(db, input.tenantId, input.lead, 'email');
  const conversationId = input.conversationId || conversation?.id || null;
  const sender = platformEmailSender(input.agent);
  const knowledgeContext = await loadKnowledgeContext(db, input.tenant, input.agent);
  const purpose = String(input.metadata?.purpose || input.metadata?.lifecyclePurpose || '').trim();
  const leadMemoryContext = purpose === 'nurture' ? await loadLeadMemoryContext(db, input.tenantId, input.lead.id) : [];
  const draft = await draftQueuedEmail({
    tenant: input.tenant,
    agent: input.agent,
    lead: input.lead,
    message: input.message,
    knowledgeContext,
    purpose,
    lifecycle: input.metadata?.lifecycle || null,
    leadMemoryContext,
  });
  const resend = await sendResendEmail({ sender, to: input.lead.email, draft });
  const now = nowIso();

  const emailRows = await unwrap(
    await db.database.from('email_queue').insert([{
      tenant_id: input.tenantId,
      lead_id: input.lead.id,
      to_email: input.lead.email,
      from_email: sender.fromEmail,
      sender_display_name: sender.fromName,
      reply_to_email: sender.replyTo,
      sender_resolution: sender.resolution,
      delivery_provider: 'resend',
      provider_message_id: resend?.id || null,
      message_id: resend?.id || null,
      subject: draft.subject,
      html_content: draft.html,
      text_content: draft.text,
      email_type: 'follow_up',
      status: 'sent',
      sent_at: now,
      generated_by: draft.generatedBy || 'openai',
      generation_model: draft.model || null,
      generation_status: draft.generationError ? 'failed' : 'generated',
      generation_error: draft.generationError || null,
      generated_at: now,
      metadata: {
        source: input.source,
        conversationId,
        openaiResponseId: draft.responseId || null,
        resend,
        ...(input.metadata || {}),
      },
    }]).select(),
    'Failed to record queued email delivery'
  );
  const messageRows = await unwrap(
    await db.database.from('lead_conversation_messages').insert([{
      tenant_id: input.tenantId,
      conversation_id: conversationId,
      lead_id: input.lead.id,
      direction: 'outbound',
      channel: 'email',
      message_type: 'email_first_touch',
      subject: draft.subject,
      body_text: draft.text,
      body_html: draft.html,
      provider_message_id: resend?.id || null,
      provider_status: 'sent',
      status: 'sent',
      sent_at: now,
      ai_model: draft.model || null,
      ai_response_id: draft.responseId || null,
      metadata: {
        source: input.source,
        from: sender.fromEmail,
        emailQueueId: emailRows?.[0]?.id || null,
        ...(input.metadata || {}),
      },
    }]).select(),
    'Failed to record queued email timeline row'
  );
  await db.database.from('leads').update({ last_contacted_at: now, updated_at: now }).eq('tenant_id', input.tenantId).eq('id', input.lead.id);
  return {
    queued: emailRows?.[0] || null,
    message: messageRows?.[0] || null,
    resend,
    sender: { fromEmail: sender.fromEmail, resolution: sender.resolution },
    draft: { model: draft.model, subject: draft.subject, generatedBy: draft.generatedBy },
  };
}

async function sendTenantSms(db: any, input: { tenantId: string; lead: any; message: string; source: string; conversationId?: string | null; metadata?: JsonRecord }) {
  const policy = leadAllowsChannel(input.lead, 'sms');
  if (!policy.allowed) throw new Error(policy.reason);

  const primaryPhone = await getTenantPhoneNumberForChannel(db, input.tenantId, 'sms');
  const fallbackFrom = normalizePhone(Deno.env.get('TWILIO_PHONE_NUMBER') || '');
  const tenantFrom = primaryPhone?.status === 'active' && primaryPhone?.sms_enabled ? normalizePhone(primaryPhone.phone_number) : '';
  const from = tenantFrom || fallbackFrom;
  const to = normalizePhone(input.lead.phone || '');
  const message = String(input.message || '').trim();
  if (!from) throw new Error('No tenant or fallback SMS sender is configured');
  if (!to) throw new Error('Lead phone number is required');
  if (!message) throw new Error('SMS message body is required');

  const callback = new URL('/twilio-sms-webhook', functionBaseUrl());
  callback.searchParams.set('mode', 'status');
  const sms = await getTwilioClient().messages.create({
    from,
    to,
    body: message,
    statusCallback: callback.toString(),
  });
  const conversation = input.conversationId
    ? { id: input.conversationId }
    : await ensureLeadConversation(db, input.tenantId, input.lead, 'sms');
  const rows = await unwrap(
    await db.database.from('lead_conversation_messages').insert([{
      tenant_id: input.tenantId,
      conversation_id: conversation?.id || null,
      lead_id: input.lead.id,
      direction: 'outbound',
      channel: 'sms',
      message_type: 'sms',
      body_text: message,
      provider_message_id: sms.sid || null,
      provider_status: sms.status || 'queued',
      status: sms.status || 'queued',
      sent_at: nowIso(),
      metadata: {
        source: input.source,
        senderResolution: tenantFrom ? 'tenant_primary' : 'fallback_secret',
        ...(input.metadata || {}),
      },
    }]).select(),
    'Failed to record SMS message'
  );
  return { providerMessageId: sms.sid || null, status: sms.status || 'queued', message: rows?.[0] || null };
}

async function sendTenantWhatsapp(db: any, input: { tenantId: string; lead: any; message: string; source: string; conversationId?: string | null; metadata?: JsonRecord }) {
  const policy = leadAllowsChannel(input.lead, 'whatsapp');
  if (!policy.allowed) throw new Error(policy.reason);

  const globalFrom = globalWhatsappSenderPhone();
  const primaryPhone = await getTenantPhoneNumberForChannel(db, input.tenantId, 'whatsapp');
  const tenantFrom = primaryPhone?.status === 'active' && primaryPhone?.whatsapp_status === 'active' ? normalizePhone(primaryPhone.phone_number) : '';
  const from = whatsappAddress(globalFrom || tenantFrom);
  const to = whatsappAddress(input.lead.phone || '');
  const message = String(input.message || '').trim();
  if (!from) throw new Error('No global or tenant WhatsApp sender is configured');
  if (!to) throw new Error('Lead WhatsApp phone number is required');
  if (!message) throw new Error('WhatsApp message body is required');

  const callback = new URL('/twilio-sms-webhook', functionBaseUrl());
  callback.searchParams.set('mode', 'status');
  const contentSid = Deno.env.get('TWILIO_WHATSAPP_TEMPLATE_CONTENT_SID');
  const whatsappPayload: any = contentSid
    ? { from, to, contentSid, contentVariables: whatsappTemplateVariables(input.lead), statusCallback: callback.toString() }
    : { from, to, body: message, statusCallback: callback.toString() };
  const whatsapp = await getTwilioClient().messages.create(whatsappPayload);
  const conversation = input.conversationId
    ? { id: input.conversationId }
    : await ensureLeadConversation(db, input.tenantId, input.lead, 'whatsapp');
  const rows = await unwrap(
    await db.database.from('lead_conversation_messages').insert([{
      tenant_id: input.tenantId,
      conversation_id: conversation?.id || null,
      lead_id: input.lead.id,
      direction: 'outbound',
      channel: 'whatsapp',
      message_type: 'whatsapp',
      body_text: contentSid ? `WhatsApp template sent: ${contentSid}` : message,
      provider_message_id: whatsapp.sid || null,
      provider_status: whatsapp.status || 'queued',
      status: whatsapp.status || 'queued',
      sent_at: nowIso(),
      metadata: {
        source: input.source,
        senderResolution: globalFrom ? 'global_whatsapp_secret' : 'tenant_active',
        contentSid: contentSid || null,
        ...(input.metadata || {}),
      },
    }]).select(),
    'Failed to record WhatsApp message'
  );
  return { providerMessageId: whatsapp.sid || null, status: whatsapp.status || 'queued', message: rows?.[0] || null };
}

async function createVoiceCallSession(db: any, input: JsonRecord) {
  const tenantId = requiredTenantId(input);
  const leadId = input.leadId || input.lead_id || null;
  const tenant = await loadTenant(db, tenantId);
  if (!tenant?.id) throw new Error('Tenant was not found for voice call');
  const lifecycleRules = await loadEffectiveLifecycleRules(db, tenantId);
  const hours = businessHoursStatus(tenant);
  if (!hours.allowed && input.enforceBusinessHours !== false && input.enforce_business_hours !== false) {
    throw new Error(businessHoursBlockedMessage(hours));
  }
  const lead = await loadLead(db, tenantId, leadId);

  if (leadId && !lead) throw new Error('Lead not found for voice call');
  if (lead) {
    if (leadPrefersEmail(lead)) {
      throw new Error('Lead prefers email; voice call is blocked and email follow-up should be sent instead');
    }
    const policy = leadAllowsChannel(lead, 'call');
    if (!policy.allowed) throw new Error(policy.reason);
  } else if (!consentDefaultTrue(input.callConsent)) {
    throw new Error('Call consent is required for direct test calls');
  }

  const tenantAgent = await resolveTenantAgent(db, tenantId, lead, input.tenantAgentId || input.tenant_agent_id || input.agentId);
  if (!tenantAgent?.id) throw new Error('No tenant AI agent is configured for this call');
  if (!tenantAgent.elevenlabs_agent_id) throw new Error('Tenant AI agent is not synced to ElevenLabs yet');

  const primaryPhoneNumber = await getTenantPhoneNumberForChannel(db, tenantId, 'voice');
  const from = normalizePhone(input.from || primaryPhoneNumber?.phone_number || Deno.env.get('TWILIO_PHONE_NUMBER') || '');
  const to = normalizePhone(input.to || lead?.phone || '');
  if (!from) throw new Error('No tenant or fallback caller phone number is configured');
  if (!to) throw new Error('Lead/test recipient phone number is required');

  const bridgeUrl = Deno.env.get('VOICE_MEDIA_BRIDGE_WS_URL');
  if (!bridgeUrl) throw new Error('VOICE_MEDIA_BRIDGE_WS_URL is required for Phase 10 voice calls');
  if (!bridgeUrl.startsWith('wss://')) throw new Error('VOICE_MEDIA_BRIDGE_WS_URL must use wss://');

  const conversation = lead
    ? await ensureLeadConversation(db, tenantId, lead, 'voice')
    : null;
  const contextToken = randomContextToken();
  const contextTokenHash = await sha256Hex(contextToken);
  const expiresAt = new Date(Date.now() + CALL_CONTEXT_TTL_MS).toISOString();

  const sessions = await unwrap(
    await db.database.from('voice_call_sessions').insert([{
      tenant_id: tenantId,
      lead_id: lead?.id || null,
      conversation_id: conversation?.id || input.conversationId || input.conversation_id || null,
      bob_action_id: input.actionId || input.action_id || null,
      tenant_agent_id: tenantAgent.id,
      tenant_phone_number_id: primaryPhoneNumber?.id || null,
      direction: 'outbound',
      status: 'queued',
      context_token_hash: contextTokenHash,
      context_expires_at: expiresAt,
      media_bridge_url: bridgeUrl,
      elevenlabs_agent_id: tenantAgent.elevenlabs_agent_id,
      metadata: {
        source: input.source || 'bob_queue_actions',
        to,
        from,
        agentDisplayName: tenantAgent.display_name,
        tenantBusinessHours: {
          timezone: hours.timeZone,
          start: hours.start.label,
          end: hours.end.label,
        },
        tenantLifecycleRules: {
          maxCallAttempts: lifecycleRules.maxCallAttempts,
          channelOrder: lifecycleRules.channelOrder,
          voicemailAllowed: lifecycleRules.voicemailAllowed,
          offDutyCallPolicy: lifecycleRules.offDutyCallPolicy,
        },
        ...(input.reboundCall || input.rebound_call
          ? {
          reboundCall: true,
          reboundOpening: reboundOpening(input, lead, tenantAgent),
        }
      : {}),
      },
    }]).select(),
    'Failed to create voice call session'
  );

  const session = sessions?.[0] || null;
  const twimlUrl = voiceWebhookUrl({
    mode: 'intro',
    sessionId: session.id,
    actionId: input.actionId || input.action_id || '',
    leadId: lead?.id || '',
    conversationId: conversation?.id || input.conversationId || input.conversation_id || '',
    token: contextToken,
  });
  const statusCallbackUrl = voiceWebhookUrl({
    mode: 'status',
    sessionId: session.id,
    actionId: input.actionId || input.action_id || '',
    leadId: lead?.id || '',
    conversationId: conversation?.id || input.conversationId || input.conversation_id || '',
  });

  return { session, contextToken, to, from, twimlUrl, statusCallbackUrl };
}

async function launchVoiceCall(db: any, input: JsonRecord) {
  const prepared = await createVoiceCallSession(db, input);
  const call = await startOutboundCall({
    to: prepared.to,
    from: prepared.from,
    twimlUrl: prepared.twimlUrl,
    statusCallbackUrl: prepared.statusCallbackUrl,
  });

  const sessions = await unwrap(
    await db.database.from('voice_call_sessions').update({
      twilio_call_sid: call.sid || null,
      status: call.status === 'queued' ? 'ringing' : (call.status || 'ringing'),
      call_started_at: nowIso(),
      metadata: {
        ...(prepared.session.metadata || {}),
        twilioStatus: call.status || null,
      },
    }).eq('id', prepared.session.id).eq('tenant_id', prepared.session.tenant_id).select(),
    'Failed to update voice call session'
  );
  const session = sessions?.[0] || prepared.session;

  if (input.actionId || input.action_id) {
    await db.database.from('bob_actions').update({
      status: 'calling',
      updated_at: nowIso(),
      result: {
        callSid: call.sid || null,
        voiceCallSessionId: session.id,
        providerStatus: call.status || 'queued',
        from: prepared.from,
        to: prepared.to,
      },
    }).eq('id', input.actionId || input.action_id).eq('tenant_id', session.tenant_id);
  }

  if (session.lead_id) {
    await db.database.from('lead_conversation_messages').insert([{
      tenant_id: session.tenant_id,
      lead_id: session.lead_id,
      conversation_id: session.conversation_id,
      direction: 'outbound',
      channel: 'voice',
      message_type: 'voice_call_started',
      body_text: 'Twilio voice call started and connected to the AI voice runtime.',
      provider_message_id: call.sid || null,
      status: 'sent',
      sent_at: nowIso(),
      metadata: { voiceCallSessionId: session.id, tenantAgentId: session.tenant_agent_id },
    }]);
  }

  return publicCall(call, session);
}

const bobQueueActions = ['status', 'lifecycle-rules', 'evaluate-lifecycle', 'tick', 'start-calls', 'skip', 'campaign-pause', 'campaign-resume', 'campaign-stop', 'test-lead', 'test-call', 'test-sms', 'test-whatsapp', 'live-start', 'live-status'];

async function getBobRunStatus(db: any, tenantId: string, leadId: string, conversationId?: string) {
  const { data: leads } = await db.database.from('leads').select('*').eq('tenant_id', tenantId).eq('id', leadId).limit(1);
  const lead = leads?.[0] || null;
  const { data: conversations } = conversationId
    ? await db.database.from('lead_conversations').select('*').eq('tenant_id', tenantId).eq('id', conversationId).limit(1)
    : await db.database.from('lead_conversations').select('*').eq('tenant_id', tenantId).eq('lead_id', leadId).limit(1);
  const conversation = conversations?.[0] || null;
  const { data: actions } = await db.database
    .from('bob_actions')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('lead_id', leadId)
    .order('scheduled_for', { ascending: true })
    .limit(100);
  const { data: voiceCalls } = await db.database
    .from('voice_call_sessions')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(20);
  return { lead, conversation, actions: actions || [], voiceCalls: voiceCalls || [] };
}

async function createLiveLeadRun(db: any, body: any) {
  const tenantId = requiredTenantId(body);
  const tenantAgent = await resolveEmailTenantAgent(db, tenantId, null, body.tenantAgentId || body.tenant_agent_id || body.agentId || body.agent_id);
  const email = body.email || `live-test-${Date.now()}@example.com`;
  const fullName = [body.firstName || 'Live', body.lastName || 'Test'].filter(Boolean).join(' ');
  const { data: leads } = await db.database.from('leads').insert([{
    tenant_id: tenantId,
    email,
    first_name: body.firstName || 'Live',
    last_name: body.lastName || 'Test',
    full_name: fullName,
    phone: body.phone || null,
    source: body.source || 'function_live_test',
    priority: body.priority || 'medium',
    qualification_status: body.qualificationStatus || 'unqualified',
    qualification_score: Number(body.qualificationScore || 0),
    lead_stage: body.leadStage || 'new',
    scheduling_state: body.schedulingState || 'not_started',
    preferred_contact_channel: body.preferredContactChannel || 'email',
    preferred_language: body.preferredLanguage || body.preferred_language || null,
    preferred_meeting_window: body.preferredMeetingWindow || null,
    service_interest: body.serviceInterest || null,
    timeline: body.timeline || null,
    budget_range: body.budgetRange || null,
    location_summary: body.locationSummary || null,
    qualification_notes: body.qualificationNotes || null,
    call_consent: consentDefaultTrue(body.callConsent),
    sms_consent: consentDefaultTrue(body.smsConsent),
    whatsapp_consent: consentDefaultTrue(body.whatsappConsent),
    email_consent: body.includeEmail === false ? false : consentDefaultTrue(body.emailConsent),
    do_not_contact: Boolean(body.doNotContact),
    assigned_tenant_agent_id: tenantAgent?.id || body.tenantAgentId || body.tenant_agent_id || null,
    status: 'new',
  }]).select();
  const lead = leads?.[0];
  const liveTestEndsAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { data: conversations } = await db.database.from('lead_conversations').insert([{
    tenant_id: tenantId,
    lead_id: lead.id,
    channel: 'email',
    status: 'active',
    conversation_status: 'live_test',
    metadata: { liveTestEndsAt },
  }]).select();
  const conversation = conversations?.[0];
  const actionRows = [];
  const emailPolicy = leadAllowsChannel(lead, 'email');
  const smsPolicy = leadAllowsChannel(lead, 'sms');
  const callPolicy = leadAllowsChannel(lead, 'call');
  if (body.includeEmail !== false) actionRows.push({ tenant_id: tenantId, lead_id: lead.id, conversation_id: conversation.id, action_type: 'send_email', channel: 'email', status: emailPolicy.allowed ? 'pending' : 'awaiting_human', reason: emailPolicy.allowed ? 'Live test email action' : emailPolicy.reason, scheduled_for: nowIso(), payload: { source: 'function_live_test', contactPolicy: emailPolicy, tenantAgentId: tenantAgent?.id || null, firstTouch: true } });
  if (body.includeSms) actionRows.push({ tenant_id: tenantId, lead_id: lead.id, conversation_id: conversation.id, action_type: 'send_sms', channel: 'sms', status: smsPolicy.allowed ? 'pending' : 'awaiting_human', reason: smsPolicy.allowed ? 'Live test SMS action' : smsPolicy.reason, scheduled_for: nowIso(), payload: { source: 'function_live_test', contactPolicy: smsPolicy } });
  if (body.includeCall && !leadPrefersEmail(lead)) actionRows.push({ tenant_id: tenantId, lead_id: lead.id, conversation_id: conversation.id, action_type: 'queue_call_attempt', channel: 'phone', status: callPolicy.allowed ? 'awaiting_call' : 'awaiting_human', reason: callPolicy.allowed ? 'Live test call action' : callPolicy.reason, scheduled_for: nowIso(), payload: { source: 'function_live_test', contactPolicy: callPolicy, tenantAgentId: body.tenantAgentId || body.tenant_agent_id || null } });
  if (actionRows.length) await db.database.from('bob_actions').insert(actionRows);
  return { lead, conversation, status: await getBobRunStatus(db, tenantId, lead.id, conversation.id) };
}

async function skipBobAction(db: any, tenantId: string, actionId: string) {
  const { data } = await db.database.from('bob_actions').update({
    status: 'skipped',
    executed_at: nowIso(),
    updated_at: nowIso(),
    result: { skippedBy: 'insforge_function' },
  }).eq('tenant_id', tenantId).eq('id', actionId).select();
  return data?.[0] || null;
}

async function updateCampaignExecution(db: any, body: JsonRecord, status: string) {
  const tenantId = requiredTenantId(body);
  const campaignId = body.campaignId || body.campaign_id;
  if (!campaignId) throw new Error('campaignId is required');
  const now = nowIso();
  const campaignPatch: JsonRecord = { status, updated_at: now };
  if (status === 'ACTIVE') campaignPatch.started_at = body.startedAt || body.started_at || now;
  if (status === 'ARCHIVED') campaignPatch.stopped_at = now;
  const campaigns = await unwrap(
    await db.database.from('campaigns').update(campaignPatch).eq('tenant_id', tenantId).eq('id', campaignId).select(),
    'Failed to update campaign'
  );
  if (!campaigns?.[0]) throw new Error('Campaign was not found');
  const leadStatus = status === 'ACTIVE' ? 'queued' : status === 'PAUSED' ? 'paused' : 'stopped';
  await db.database.from('campaign_leads').update({ status: leadStatus, updated_at: now }).eq('tenant_id', tenantId).eq('campaign_id', campaignId).in('status', ['queued', 'running', 'paused']);
  const actionPatch = status === 'ACTIVE'
    ? { status: 'awaiting_call', updated_at: now }
    : { status: status === 'PAUSED' ? 'paused' : 'skipped', updated_at: now, result: { campaignControl: status.toLowerCase(), updatedAt: now } };
  await db.database.from('bob_actions').update(actionPatch).eq('tenant_id', tenantId).eq('campaign_id', campaignId).in('status', ['pending', 'awaiting_call', 'paused']);
  return campaigns[0];
}

async function inspectQueuedBobActions(db: any) {
  const { data } = await db.database
    .from('bob_actions')
    .select('*')
    .in('status', ['pending', 'awaiting_call'])
    .order('scheduled_for', { ascending: true })
    .limit(25);
  return data || [];
}

async function ensureCampaignCallActions(db: any, body: JsonRecord) {
  const tenantId = body.tenantId || body.tenant_id || null;
  let query = db.database
    .from('campaign_leads')
    .select('*')
    .eq('status', 'queued')
    .lte('next_action_at', nowIso())
    .limit(Number(body.limit || 3));
  if (tenantId) query = query.eq('tenant_id', tenantId);
  if (body.campaignId || body.campaign_id) query = query.eq('campaign_id', body.campaignId || body.campaign_id);
  const campaignLeads = await unwrap(await query, 'Failed to load due campaign leads') || [];
  if (!campaignLeads.length) return [];
  const ids = campaignLeads.map((row: any) => row.id);
  let existingQuery = db.database.from('bob_actions').select('campaign_lead_id').in('campaign_lead_id', ids).in('status', ['pending', 'awaiting_call', 'calling']);
  if (tenantId) existingQuery = existingQuery.eq('tenant_id', tenantId);
  const existing = await unwrap(await existingQuery, 'Failed to inspect existing campaign actions') || [];
  const existingIds = new Set(existing.map((row: any) => row.campaign_lead_id));
  const rows = [];
  for (const campaignLead of campaignLeads) {
    if (existingIds.has(campaignLead.id)) continue;
    const rowTenantId = campaignLead.tenant_id;
    const lead = await loadLead(db, rowTenantId, campaignLead.lead_id);
    if (!lead) continue;
    const callPolicy = leadAllowsChannel(lead, 'call');
    const emailPolicy = leadAllowsChannel(lead, 'email');
    if (!lead.assigned_tenant_agent_id && campaignLead.agent_id) {
      await db.database.from('leads').update({ assigned_tenant_agent_id: campaignLead.agent_id, updated_at: nowIso() }).eq('tenant_id', rowTenantId).eq('id', lead.id);
    }
    const smsPolicy = leadAllowsChannel(lead, 'sms');
    const useEmail = leadPrefersEmail(lead) && emailPolicy.allowed;
    const useCall = !useEmail && callPolicy.allowed;
    const useSms = !useEmail && !useCall && smsPolicy.allowed;
    const selectedPolicy = useEmail ? emailPolicy : useCall ? callPolicy : smsPolicy;
    rows.push({
      tenant_id: rowTenantId,
      campaign_id: campaignLead.campaign_id,
      campaign_lead_id: campaignLead.id,
      lead_id: lead.id,
      action_type: useEmail ? 'send_email' : useCall ? 'queue_call_attempt' : 'send_sms',
      channel: useEmail ? 'email' : useCall ? 'phone' : 'sms',
      status: useCall ? 'awaiting_call' : ((useEmail || useSms) ? 'pending' : 'awaiting_human'),
      reason: useEmail ? 'Campaign first step: email preference' : useCall ? 'Campaign first step: call' : (useSms ? 'Campaign fallback: SMS' : callPolicy.reason),
      scheduled_for: nowIso(),
      payload: {
        source: 'campaign_tick',
        campaignLeadId: campaignLead.id,
        tenantAgentId: campaignLead.agent_id || lead.assigned_tenant_agent_id || null,
        contactPolicy: selectedPolicy,
        preferredContactChannel: leadPreferredContactChannel(lead),
      },
    });
  }
  if (!rows.length) return [];
  return await unwrap(await db.database.from('bob_actions').insert(rows).select(), 'Failed to create campaign Bob actions') || [];
}

async function sendQueuedSmsActions(db: any, body: JsonRecord) {
  let query = db.database
    .from('bob_actions')
    .select('*')
    .eq('action_type', 'send_sms')
    .eq('status', 'pending')
    .lte('scheduled_for', nowIso())
    .order('scheduled_for', { ascending: true })
    .limit(Number(body.smsLimit || body.limit || 3));
  if (body.tenantId || body.tenant_id) query = query.eq('tenant_id', body.tenantId || body.tenant_id);
  if (body.leadId || body.lead_id) query = query.eq('lead_id', body.leadId || body.lead_id);
  if (body.conversationId || body.conversation_id) query = query.eq('conversation_id', body.conversationId || body.conversation_id);
  if (body.campaignId || body.campaign_id) query = query.eq('campaign_id', body.campaignId || body.campaign_id);

  const actions = await unwrap(await query, 'Failed to load queued SMS actions');
  const results = [];
  for (const action of actions || []) {
    try {
      const tenantId = action.tenant_id;
      const lead = await loadLead(db, tenantId, action.lead_id);
      if (!lead) throw new Error('Lead not found for queued SMS');
      if (await stopNurtureActionIfBlocked(db, action, lead)) {
        results.push({ actionId: action.id, success: true, skipped: true, reason: 'nurture_stop_state' });
        continue;
      }
      const tenant = await loadTenant(db, tenantId);
      const agent = await resolveEmailTenantAgent(db, tenantId, lead, action.payload?.tenantAgentId || action.payload?.tenant_agent_id || lead.assigned_tenant_agent_id);
      const rules = isNurtureAction(action) ? await loadEffectiveLifecycleRules(db, tenantId) : null;
      const explicitMessage = String(action.payload?.message || action.payload?.body || '').trim();
      let message = explicitMessage || defaultCampaignSmsBody({ tenant, agent, lead });
      let generation: JsonRecord | null = null;
      if (!explicitMessage && isNurtureAction(action)) {
        const knowledgeContext = await loadKnowledgeContext(db, tenant, agent);
        const leadMemoryContext = await loadLeadMemoryContext(db, tenantId, lead.id);
        generation = await draftNurtureText({ tenant, agent, lead, channel: 'sms', action, rules, knowledgeContext, leadMemoryContext });
        message = generation.text || message;
      }
      const sms = await sendTenantSms(db, {
        tenantId,
        lead,
        conversationId: action.conversation_id || null,
        message,
        source: action.payload?.source || 'queued_bob_action',
        metadata: {
          bobActionId: action.id,
          campaignId: action.campaign_id || null,
          campaignLeadId: action.campaign_lead_id || null,
          purpose: isNurtureAction(action) ? 'nurture' : null,
          nurture: isNurtureAction(action) ? action.payload?.nurture || null : null,
          generation,
        },
      });

      const nextNurture = isNurtureAction(action)
        ? await safeScheduleNextNurtureCheckup(db, { tenantId, lead, action, rules: rules || await loadEffectiveLifecycleRules(db, tenantId), sentChannel: 'sms' })
        : { action: null, error: null };
      await db.database.from('bob_actions').update({
        status: 'completed',
        executed_at: nowIso(),
        updated_at: nowIso(),
        result: {
          providerMessageId: sms.providerMessageId,
          providerStatus: sms.status,
          messageId: sms.message?.id || null,
          nextNurtureActionId: nextNurture.action?.id || null,
          nurtureScheduleError: nextNurture.error || null,
          nurtureStep: isNurtureAction(action) ? nurtureStepFromAction(action) : null,
        },
      }).eq('id', action.id).eq('tenant_id', tenantId);
      if (action.campaign_lead_id && !isNurtureAction(action)) {
        await db.database.from('campaign_leads').update({
          status: 'running',
          current_step: 'sms_sent',
          updated_at: nowIso(),
        }).eq('tenant_id', tenantId).eq('id', action.campaign_lead_id);
      }
      results.push({ actionId: action.id, success: true, sms, nextNurtureAction: nextNurture.action, nurtureScheduleError: nextNurture.error });
    } catch (error) {
      await db.database.from('bob_actions').update({
        status: 'failed',
        executed_at: nowIso(),
        updated_at: nowIso(),
        result: { error: String(error?.message || 'Queued SMS failed') },
      }).eq('id', action.id).eq('tenant_id', action.tenant_id);
      if (action.campaign_lead_id) {
        await db.database.from('campaign_leads').update({
          status: 'failed',
          current_step: 'sms_failed',
          stop_reason: String(error?.message || 'Queued SMS failed'),
          updated_at: nowIso(),
        }).eq('tenant_id', action.tenant_id).eq('id', action.campaign_lead_id);
      }
      results.push({ actionId: action.id, success: false, error: String(error?.message || 'Queued SMS failed') });
    }
  }
  return results;
}

async function sendQueuedWhatsappActions(db: any, body: JsonRecord) {
  let query = db.database
    .from('bob_actions')
    .select('*')
    .eq('action_type', 'send_whatsapp')
    .eq('status', 'pending')
    .lte('scheduled_for', nowIso())
    .order('scheduled_for', { ascending: true })
    .limit(Number(body.whatsappLimit || body.limit || 3));
  if (body.tenantId || body.tenant_id) query = query.eq('tenant_id', body.tenantId || body.tenant_id);
  if (body.leadId || body.lead_id) query = query.eq('lead_id', body.leadId || body.lead_id);
  if (body.conversationId || body.conversation_id) query = query.eq('conversation_id', body.conversationId || body.conversation_id);
  if (body.campaignId || body.campaign_id) query = query.eq('campaign_id', body.campaignId || body.campaign_id);

  const actions = await unwrap(await query, 'Failed to load queued WhatsApp actions');
  const results = [];
  for (const action of actions || []) {
    try {
      const tenantId = action.tenant_id;
      const lead = await loadLead(db, tenantId, action.lead_id);
      if (!lead) throw new Error('Lead not found for queued WhatsApp');
      if (await stopNurtureActionIfBlocked(db, action, lead)) {
        results.push({ actionId: action.id, success: true, skipped: true, reason: 'nurture_stop_state' });
        continue;
      }
      const tenant = await loadTenant(db, tenantId);
      const agent = await resolveEmailTenantAgent(db, tenantId, lead, action.payload?.tenantAgentId || action.payload?.tenant_agent_id || lead.assigned_tenant_agent_id);
      const rules = isNurtureAction(action) ? await loadEffectiveLifecycleRules(db, tenantId) : null;
      const explicitMessage = String(action.payload?.message || action.payload?.body || '').trim();
      let message = explicitMessage || defaultCampaignSmsBody({ tenant, agent, lead });
      let generation: JsonRecord | null = null;
      if (!explicitMessage && isNurtureAction(action)) {
        const knowledgeContext = await loadKnowledgeContext(db, tenant, agent);
        const leadMemoryContext = await loadLeadMemoryContext(db, tenantId, lead.id);
        generation = await draftNurtureText({ tenant, agent, lead, channel: 'whatsapp', action, rules, knowledgeContext, leadMemoryContext });
        message = generation.text || message;
      }
      const whatsapp = await sendTenantWhatsapp(db, {
        tenantId,
        lead,
        conversationId: action.conversation_id || null,
        message,
        source: action.payload?.source || 'queued_bob_action',
        metadata: {
          bobActionId: action.id,
          campaignId: action.campaign_id || null,
          campaignLeadId: action.campaign_lead_id || null,
          purpose: isNurtureAction(action) ? 'nurture' : null,
          nurture: isNurtureAction(action) ? action.payload?.nurture || null : null,
          generation,
        },
      });

      const nextNurture = isNurtureAction(action)
        ? await safeScheduleNextNurtureCheckup(db, { tenantId, lead, action, rules: rules || await loadEffectiveLifecycleRules(db, tenantId), sentChannel: 'whatsapp' })
        : { action: null, error: null };
      await db.database.from('bob_actions').update({
        status: 'completed',
        executed_at: nowIso(),
        updated_at: nowIso(),
        result: {
          providerMessageId: whatsapp.providerMessageId,
          providerStatus: whatsapp.status,
          messageId: whatsapp.message?.id || null,
          nextNurtureActionId: nextNurture.action?.id || null,
          nurtureScheduleError: nextNurture.error || null,
          nurtureStep: isNurtureAction(action) ? nurtureStepFromAction(action) : null,
        },
      }).eq('id', action.id).eq('tenant_id', tenantId);
      if (action.campaign_lead_id && !isNurtureAction(action)) {
        await db.database.from('campaign_leads').update({
          status: 'running',
          current_step: 'whatsapp_sent',
          updated_at: nowIso(),
        }).eq('tenant_id', tenantId).eq('id', action.campaign_lead_id);
      }
      results.push({ actionId: action.id, success: true, whatsapp, nextNurtureAction: nextNurture.action, nurtureScheduleError: nextNurture.error });
    } catch (error) {
      await db.database.from('bob_actions').update({
        status: 'failed',
        executed_at: nowIso(),
        updated_at: nowIso(),
        result: { error: String(error?.message || 'Queued WhatsApp failed') },
      }).eq('id', action.id).eq('tenant_id', action.tenant_id);
      if (action.campaign_lead_id) {
        await db.database.from('campaign_leads').update({
          status: 'failed',
          current_step: 'whatsapp_failed',
          stop_reason: String(error?.message || 'Queued WhatsApp failed'),
          updated_at: nowIso(),
        }).eq('tenant_id', action.tenant_id).eq('id', action.campaign_lead_id);
      }
      results.push({ actionId: action.id, success: false, error: String(error?.message || 'Queued WhatsApp failed') });
    }
  }
  return results;
}

async function sendQueuedEmailActions(db: any, body: JsonRecord) {
  let query = db.database
    .from('bob_actions')
    .select('*')
    .eq('action_type', 'send_email')
    .eq('status', 'pending')
    .lte('scheduled_for', nowIso())
    .order('scheduled_for', { ascending: true })
    .limit(Number(body.emailLimit || body.limit || 3));
  if (body.tenantId || body.tenant_id) query = query.eq('tenant_id', body.tenantId || body.tenant_id);
  if (body.leadId || body.lead_id) query = query.eq('lead_id', body.leadId || body.lead_id);
  if (body.conversationId || body.conversation_id) query = query.eq('conversation_id', body.conversationId || body.conversation_id);
  if (body.campaignId || body.campaign_id) query = query.eq('campaign_id', body.campaignId || body.campaign_id);

  const actions = await unwrap(await query, 'Failed to load queued email actions');
  const results = [];
  for (const action of actions || []) {
    try {
      const tenantId = action.tenant_id;
      const lead = await loadLead(db, tenantId, action.lead_id);
      if (!lead) throw new Error('Lead not found for queued email');
      if (await stopNurtureActionIfBlocked(db, action, lead)) {
        results.push({ actionId: action.id, success: true, skipped: true, reason: 'nurture_stop_state' });
        continue;
      }
      const tenant = await loadTenant(db, tenantId);
      const agent = await loadTenantAgent(db, tenantId, action.payload?.tenantAgentId || action.payload?.tenant_agent_id || lead.assigned_tenant_agent_id);
      const rules = isNurtureAction(action) ? await loadEffectiveLifecycleRules(db, tenantId) : null;
      const message = String(action.payload?.message || action.payload?.body || '').trim()
        || (isNurtureAction(action)
          ? `Write nurture checkup ${nurtureStepFromAction(action)} for this lead.`
          : defaultCampaignEmailMessage({ tenant, agent, lead }));
      const email = await sendTenantEmailDirect(db, {
        tenantId,
        lead,
        agent,
        tenant,
        conversationId: action.conversation_id || null,
        message,
        source: action.payload?.source || 'queued_bob_action',
        metadata: {
          bobActionId: action.id,
          campaignId: action.campaign_id || null,
          campaignLeadId: action.campaign_lead_id || null,
          preferredContactChannel: leadPreferredContactChannel(lead),
          purpose: isNurtureAction(action) ? 'nurture' : null,
          lifecyclePurpose: isNurtureAction(action) ? 'nurture' : null,
          nurture: isNurtureAction(action) ? action.payload?.nurture || null : null,
          lifecycle: action.payload?.lifecycle || null,
        },
      });

      const nextNurture = isNurtureAction(action)
        ? await safeScheduleNextNurtureCheckup(db, { tenantId, lead, action, rules: rules || await loadEffectiveLifecycleRules(db, tenantId), sentChannel: 'email' })
        : { action: null, error: null };
      await db.database.from('bob_actions').update({
        status: 'completed',
        executed_at: nowIso(),
        updated_at: nowIso(),
        result: {
          emailQueueId: email.queued?.id || null,
          providerMessageId: email.resend?.id || null,
          fromEmail: email.sender?.fromEmail || null,
          subject: email.draft?.subject || null,
          nextNurtureActionId: nextNurture.action?.id || null,
          nurtureScheduleError: nextNurture.error || null,
          nurtureStep: isNurtureAction(action) ? nurtureStepFromAction(action) : null,
        },
      }).eq('id', action.id).eq('tenant_id', tenantId);
      if (action.campaign_lead_id && !isNurtureAction(action)) {
        await db.database.from('campaign_leads').update({
          status: 'running',
          current_step: 'email_sent',
          updated_at: nowIso(),
        }).eq('tenant_id', tenantId).eq('id', action.campaign_lead_id);
      }
      results.push({ actionId: action.id, success: true, email, nextNurtureAction: nextNurture.action, nurtureScheduleError: nextNurture.error });
    } catch (error) {
      await db.database.from('bob_actions').update({
        status: 'failed',
        executed_at: nowIso(),
        updated_at: nowIso(),
        result: { error: String(error?.message || 'Queued email failed') },
      }).eq('id', action.id).eq('tenant_id', action.tenant_id);
      if (action.campaign_lead_id) {
        await db.database.from('campaign_leads').update({
          status: 'failed',
          current_step: 'email_failed',
          stop_reason: String(error?.message || 'Queued email failed'),
          updated_at: nowIso(),
        }).eq('tenant_id', action.tenant_id).eq('id', action.campaign_lead_id);
      }
      results.push({ actionId: action.id, success: false, error: String(error?.message || 'Queued email failed') });
    }
  }
  return results;
}

function voiceLifecycleOutcomeFromAction(action: JsonRecord) {
  const result = action?.result || {};
  const payload = action?.payload || {};
  const metadata = action?.metadata || {};
  const explicitOutcome = firstValue(
    result.callOutcome,
    result.outcome,
    result.lifecycleOutcome,
    result.voiceOutcome,
    payload.callOutcome,
    payload.outcome,
    metadata.callOutcome,
    metadata.outcome
  );
  const machineSignal = firstValue(
    result.answeredBy,
    result.answered_by,
    result.machineDetection,
    result.machine_detection,
    metadata.answeredBy,
    metadata.answered_by,
    metadata.machineDetection,
    metadata.machine_detection
  );
  if (machineSignal && /voice\s*mail|voicemail|answering.?machine|machine/i.test(String(machineSignal))) {
    return 'voicemail_left';
  }
  if (result.interrupted || payload.interrupted || metadata.interrupted) return 'interrupted';
  if (explicitOutcome) return normalizeLifecycleOutcome(explicitOutcome);
  const twilioStatus = firstValue(result.callStatus, result.providerStatus, result.status);
  if (twilioStatus) return normalizeLifecycleOutcome(twilioStatus);
  if (action.status === 'completed') return 'answered';
  if (action.status === 'failed') return 'failed';
  if (action.status === 'skipped' && result.reboundActionId) return 'interrupted';
  return 'needs_human_review';
}

async function terminalCallAttemptCount(db: any, action: JsonRecord) {
  let query = db.database
    .from('bob_actions')
    .select('id')
    .eq('tenant_id', action.tenant_id)
    .eq('lead_id', action.lead_id)
    .eq('action_type', 'queue_call_attempt')
    .in('status', ['completed', 'failed', 'skipped', 'awaiting_human']);
  if (action.campaign_lead_id) query = query.eq('campaign_lead_id', action.campaign_lead_id);
  const rows = await unwrap(await query.limit(100), 'Failed to count terminal voice actions');
  return rows?.length || 0;
}

async function markVoiceLifecycleRecovery(db: any, action: JsonRecord, patch: JsonRecord) {
  await db.database.from('bob_actions').update({
    updated_at: nowIso(),
    result: {
      ...(action.result || {}),
      phase24LifecycleRecovery: {
        processedAt: nowIso(),
        ...(patch || {}),
      },
    },
  }).eq('tenant_id', action.tenant_id).eq('id', action.id);
}

async function processVoiceLifecycleRecoveries(db: any, body: JsonRecord) {
  let query = db.database
    .from('bob_actions')
    .select('*')
    .eq('action_type', 'queue_call_attempt')
    .in('status', ['completed', 'failed', 'skipped'])
    .order('updated_at', { ascending: false })
    .limit(Number(body.voiceLifecycleLimit || body.lifecycleLimit || body.limit || 10));
  if (body.tenantId || body.tenant_id) query = query.eq('tenant_id', body.tenantId || body.tenant_id);
  if (body.leadId || body.lead_id) query = query.eq('lead_id', body.leadId || body.lead_id);
  if (body.conversationId || body.conversation_id) query = query.eq('conversation_id', body.conversationId || body.conversation_id);
  if (body.campaignId || body.campaign_id) query = query.eq('campaign_id', body.campaignId || body.campaign_id);

  const actions = await unwrap(await query, 'Failed to load terminal voice actions for lifecycle recovery') || [];
  const results = [];
  const processedLeadKeys = new Set<string>();
  for (const action of actions) {
    try {
      if (!action.lead_id) continue;
      if (action.result?.phase24LifecycleRecovery?.processedAt) {
        results.push({ actionId: action.id, skipped: true, reason: 'phase24_lifecycle_recovery_already_processed' });
        continue;
      }
      const leadKey = `${action.tenant_id}:${action.campaign_lead_id || action.lead_id}`;
      if (processedLeadKeys.has(leadKey)) {
        await markVoiceLifecycleRecovery(db, action, { skipped: true, reason: 'newer_terminal_voice_action_processed_for_lead' });
        results.push({ actionId: action.id, skipped: true, reason: 'newer_terminal_voice_action_processed_for_lead' });
        continue;
      }
      const existingEvent = await existingPhase23Event(db, action.tenant_id, action.id);
      if (existingEvent) {
        await markVoiceLifecycleRecovery(db, action, { skipped: true, reason: 'phase23_event_exists', eventId: existingEvent.id });
        results.push({ actionId: action.id, skipped: true, reason: 'phase23_event_exists', eventId: existingEvent.id });
        continue;
      }

      const outcome = voiceLifecycleOutcomeFromAction(action);
      if (outcome === 'interrupted' && action.result?.reboundActionId) {
        await markVoiceLifecycleRecovery(db, action, { skipped: true, outcome, reason: 'interrupted_rebound_already_queued', reboundActionId: action.result.reboundActionId });
        results.push({ actionId: action.id, skipped: true, outcome, reason: 'interrupted_rebound_already_queued', reboundActionId: action.result.reboundActionId });
        continue;
      }

      const terminalAttempts = await terminalCallAttemptCount(db, action);
      const evaluation = await evaluateLeadLifecycle(db, {
        tenantId: action.tenant_id,
        leadId: action.lead_id,
        actionId: action.id,
        outcome,
        sourceChannel: 'call',
        attemptCount: Math.max(0, terminalAttempts - 1),
        metadata: {
          source: 'phase24_voice_outcome_recovery',
          sourceActionStatus: action.status,
          sourceActionResult: action.result || null,
          sourceActionPayload: action.payload || null,
          terminalCallAttempts: terminalAttempts,
          campaignId: action.campaign_id || null,
          campaignLeadId: action.campaign_lead_id || null,
        },
      });
      processedLeadKeys.add(leadKey);
      await markVoiceLifecycleRecovery(db, action, {
        skipped: false,
        outcome,
        eventId: evaluation?.event?.id || null,
        nextActionId: evaluation?.action?.id || null,
        decision: evaluation?.decision || null,
      });
      results.push({ actionId: action.id, success: true, outcome, evaluation });
    } catch (error) {
      results.push({ actionId: action.id, success: false, error: String(error?.message || 'Voice lifecycle recovery failed') });
    }
  }
  return results;
}

async function startQueuedCalls(db: any, body: JsonRecord) {
  await ensureCampaignCallActions(db, body);
  const voiceLifecycleResults = await processVoiceLifecycleRecoveries(db, body);
  const emailResults = await sendQueuedEmailActions(db, body);
  const smsResults = await sendQueuedSmsActions(db, body);
  const whatsappResults = await sendQueuedWhatsappActions(db, body);
  let query = db.database
    .from('bob_actions')
    .select('*')
    .eq('action_type', 'queue_call_attempt')
    .eq('status', 'awaiting_call')
    .lte('scheduled_for', nowIso())
    .order('scheduled_for', { ascending: true })
    .limit(Number(body.limit || 3));
  if (body.leadId || body.lead_id) query = query.eq('lead_id', body.leadId || body.lead_id);
  if (body.conversationId || body.conversation_id) query = query.eq('conversation_id', body.conversationId || body.conversation_id);
  if (body.campaignId || body.campaign_id) query = query.eq('campaign_id', body.campaignId || body.campaign_id);

  const actions = await unwrap(await query, 'Failed to load queued call actions');
  const results = [];
  for (const action of actions || []) {
    try {
      const lead = await loadLead(db, action.tenant_id, action.lead_id);
      const lifecycleRules = await loadEffectiveLifecycleRules(db, action.tenant_id);
      const attemptCount = await campaignLeadAttemptCount(db, action);
      if (attemptCount >= lifecycleRules.maxCallAttempts) {
        const reason = `Max call attempts reached (${attemptCount}/${lifecycleRules.maxCallAttempts}); automation requires human review before another call.`;
        await db.database.from('bob_actions').update({
          status: 'awaiting_human',
          reason,
          updated_at: nowIso(),
          result: {
            ...(action.result || {}),
            blockedReason: 'max_call_attempts',
            attemptCount,
            maxCallAttempts: lifecycleRules.maxCallAttempts,
          },
        }).eq('id', action.id).eq('tenant_id', action.tenant_id);
        if (lead?.id) {
          await db.database.from('leads').update({
            requires_human_review: true,
            escalation_reason: 'max_call_attempts_reached',
            next_contact_at: null,
            updated_at: nowIso(),
          }).eq('tenant_id', action.tenant_id).eq('id', lead.id);
          await recordLifecycleBlockedEvent(db, {
            tenantId: action.tenant_id,
            lead,
            action,
            outcome: 'needs_human_review',
            reason,
            blockedReason: 'max_call_attempts',
            metadata: {
              attemptCount,
              maxCallAttempts: lifecycleRules.maxCallAttempts,
              ruleVersion: 'phase22',
            },
          });
        }
        if (action.campaign_lead_id) {
          await db.database.from('campaign_leads').update({
            status: 'stopped',
            current_step: 'call_attempt_limit_reached',
            stop_reason: reason,
            next_action_at: null,
            updated_at: nowIso(),
          }).eq('tenant_id', action.tenant_id).eq('id', action.campaign_lead_id);
        }
        results.push({ actionId: action.id, success: false, blocked: true, blockedReason: 'max_call_attempts', reason });
        continue;
      }
      if (leadPrefersEmail(lead)) {
        const emailPolicy = leadAllowsChannel(lead, 'email');
        await db.database.from('bob_actions').update({
          action_type: 'send_email',
          channel: 'email',
          status: emailPolicy.allowed ? 'pending' : 'awaiting_human',
          reason: emailPolicy.allowed ? 'Lead prefers email; call converted to email' : emailPolicy.reason,
          updated_at: nowIso(),
          payload: {
            ...(action.payload || {}),
            convertedFrom: 'queue_call_attempt',
            preferredContactChannel: 'email',
            contactPolicy: emailPolicy,
          },
        }).eq('id', action.id).eq('tenant_id', action.tenant_id);
        results.push({ actionId: action.id, success: true, convertedTo: 'send_email' });
        continue;
      }
      const tenant = await loadTenant(db, action.tenant_id);
      if (!tenant?.id) throw new Error('Tenant was not found for queued call');
      const hours = businessHoursStatus(tenant);
      if (!hours.allowed) {
        const reason = businessHoursBlockedMessage(hours);
        await db.database.from('bob_actions').update({
          status: 'awaiting_call',
          scheduled_for: hours.nextAllowedAt,
          reason,
          updated_at: nowIso(),
          result: {
            ...(action.result || {}),
            deferredReason: 'outside_business_hours',
            tenantTimezone: hours.timeZone,
            nextAllowedAt: hours.nextAllowedAt,
            businessHours: {
              start: hours.start.label,
              end: hours.end.label,
            },
          },
        }).eq('id', action.id).eq('tenant_id', action.tenant_id);
        if (action.campaign_lead_id) {
          await db.database.from('campaign_leads').update({
            status: 'queued',
            current_step: 'call_deferred_until_business_hours',
            next_action_at: hours.nextAllowedAt,
            stop_reason: null,
            updated_at: nowIso(),
          }).eq('tenant_id', action.tenant_id).eq('id', action.campaign_lead_id);
        }
        results.push({ actionId: action.id, success: true, deferred: true, nextAllowedAt: hours.nextAllowedAt, reason });
        continue;
      }
      const call = await launchVoiceCall(db, {
        tenantId: action.tenant_id,
        leadId: action.lead_id,
        conversationId: action.conversation_id,
        actionId: action.id,
        tenantAgentId: action.payload?.tenantAgentId || action.payload?.tenant_agent_id || null,
        source: 'queued_call_action',
      });
      if (action.campaign_lead_id) {
        await db.database.from('campaign_leads').update({ status: 'running', current_step: 'call_started', attempt_count: Number(action.result?.attemptCount || 0) + 1, updated_at: nowIso() }).eq('tenant_id', action.tenant_id).eq('id', action.campaign_lead_id);
      }
      results.push({ actionId: action.id, success: true, call });
    } catch (error) {
      await db.database.from('bob_actions').update({
        status: 'failed',
        executed_at: nowIso(),
        updated_at: nowIso(),
        result: { error: String(error?.message || 'Queued call failed') },
      }).eq('id', action.id).eq('tenant_id', action.tenant_id);
      if (action.campaign_lead_id) {
        await db.database.from('campaign_leads').update({ status: 'failed', current_step: 'call_failed', stop_reason: String(error?.message || 'Queued call failed'), updated_at: nowIso() }).eq('tenant_id', action.tenant_id).eq('id', action.campaign_lead_id);
      }
      results.push({ actionId: action.id, success: false, error: String(error?.message || 'Queued call failed') });
    }
  }
  const convertedEmailResults = await sendQueuedEmailActions(db, body);
  return { voiceResults: results, voiceLifecycleResults, smsResults, whatsappResults, emailResults: [...emailResults, ...convertedEmailResults] };
}

async function createFunctionTestLead(db: any, body: any) {
  const tenantId = requiredTenantId(body);
  const tenantAgent = await resolveEmailTenantAgent(db, tenantId, null, body.tenantAgentId || body.tenant_agent_id || body.agentId || body.agent_id);
  const { data } = await db.database.from('leads').insert([{
    tenant_id: tenantId,
    email: body.email || `test-${Date.now()}@example.com`,
    full_name: body.fullName || body.name || 'Test Lead',
    phone: body.phone || null,
    source: 'function_test',
    service_interest: body.serviceInterest || body.service_interest || null,
    preferred_contact_channel: body.preferredContactChannel || body.preferred_contact_channel || 'email',
    location_summary: body.locationSummary || body.location_summary || null,
    preferred_meeting_window: body.preferredMeetingWindow || body.preferred_meeting_window || null,
    call_consent: consentDefaultTrue(body.callConsent),
    sms_consent: consentDefaultTrue(body.smsConsent),
    whatsapp_consent: consentDefaultTrue(body.whatsappConsent),
    email_consent: consentDefaultTrue(body.emailConsent),
    do_not_contact: Boolean(body.doNotContact),
    assigned_tenant_agent_id: tenantAgent?.id || body.tenantAgentId || body.tenant_agent_id || null,
    status: 'new',
  }]).select();
  return data?.[0] || null;
}

export default async function(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse();

  const db = createInsForgeClient();
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'status';
  const body = await readRequestBody(req).catch(() => ({}));

  try {
    if (action === 'skip') {
      const tenantId = requiredTenantId(body);
      const id = body.actionId || url.searchParams.get('actionId');
      if (!id) return jsonResponse({ success: false, error: 'actionId is required' }, 400);
      return jsonResponse({ success: true, action: await skipBobAction(db, tenantId, id) });
    }

    if (action === 'campaign-pause') return jsonResponse({ success: true, campaign: await updateCampaignExecution(db, body, 'PAUSED') });
    if (action === 'campaign-resume') return jsonResponse({ success: true, campaign: await updateCampaignExecution(db, body, 'ACTIVE') });
    if (action === 'campaign-stop') return jsonResponse({ success: true, campaign: await updateCampaignExecution(db, body, 'ARCHIVED') });

    if (action === 'live-start') {
      return jsonResponse({ success: true, ...(await createLiveLeadRun(db, body)) });
    }

    if (action === 'live-status') {
      const tenantId = requiredTenantId(body);
      const leadId = body.leadId || url.searchParams.get('leadId');
      if (!leadId) return jsonResponse({ success: false, error: 'leadId is required' }, 400);
      return jsonResponse({
        success: true,
        status: await getBobRunStatus(db, tenantId, leadId, body.conversationId || url.searchParams.get('conversationId') || undefined),
      });
    }

    if (action === 'lifecycle-rules') {
      const tenantId = body.tenantId || body.tenant_id || url.searchParams.get('tenantId') || url.searchParams.get('tenant_id');
      if (!tenantId) return jsonResponse({ success: false, error: 'tenantId is required' }, 400);
      return jsonResponse({ success: true, rules: await loadEffectiveLifecycleRules(db, String(tenantId)) });
    }

    if (action === 'evaluate-lifecycle') {
      return jsonResponse({ success: true, ...(await evaluateLeadLifecycle(db, body)) });
    }

    if (action === 'tick' || action === 'start-calls') {
      const { voiceResults, voiceLifecycleResults, smsResults, whatsappResults, emailResults } = await startQueuedCalls(db, body);
      if (body.leadId || body.lead_id) {
        const tenantId = requiredTenantId(body);
        const leadId = body.leadId || body.lead_id;
        return jsonResponse({
          success: true,
          tick: {
            processedAt: nowIso(),
            mode: 'function_tick',
            voice: { started: voiceResults.filter((row) => row.success).length, results: voiceResults },
            voiceLifecycle: { evaluated: voiceLifecycleResults.filter((row) => row.success).length, results: voiceLifecycleResults },
            sms: { sent: smsResults.filter((row) => row.success).length, results: smsResults },
            whatsapp: { sent: whatsappResults.filter((row) => row.success).length, results: whatsappResults },
            email: { sent: emailResults.filter((row) => row.success && row.email).length, results: emailResults },
          },
          status: await getBobRunStatus(db, tenantId, leadId, body.conversationId || body.conversation_id),
        });
      }
      return jsonResponse({ success: true, queued: await inspectQueuedBobActions(db), voice: { results: voiceResults }, voiceLifecycle: { results: voiceLifecycleResults }, sms: { results: smsResults }, whatsapp: { results: whatsappResults }, email: { results: emailResults }, mode: 'function_tick' });
    }

    if (action === 'test-lead') {
      return jsonResponse({ success: true, lead: await createFunctionTestLead(db, body) });
    }

    if (action === 'test-call') {
      return jsonResponse({ success: true, call: await launchVoiceCall(db, { ...body, source: 'direct_test_call' }) });
    }

    if (action === 'test-sms') {
      return jsonResponse({ success: true, message: await sendDashboardTestSms(db, body) });
    }

    if (action === 'test-whatsapp') {
      return jsonResponse({ success: true, message: await sendDashboardTestWhatsapp(db, body) });
    }

    const statusTenantId = body.tenantId || body.tenant_id || url.searchParams.get('tenantId') || url.searchParams.get('tenant_id');
    const lifecycleRules = statusTenantId ? await loadEffectiveLifecycleRules(db, String(statusTenantId)) : null;
    return jsonResponse({
      success: true,
      service: 'bob-queue-actions',
      voiceCalling: {
        configured: Boolean(Deno.env.get('VOICE_MEDIA_BRIDGE_WS_URL') && Deno.env.get('INSFORGE_FUNCTION_BASE_URL')),
        bridgeUrlConfigured: Boolean(Deno.env.get('VOICE_MEDIA_BRIDGE_WS_URL')),
      },
      lifecycleRules,
      actions: bobQueueActions,
    });
  } catch (error) {
    return jsonResponse({ success: false, error: error?.message || 'AI queue action failed' }, 500);
  }
}

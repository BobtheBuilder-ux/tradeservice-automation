import { insforge } from './insforge';
import {
  buildLeadImportPreview,
  contactPolicyForLead,
  importedLeadPayload,
  summarizeContactPolicy,
} from './lead-import';

const DEFAULT_TENANT_ID = '00000000-0000-4000-8000-000000000001';
export const CALL_OUTCOMES = [
  'booked',
  'no_answer',
  'callback_requested',
  'wrong_number',
  'not_interested',
  'needs_human_follow_up',
];

const CAMEL_TO_SNAKE = {
  tenantId: 'tenant_id',
  userId: 'user_id',
  leadId: 'lead_id',
  agentId: 'agent_id',
  conversationId: 'conversation_id',
  createdByUserId: 'created_by_user_id',
  displayName: 'display_name',
  templateKey: 'template_key',
  elevenlabsAgentId: 'elevenlabs_agent_id',
  voiceId: 'voice_id',
  promptVersion: 'prompt_version',
  primaryPhoneNumberId: 'primary_phone_number_id',
  primaryEmailIdentityId: 'primary_email_identity_id',
  bookingIntegrationId: 'booking_integration_id',
  providerPhoneNumberId: 'provider_phone_number_id',
  phoneNumber: 'phone_number',
  voiceEnabled: 'voice_enabled',
  smsEnabled: 'sms_enabled',
  whatsappStatus: 'whatsapp_status',
  isPrimary: 'is_primary',
  fromName: 'from_name',
  fromEmail: 'from_email',
  replyToEmail: 'reply_to_email',
  verifiedStatus: 'verified_status',
  verificationRequestedAt: 'verification_requested_at',
  verifiedAt: 'verified_at',
  verificationMethod: 'verification_method',
  verificationError: 'verification_error',
  bookingUrl: 'booking_url',
  eventTypeId: 'event_type_id',
  externalAccountId: 'external_account_id',
  encryptedTokens: 'encrypted_tokens',
  defaultMeetingType: 'default_meeting_type',
  defaultTimezone: 'default_timezone',
  assignedAgentId: 'assigned_agent_id',
  assignedTenantAgentId: 'assigned_tenant_agent_id',
  leadImportBatchId: 'lead_import_batch_id',
  firstName: 'first_name',
  lastName: 'last_name',
  fullName: 'full_name',
  leadSource: 'lead_source',
  customFields: 'custom_fields',
  jobTitle: 'job_title',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  scheduledFor: 'scheduled_for',
  executedAt: 'executed_at',
  actionType: 'action_type',
  scheduledAt: 'scheduled_at',
  meetingScheduled: 'meeting_scheduled',
  qualificationStatus: 'qualification_status',
  qualificationScore: 'qualification_score',
  leadStage: 'lead_stage',
  schedulingState: 'scheduling_state',
  preferredContactChannel: 'preferred_contact_channel',
  callConsent: 'call_consent',
  smsConsent: 'sms_consent',
  whatsappConsent: 'whatsapp_consent',
  emailConsent: 'email_consent',
  doNotContact: 'do_not_contact',
  optedOutAt: 'opted_out_at',
  optOutChannel: 'opt_out_channel',
  optOutReason: 'opt_out_reason',
  serviceInterest: 'service_interest',
  locationSummary: 'location_summary',
  requiresHumanReview: 'requires_human_review',
  automationPaused: 'automation_paused',
  escalationReason: 'escalation_reason',
  nextContactAt: 'next_contact_at',
  lastContactedAt: 'last_contacted_at',
  lastUpdatedBy: 'last_updated_by',
  conversationStatus: 'conversation_status',
  humanReviewRequired: 'human_review_required',
  lastIntent: 'last_intent',
  lastIntentAt: 'last_intent_at',
  lastSummary: 'last_summary',
  nextAction: 'next_action',
  nextActionAt: 'next_action_at',
  messageType: 'message_type',
  bodyText: 'body_text',
  bodyHtml: 'body_html',
  sentAt: 'sent_at',
  deliveredAt: 'delivered_at',
  providerMessageId: 'provider_message_id',
  errorMessage: 'error_message',
  fileName: 'file_name',
  totalRows: 'total_rows',
  validRows: 'valid_rows',
  insertedRows: 'inserted_rows',
  duplicateRows: 'duplicate_rows',
  skippedRows: 'skipped_rows',
  errorRows: 'error_rows',
  feedbackType: 'feedback_type',
  adminResponse: 'admin_response',
  adminRespondedBy: 'admin_responded_by',
  adminRespondedAt: 'admin_responded_at',
  isRead: 'is_read',
  startTime: 'start_time',
  endTime: 'end_time',
  meetingUrl: 'meeting_url',
  attendeeEmail: 'attendee_email',
  attendeeName: 'attendee_name',
  attendeePhone: 'attendee_phone',
  tenantAgentId: 'tenant_agent_id',
  sourceType: 'source_type',
  sourceUrl: 'source_url',
  bodyText: 'body_text',
  storageUrl: 'storage_url',
  storageKey: 'storage_key',
  mimeType: 'mime_type',
  fileSize: 'file_size',
  elevenlabsDocumentId: 'elevenlabs_document_id',
  campaignNumber: 'campaign_number',
  currentStep: 'current_step',
  attemptCount: 'attempt_count',
  nextActionAt: 'next_action_at',
  stopReason: 'stop_reason',
  followUpAt: 'follow_up_at',
  followUpStatus: 'follow_up_status',
};

const SNAKE_TO_CAMEL = Object.fromEntries(
  Object.entries(CAMEL_TO_SNAKE).map(([camel, snake]) => [snake, camel])
);

function camelToSnake(key) {
  return CAMEL_TO_SNAKE[key] || key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function snakeToCamel(key) {
  return SNAKE_TO_CAMEL[key] || key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

export function toDbRecord(record = {}) {
  return Object.fromEntries(
    Object.entries(record)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [camelToSnake(key), value])
  );
}

export function fromDbRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [snakeToCamel(key), value])
  );
}

function fromDbRows(rows = []) {
  return rows.map(fromDbRecord);
}

function tenantIdFromUser(user) {
  return user?.tenantId || DEFAULT_TENANT_ID;
}

async function unwrap(result, fallbackMessage) {
  if (result.error) {
    throw new Error(result.error.message || fallbackMessage);
  }
  return result.data;
}

async function selectTenantRows(table, user, options = {}) {
  let query = insforge.database
    .from(table)
    .select(options.select || '*')
    .eq('tenant_id', tenantIdFromUser(user));

  if (options.order) {
    query = query.order(options.order.column, { ascending: options.order.ascending ?? false });
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  return fromDbRows(await unwrap(await query, `Failed to load ${table}`) || []);
}

async function insertTenantRow(table, user, values) {
  const payload = toDbRecord({
    ...values,
    tenantId: tenantIdFromUser(user),
  });
  const data = await unwrap(
    await insforge.database.from(table).insert([payload]).select(),
    `Failed to create ${table}`
  );
  return fromDbRecord(data?.[0]);
}

async function insertTenantRows(table, user, rows = []) {
  if (!rows.length) return [];
  const tenantId = tenantIdFromUser(user);
  const payload = rows.map((values) => toDbRecord({
    ...values,
    tenantId,
  }));
  const data = await unwrap(
    await insforge.database.from(table).insert(payload).select(),
    'Failed to create ' + table
  );
  return fromDbRows(data || []);
}

async function updateTenantRow(table, user, id, patch) {
  const data = await unwrap(
    await insforge.database
      .from(table)
      .update(toDbRecord({ ...patch, updatedAt: new Date().toISOString() }))
      .eq('id', id)
      .eq('tenant_id', tenantIdFromUser(user))
      .select(),
    `Failed to update ${table}`
  );
  return fromDbRecord(data?.[0]);
}

async function deleteTenantRow(table, user, id) {
  const data = await unwrap(
    await insforge.database
      .from(table)
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantIdFromUser(user))
      .select(),
    `Failed to delete ${table}`
  );
  return fromDbRecord(data?.[0]);
}

function primaryActive(rows = []) {
  return rows.find((row) => row.isPrimary && row.status === 'active')
    || rows.find((row) => row.status === 'active' || row.status === 'connected')
    || rows[0]
    || null;
}

function normalizePhoneNumber(phoneNumber) {
  const trimmed = String(phoneNumber || '').trim();
  if (!trimmed) return '';
  const digits = trimmed.replace(/\D/g, '');
  return trimmed.startsWith('+') ? `+${digits}` : `+${digits}`;
}

function assertValidPhoneNumber(phoneNumber) {
  const normalized = normalizePhoneNumber(phoneNumber);
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new Error('Use an E.164 phone number, like +15551234567');
  }
  return normalized;
}

function sanitizeStorageName(name = 'knowledge-document') {
  const fallback = 'knowledge-document';
  const trimmed = String(name || fallback).trim() || fallback;
  return trimmed
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || fallback;
}

function assertKnowledgeTitle(title) {
  const normalized = String(title || '').trim();
  if (!normalized) throw new Error('Document title is required');
  return normalized;
}

function assertKnowledgeAgent(user, agents = [], agentId) {
  if (!agentId) return null;
  const agent = agents.find((row) => row.id === agentId && row.status !== 'archived');
  if (!agent || agent.tenantId !== tenantIdFromUser(user)) {
    throw new Error('Selected AI agent was not found for this tenant');
  }
  return agent.id;
}

export async function ensureDefaultTenantAgent(user) {
  const existingRows = await selectTenantRows('tenant_agents', user, {
    order: { column: 'created_at', ascending: true },
  });
  const existing = existingRows.find((agent) => agent.templateKey === 'bob-default' && agent.status !== 'archived');
  if (existing) {
    if (existing.status === 'draft' || existing.status === 'paused') {
      return updateTenantRow('tenant_agents', user, existing.id, { status: 'testing' });
    }
    return existing;
  }

  return insertTenantRow('tenant_agents', user, {
    createdByUserId: user?.authUserId || user?.id || null,
    displayName: 'Bob',
    templateKey: 'bob-default',
    promptVersion: 'v1',
    status: 'testing',
    metadata: { source: 'frontend_insforge_product' },
  });
}

export async function listTenantAgents(user) {
  await ensureDefaultTenantAgent(user);
  return selectTenantRows('tenant_agents', user, {
    order: { column: 'created_at', ascending: true },
  });
}

export async function listTenantKnowledgeDocuments(user) {
  return selectTenantRows('tenant_knowledge_documents', user, {
    order: { column: 'created_at', ascending: false },
    limit: 1000,
  });
}

export async function createTenantKnowledgeDocument(user, input = {}) {
  const title = assertKnowledgeTitle(input.title);
  const sourceType = input.sourceType || 'text';
  const agents = await listTenantAgents(user);
  const tenantAgentId = assertKnowledgeAgent(user, agents, input.tenantAgentId || null);

  if (!['text', 'url'].includes(sourceType)) {
    throw new Error('Use the file upload flow for file knowledge documents');
  }

  const values = {
    tenantAgentId,
    title,
    sourceType,
    sourceUrl: null,
    bodyText: null,
    status: 'uploaded',
    metadata: { source: 'frontend_knowledge_base' },
  };

  if (sourceType === 'url') {
    const sourceUrl = String(input.sourceUrl || '').trim();
    if (!sourceUrl) throw new Error('Source URL is required');
    try {
      values.sourceUrl = new URL(sourceUrl).toString();
    } catch {
      throw new Error('Use a valid URL for the knowledge source');
    }
  }

  if (sourceType === 'text') {
    const bodyText = String(input.bodyText || '').trim();
    if (!bodyText) throw new Error('Knowledge text is required');
    values.bodyText = bodyText;
  }

  return insertTenantRow('tenant_knowledge_documents', user, values);
}

export async function uploadTenantKnowledgeFile(user, file, input = {}) {
  if (!file) throw new Error('Choose a file to upload');
  const title = assertKnowledgeTitle(input.title || file.name);
  const agents = await listTenantAgents(user);
  const tenantAgentId = assertKnowledgeAgent(user, agents, input.tenantAgentId || null);
  const tenantId = tenantIdFromUser(user);
  const safeName = sanitizeStorageName(file.name || title);
  const storageKey = `${tenantId}/${Date.now()}-${safeName}`;

  const { data, error } = await insforge.storage
    .from('tenant-knowledge')
    .upload(storageKey, file);

  if (error) {
    throw new Error(error.message || 'Failed to upload file to knowledge storage');
  }

  return insertTenantRow('tenant_knowledge_documents', user, {
    tenantAgentId,
    title,
    sourceType: 'file',
    storageUrl: data?.url || null,
    storageKey: data?.key || storageKey,
    mimeType: file.type || null,
    fileSize: Number.isFinite(file.size) ? file.size : null,
    status: 'uploaded',
    metadata: { source: 'frontend_knowledge_base', originalFileName: file.name || null },
  });
}

export async function deleteTenantKnowledgeDocument(user, document) {
  if (!document?.id) throw new Error('Document is required');

  if (document.storageKey) {
    const { error } = await insforge.storage
      .from('tenant-knowledge')
      .remove(document.storageKey);
    if (error) {
      throw new Error(error.message || 'Failed to remove stored file');
    }
  }

  return deleteTenantRow('tenant_knowledge_documents', user, document.id);
}

export async function getTenantSettingsSummary(user) {
  const tenantId = tenantIdFromUser(user);
  const [tenantData, agents, phoneNumbers, emailIdentities, bookingIntegrations] = await Promise.all([
    unwrap(
      await insforge.database.from('tenants').select('*').eq('id', tenantId).limit(1),
      'Failed to load tenant'
    ),
    listTenantAgents(user),
    selectTenantRows('tenant_phone_numbers', user, { order: { column: 'created_at', ascending: false } }),
    selectTenantRows('tenant_email_identities', user, { order: { column: 'created_at', ascending: false } }),
    selectTenantRows('tenant_booking_integrations', user, { order: { column: 'created_at', ascending: false } }),
  ]);

  return {
    tenant: fromDbRecord(tenantData?.[0]) || user?.tenant || null,
    agents,
    phoneNumbers,
    primaryPhoneNumber: primaryActive(phoneNumbers),
    emailIdentity: primaryActive(emailIdentities),
    bookingIntegration: primaryActive(bookingIntegrations),
  };
}

export async function createTenantAgent(user, input = {}) {
  const displayName = input.displayName?.trim();
  if (!displayName) throw new Error('Agent name is required');

  return insertTenantRow('tenant_agents', user, {
    createdByUserId: user?.authUserId || user?.id || null,
    displayName,
    templateKey: input.templateKey || 'custom-agent',
    voiceId: input.voiceId?.trim() || null,
    promptVersion: input.promptVersion?.trim() || 'v1',
    status: input.status || 'testing',
    metadata: input.metadata || {},
  });
}

export async function archiveTenantAgent(user, agentId) {
  return updateTenantRow('tenant_agents', user, agentId, { status: 'archived' });
}

export async function updateTenantAgentStatus(user, agentId, status) {
  const allowed = ['testing', 'live', 'paused', 'archived'];
  if (!allowed.includes(status)) throw new Error('Unsupported AI agent status');
  return updateTenantRow('tenant_agents', user, agentId, { status });
}

export async function listTenantPhoneNumbers(user) {
  return selectTenantRows('tenant_phone_numbers', user, {
    order: { column: 'created_at', ascending: false },
  });
}

export async function createTenantPhoneNumber(user, input = {}) {
  const phoneNumber = assertValidPhoneNumber(input.phoneNumber);
  return insertTenantRow('tenant_phone_numbers', user, {
    provider: 'twilio',
    phoneNumber,
    providerPhoneNumberId: input.providerPhoneNumberId?.trim() || null,
    voiceEnabled: Boolean(input.voiceEnabled),
    smsEnabled: Boolean(input.smsEnabled),
    whatsappStatus: input.whatsappStatus || 'not_configured',
    isPrimary: Boolean(input.isPrimary),
    status: input.status || 'pending',
    metadata: input.metadata || {},
  });
}

export async function updateTenantPhoneNumber(user, phoneNumberId, input = {}) {
  const patch = {};
  if (input.phoneNumber !== undefined) patch.phoneNumber = assertValidPhoneNumber(input.phoneNumber);
  if (input.providerPhoneNumberId !== undefined) patch.providerPhoneNumberId = input.providerPhoneNumberId?.trim() || null;
  if (input.voiceEnabled !== undefined) patch.voiceEnabled = Boolean(input.voiceEnabled);
  if (input.smsEnabled !== undefined) patch.smsEnabled = Boolean(input.smsEnabled);
  if (input.whatsappStatus) patch.whatsappStatus = input.whatsappStatus;
  if (input.isPrimary !== undefined) patch.isPrimary = Boolean(input.isPrimary);
  if (input.status) patch.status = input.status;
  if (input.metadata !== undefined) patch.metadata = input.metadata || {};
  return updateTenantRow('tenant_phone_numbers', user, phoneNumberId, patch);
}

export async function setPrimaryTenantPhoneNumber(user, phoneNumberId) {
  return updateTenantRow('tenant_phone_numbers', user, phoneNumberId, {
    isPrimary: true,
    status: 'active',
  });
}

export async function releaseTenantPhoneNumber(user, phoneNumberId) {
  return updateTenantRow('tenant_phone_numbers', user, phoneNumberId, {
    isPrimary: false,
    status: 'released',
  });
}

export async function upsertTenantEmailIdentity(user, input = {}) {
  const fromName = input.fromName?.trim();
  const fromEmail = input.fromEmail?.trim()?.toLowerCase();
  const replyToEmail = input.replyToEmail?.trim()?.toLowerCase() || null;
  if (!fromName) throw new Error('Sender name is required');
  if (!fromEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) {
    throw new Error('A valid sender email is required');
  }
  if (replyToEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyToEmail)) {
    throw new Error('Use a valid reply-to email or leave it blank');
  }

  const existing = primaryActive(await selectTenantRows('tenant_email_identities', user));
  const identityChanged = existing
    && (existing.fromName !== fromName || existing.fromEmail !== fromEmail || existing.replyToEmail !== replyToEmail);

  const values = {
    fromName,
    fromEmail,
    replyToEmail,
    provider: input.provider || 'platform',
    // Verification is provider/admin controlled. Browser settings can only request it.
    verifiedStatus: identityChanged || !existing ? 'unverified' : existing.verifiedStatus || 'unverified',
    verificationRequestedAt: identityChanged || !existing ? new Date().toISOString() : existing.verificationRequestedAt || null,
    verifiedAt: identityChanged || !existing ? null : existing.verifiedAt || null,
    verificationMethod: identityChanged || !existing ? null : existing.verificationMethod || null,
    verificationError: identityChanged || !existing ? null : existing.verificationError || null,
    status: input.status === 'disabled' ? 'disabled' : 'active',
    metadata: input.metadata || {},
  };
  return existing
    ? updateTenantRow('tenant_email_identities', user, existing.id, values)
    : insertTenantRow('tenant_email_identities', user, values);
}

export async function upsertTenantBookingIntegration(user, input = {}) {
  const provider = input.provider || 'manual';
  const bookingUrl = input.bookingUrl?.trim() || null;
  const eventTypeId = input.eventTypeId?.trim() || null;
  if (provider === 'manual' && !bookingUrl) {
    throw new Error('Manual booking requires a booking URL');
  }
  if (provider === 'calendly' && !bookingUrl && !eventTypeId) {
    throw new Error('Calendly setup requires a booking URL or event type ID');
  }

  const values = {
    provider,
    status: bookingUrl || eventTypeId ? 'connected' : 'disconnected',
    bookingUrl,
    eventTypeId,
    externalAccountId: input.externalAccountId?.trim() || null,
    defaultMeetingType: input.defaultMeetingType || 'phone',
    metadata: input.metadata || {},
  };
  const existing = primaryActive(await selectTenantRows('tenant_booking_integrations', user));
  return existing
    ? updateTenantRow('tenant_booking_integrations', user, existing.id, values)
    : insertTenantRow('tenant_booking_integrations', user, values);
}

export async function listLeads(user, limit = 10000) {
  return selectTenantRows('leads', user, {
    order: { column: 'created_at', ascending: false },
    limit,
  });
}

export async function listLeadImportBatches(user, limit = 10) {
  return selectTenantRows('lead_import_batches', user, {
    order: { column: 'created_at', ascending: false },
    limit,
  });
}

export async function previewLeadCsvImport(user, csvText) {
  const existingLeads = await listLeads(user, 10000);
  return buildLeadImportPreview(csvText, existingLeads);
}

export async function importLeadsFromCsv(user, { csvText, fileName } = {}) {
  const preview = await previewLeadCsvImport(user, csvText);
  const { summary } = preview;

  if (!summary.totalRows) {
    throw new Error('CSV file has no lead rows');
  }

  if (!preview.importableRows.length) {
    throw new Error('No valid, non-duplicate leads are ready to import');
  }

  const batch = await insertTenantRow('lead_import_batches', user, {
    createdByUserId: user?.authUserId || user?.id || null,
    fileName: fileName?.trim() || 'lead-import.csv',
    status: 'processing',
    totalRows: summary.totalRows,
    validRows: summary.validRows,
    duplicateRows: summary.duplicateRows,
    skippedRows: summary.skippedRows,
    errorRows: summary.errorRows,
    insertedRows: 0,
    summary,
  });

  try {
    const defaultAgent = (await listTenantAgents(user)).find((agent) => agent.status === 'live' || agent.status === 'testing');
    const inserted = await insertTenantRows(
      'leads',
      user,
      preview.importableRows.map((row) => ({ ...importedLeadPayload(row, batch.id), assignedTenantAgentId: defaultAgent?.id || null }))
    );

    const completedBatch = await updateTenantRow('lead_import_batches', user, batch.id, {
      status: 'completed',
      insertedRows: inserted.length,
      summary: {
        ...summary,
        insertedRows: inserted.length,
      },
    });

    const campaign = await insertTenantRow('campaigns', user, {
      name: `Import: ${fileName?.trim() || 'Lead import'} · ${new Date().toLocaleDateString()}`,
      objective: 'OUTCOME_LEADS',
      status: 'ACTIVE',
      agentId: defaultAgent?.id || null,
      startedAt: new Date().toISOString(),
      channelSequence: ['call', 'sms', 'email'],
      retryPolicy: { maxAttempts: 2, retryDelayMinutes: 60 },
      stopConditions: { booked: true, optedOut: true, doNotContact: true, notInterested: true, humanReview: true },
      metadata: { source: 'lead_import', importBatchId: batch.id },
    });
    const eligible = inserted.filter((lead) => !lead.doNotContact && !lead.automationPaused);
    if (eligible.length) {
      const campaignLeads = await insertTenantRows('campaign_leads', user, eligible.map((lead) => ({
        campaignId: campaign.id,
        leadId: lead.id,
        agentId: lead.assignedTenantAgentId || defaultAgent?.id || null,
        status: 'queued',
        currentStep: 'call',
        nextActionAt: new Date().toISOString(),
      })));
      await insertTenantRows('bob_actions', user, campaignLeads.map((campaignLead) => {
        const lead = eligible.find((row) => row.id === campaignLead.leadId);
        const canCall = Boolean(lead?.callConsent && lead?.phone);
        const canSms = Boolean(lead?.smsConsent && lead?.phone);
        return {
          campaignId: campaign.id,
          campaignLeadId: campaignLead.id,
          leadId: campaignLead.leadId,
          actionType: canCall ? 'queue_call_attempt' : 'send_sms',
          channel: canCall ? 'phone' : 'sms',
          status: canCall ? 'awaiting_call' : (canSms ? 'pending' : 'awaiting_human'),
          reason: canCall ? 'Campaign first step: call' : (canSms ? 'Campaign fallback: SMS' : 'Campaign requires call or SMS consent with a phone number'),
          scheduledFor: new Date().toISOString(),
          payload: { source: 'campaign_import', campaignNumber: campaign.campaignNumber, campaignLeadId: campaignLead.id, tenantAgentId: campaignLead.agentId || lead?.assignedTenantAgentId || defaultAgent?.id || null },
        };
      }));
    }

    return {
      batch: completedBatch,
      inserted,
      preview,
      campaign,
    };
  } catch (error) {
    await updateTenantRow('lead_import_batches', user, batch.id, {
      status: 'failed',
      summary: {
        ...summary,
        error: error.message || 'Import failed',
      },
    });
    throw error;
  }
}

export async function deleteAllLeads(user) {
  const data = await unwrap(
    await insforge.database
      .from('leads')
      .delete()
      .eq('tenant_id', tenantIdFromUser(user))
      .select('id'),
    'Failed to delete leads'
  );

  return {
    deletedCount: data?.length || 0,
  };
}

export function getLeadContactPolicy(lead, channel) {
  return contactPolicyForLead(lead, channel);
}

export function getLeadContactPolicySummary(lead) {
  return summarizeContactPolicy(lead);
}

export async function updateLeadSuppression(user, leadId, input = {}) {
  const patch = {
    lastUpdatedBy: user?.authUserId || user?.id || null,
  };

  if (typeof input.doNotContact === 'boolean') patch.doNotContact = input.doNotContact;
  if (input.optOutChannel !== undefined) patch.optOutChannel = input.optOutChannel || null;
  if (input.optOutReason !== undefined) patch.optOutReason = input.optOutReason?.trim() || null;
  if (input.optedOutAt !== undefined) patch.optedOutAt = input.optedOutAt || null;

  if (patch.doNotContact || patch.optOutChannel) {
    patch.optedOutAt = patch.optedOutAt || new Date().toISOString();
  }

  if (patch.doNotContact === false && !patch.optOutChannel) {
    patch.optedOutAt = null;
    patch.optOutReason = null;
  }

  return updateTenantRow('leads', user, leadId, patch);
}

export async function assignLeadToTenantAgent(user, leadId, agentId) {
  const agents = await listTenantAgents(user);
  const agent = agents.find((row) => row.id === agentId && row.status !== 'archived');
  if (!agent) throw new Error('AI agent not found');
  return updateTenantRow('leads', user, leadId, { assignedTenantAgentId: agentId });
}

export async function updateLeadReview(user, leadId, updates = {}) {
  const patch = {};
  if (typeof updates.requiresHumanReview === 'boolean') patch.requiresHumanReview = updates.requiresHumanReview;
  if (typeof updates.automationPaused === 'boolean') patch.automationPaused = updates.automationPaused;
  if (typeof updates.escalationReason === 'string') patch.escalationReason = updates.escalationReason.trim() || null;
  if (typeof updates.leadStage === 'string' && updates.leadStage.trim()) patch.leadStage = updates.leadStage.trim();
  if (typeof updates.schedulingState === 'string' && updates.schedulingState.trim()) {
    patch.schedulingState = updates.schedulingState.trim();
  }
  patch.lastUpdatedBy = user?.authUserId || user?.id || null;
  return updateTenantRow('leads', user, leadId, patch);
}

export async function listCampaigns(user) {
  const campaigns = await selectTenantRows('campaigns', user, {
    order: { column: 'created_at', ascending: false },
    limit: 1000,
  });
  return {
    campaigns: campaigns.map((campaign) => ({
      ...campaign,
      created_time: campaign.createdAt,
    })),
    stats: {
      active: campaigns.filter((campaign) => campaign.status === 'ACTIVE').length,
      paused: campaigns.filter((campaign) => campaign.status === 'PAUSED').length,
      totalSpend: 0,
      totalLeads: 0,
    },
  };
}

export async function createCampaign(user, input = {}) {
  const name = input.name?.trim();
  if (!name) throw new Error('Campaign name is required');
  return insertTenantRow('campaigns', user, {
    name,
    objective: input.objective || 'OUTCOME_LEADS',
    status: input.status || 'ACTIVE',
    channelSequence: input.channelSequence || ['call', 'sms', 'email'],
    retryPolicy: input.retryPolicy || { maxAttempts: 2, retryDelayMinutes: 60 },
    stopConditions: input.stopConditions || { booked: true, optedOut: true, doNotContact: true, notInterested: true, humanReview: true },
    metadata: { source: 'frontend_insforge_product' },
  });
}

export async function updateCampaignStatus(user, campaignId, status) {
  return updateTenantRow('campaigns', user, campaignId, { status });
}

export async function listMeetings(user) {
  const [meetings, leads] = await Promise.all([
    selectTenantRows('meetings', user, {
      order: { column: 'start_time', ascending: false },
      limit: 1000,
    }),
    listLeads(user, 10000),
  ]);
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  return meetings.map((meeting) => {
    const lead = leadById.get(meeting.leadId) || {};
    return {
      ...meeting,
      start_time: meeting.startTime,
      end_time: meeting.endTime,
      lead_name: lead.fullName || [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email || null,
      lead_email: lead.email || null,
      agent_name: null,
    };
  });
}

export async function listFeedback(user) {
  const rows = await selectTenantRows('agent_feedback', user, {
    order: { column: 'created_at', ascending: false },
    limit: 1000,
  });
  return rows.map((feedback) => ({
    ...feedback,
    type: feedback.feedbackType,
    message: feedback.content,
    respondedAt: feedback.adminRespondedAt,
  }));
}

export async function listFeedbackForLead(user, leadId) {
  const rows = await unwrap(
    await insforge.database
      .from('agent_feedback')
      .select('*')
      .eq('tenant_id', tenantIdFromUser(user))
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(100),
    'Failed to load lead feedback'
  );
  return fromDbRows(rows || []).map((feedback) => ({
    ...feedback,
    type: feedback.feedbackType,
    message: feedback.content,
    respondedAt: feedback.adminRespondedAt,
  }));
}

export async function createLeadFeedback(user, leadId, input = {}) {
  const subject = input.subject?.trim();
  const content = input.content?.trim();
  if (!subject || !content) throw new Error('Subject and content are required');
  return insertTenantRow('agent_feedback', user, {
    agentId: user?.authUserId || user?.id || null,
    leadId,
    subject,
    content,
    feedbackType: input.feedbackType || 'general',
    priority: input.priority || 'medium',
    status: 'submitted',
    tags: input.tags ? String(input.tags).split(',').map((tag) => tag.trim()).filter(Boolean) : null,
    metadata: { source: 'frontend_insforge_product' },
  });
}

export async function updateLeadQualification(user, leadId, input = {}) {
  return updateTenantRow('leads', user, leadId, {
    qualificationStatus: input.qualificationStatus,
    qualificationScore: Number(input.qualificationScore || 0),
    leadStage: input.leadStage,
    schedulingState: input.schedulingState,
    preferredContactChannel: input.preferredContactChannel,
    preferredMeetingWindow: input.preferredMeetingWindow || null,
    serviceInterest: input.serviceInterest || null,
    timeline: input.timeline || null,
    budgetRange: input.budgetRange || null,
    locationSummary: input.locationSummary || null,
    qualificationNotes: input.qualificationNotes || null,
    requiresHumanReview: Boolean(input.requiresHumanReview),
    automationPaused: Boolean(input.automationPaused),
    escalationReason: input.escalationReason || null,
    lastUpdatedBy: user?.authUserId || user?.id || null,
  });
}

export async function getIntegrationStatus(user) {
  const { bookingIntegration } = await getTenantSettingsSummary(user);
  return {
    calendly: {
      connected: bookingIntegration?.provider === 'calendly' && bookingIntegration?.status === 'connected',
      connectedAt: bookingIntegration?.updatedAt || bookingIntegration?.createdAt || null,
    },
  };
}

function dayKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function dailySeries(rows, fields = {}) {
  const byDay = new Map();
  rows.forEach((row) => {
    const date = dayKey(row.createdAt);
    const current = byDay.get(date) || { date, sent: 0, delivered: 0, opened: 0, clicked: 0, failed: 0, count: 0 };
    current.sent += fields.sent?.(row) ? 1 : 0;
    current.delivered += fields.delivered?.(row) ? 1 : 0;
    current.opened += fields.opened?.(row) ? 1 : 0;
    current.clicked += fields.clicked?.(row) ? 1 : 0;
    current.failed += fields.failed?.(row) ? 1 : 0;
    current.count += 1;
    byDay.set(date, current);
  });
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function getAnalytics(user, period = '30d') {
  const days = Number.parseInt(period, 10) || 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const tenantId = tenantIdFromUser(user);
  const [meetings, emails, messages] = await Promise.all([
    selectTenantRows('meetings', user, { order: { column: 'created_at', ascending: false }, limit: 5000 }),
    unwrap(
      await insforge.database.from('email_queue').select('*').eq('tenant_id', tenantId).gte('created_at', since).limit(5000),
      'Failed to load email analytics'
    ).then(fromDbRows),
    unwrap(
      await insforge.database.from('lead_conversation_messages').select('*').eq('tenant_id', tenantId).gte('created_at', since).limit(5000),
      'Failed to load message analytics'
    ).then(fromDbRows),
  ]);
  const scopedMeetings = meetings.filter((meeting) => new Date(meeting.createdAt).getTime() >= new Date(since).getTime());
  const smsMessages = messages.filter((message) => message.channel === 'sms');
  const sentEmail = (row) => ['sent', 'delivered', 'opened', 'clicked'].includes(row.status);
  const deliveredEmail = (row) => ['delivered', 'opened', 'clicked'].includes(row.status);
  const emailSeries = dailySeries(emails, {
    sent: sentEmail,
    delivered: deliveredEmail,
    opened: (row) => row.status === 'opened',
    clicked: (row) => row.status === 'clicked',
  });
  const smsSeries = dailySeries(smsMessages, {
    sent: (row) => ['sent', 'delivered'].includes(row.status),
    delivered: (row) => row.status === 'delivered',
    failed: (row) => row.status === 'failed',
  });
  const totalSent = emails.filter(sentEmail).length;
  const delivered = emails.filter(deliveredEmail).length;
  const opened = emails.filter((row) => row.status === 'opened').length;
  const clicked = emails.filter((row) => row.status === 'clicked').length;
  const smsSent = smsMessages.filter((row) => ['sent', 'delivered'].includes(row.status)).length;
  const smsDelivered = smsMessages.filter((row) => row.status === 'delivered').length;
  const smsFailed = smsMessages.filter((row) => row.status === 'failed').length;
  const emailData = Object.assign(emailSeries, {
    metrics: [{ success_rate: totalSent ? Math.round((delivered / totalSent) * 100) : 0 }],
    reminderBreakdown: Object.entries(emails.reduce((counts, row) => {
      counts[row.emailType || 'email'] = (counts[row.emailType || 'email'] || 0) + 1;
      return counts;
    }, {})).map(([reminder_type, count]) => ({ reminder_type, count })),
    dailyStats: emailSeries,
  });
  const smsData = Object.assign(smsSeries, {
    deliveryBreakdown: Object.entries(smsMessages.reduce((counts, row) => {
      counts[row.status || 'unknown'] = (counts[row.status || 'unknown'] || 0) + 1;
      return counts;
    }, {})).map(([sms_delivery_status, count]) => ({ sms_delivery_status, count })),
  });

  return {
    dashboardData: {
      totalMeetings: scopedMeetings.length,
      emailRemindersSent: totalSent,
      smsRemindersSent: smsSent,
      meetingStatusBreakdown: Object.entries(scopedMeetings.reduce((counts, meeting) => {
        counts[meeting.status || 'scheduled'] = (counts[meeting.status || 'scheduled'] || 0) + 1;
        return counts;
      }, {})).map(([status, count]) => ({ status, count })),
    },
    emailData,
    smsData,
    emailMetrics: {
      totalSent, delivered, opened, clicked,
      bounced: emails.filter((row) => row.status === 'bounced').length,
      deliveryRate: totalSent ? Math.round((delivered / totalSent) * 100) : 0,
      openRate: totalSent ? Math.round((opened / totalSent) * 100) : 0,
      clickRate: totalSent ? Math.round((clicked / totalSent) * 100) : 0,
    },
    smsMetrics: {
      totalSent: smsSent,
      delivered: smsDelivered,
      failed: smsFailed,
      deliveryRate: smsSent ? Math.round((smsDelivered / smsSent) * 100) : 0,
    },
  };
}

export async function markFeedbackRead(user, feedbackId) {
  return updateTenantRow('agent_feedback', user, feedbackId, { isRead: true });
}

export async function setFeedbackStatus(user, feedbackId, status) {
  return updateTenantRow('agent_feedback', user, feedbackId, { status });
}

export async function respondToFeedback(user, feedbackId, response) {
  return updateTenantRow('agent_feedback', user, feedbackId, {
    status: 'responded',
    isRead: true,
    adminResponse: response,
    adminRespondedBy: user?.authUserId || user?.id || null,
    adminRespondedAt: new Date().toISOString(),
  });
}

export async function getBobActivity(user) {
  const [actions, leads, conversations, campaigns] = await Promise.all([
    selectTenantRows('bob_actions', user, { order: { column: 'created_at', ascending: false }, limit: 200 }),
    listLeads(user, 10000),
    selectTenantRows('lead_conversations', user, { order: { column: 'updated_at', ascending: false }, limit: 10000 }),
    selectTenantRows('campaigns', user, { order: { column: 'created_at', ascending: false }, limit: 1000 }),
  ]);
  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));

  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const conversationById = new Map(conversations.map((conversation) => [conversation.id, conversation]));
  const actionRows = actions.map((action) => {
    const lead = leadById.get(action.leadId) || {};
    const conversation = conversationById.get(action.conversationId) || {};
    return {
      ...action,
      campaign: action.campaignId ? campaignById.get(action.campaignId) || null : null,
      campaignNumber: action.campaignId ? campaignById.get(action.campaignId)?.campaignNumber || null : null,
      leadName: lead.fullName || [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email || 'Lead',
      leadFullName: lead.fullName,
      leadFirstName: lead.firstName,
      leadLastName: lead.lastName,
      leadEmail: lead.email,
      leadPhone: lead.phone,
      leadStatus: lead.status,
      leadStage: lead.leadStage,
      leadServiceInterest: lead.serviceInterest,
      qualificationStatus: lead.qualificationStatus,
      qualificationScore: lead.qualificationScore,
      schedulingState: lead.schedulingState,
      requiresHumanReview: lead.requiresHumanReview,
      escalationReason: lead.escalationReason,
      automationPaused: lead.automationPaused,
      conversationStatus: conversation.conversationStatus,
      lastIntent: conversation.lastIntent,
      humanReviewRequired: conversation.humanReviewRequired,
    };
  });

  const statusCounts = actionRows.reduce((counts, action) => {
    counts[action.status] = (counts[action.status] || 0) + 1;
    return counts;
  }, {});
  const reviewQueue = leads
    .filter((lead) => lead.requiresHumanReview || lead.automationPaused)
    .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
    .slice(0, 50);

  return {
    actions: actionRows,
    callActions: actionRows.filter((action) => action.actionType === 'queue_call_attempt'),
    callOutcomes: CALL_OUTCOMES,
    reviewQueue,
    voiceWorker: { enabled: false, mode: 'insforge-direct' },
    stats: {
      totalActions: actionRows.length,
      pendingActions: statusCounts.pending || 0,
      failedActions: statusCounts.failed || 0,
      awaitingHuman: statusCounts.awaiting_human || 0,
      awaitingCall: statusCounts.awaiting_call || 0,
      activeCalls: statusCounts.calling || 0,
      completedCalls: actionRows.filter((action) => (
        action.actionType === 'queue_call_attempt' && action.status === 'completed'
      )).length,
      reviewLeads: reviewQueue.length,
    },
  };
}

export async function getCallTranscript(user, actionId) {
  const actionRows = await unwrap(
    await insforge.database
      .from('bob_actions')
      .select('*')
      .eq('id', actionId)
      .eq('tenant_id', tenantIdFromUser(user))
      .limit(1),
    'Failed to load Bob action'
  );
  const action = fromDbRecord(actionRows?.[0]);
  if (!action) throw new Error('Bob action not found');

  const [leadRows, conversationRows, messageRows] = await Promise.all([
    action.leadId ? unwrap(
      await insforge.database.from('leads').select('*').eq('id', action.leadId).eq('tenant_id', tenantIdFromUser(user)).limit(1),
      'Failed to load lead'
    ) : [],
    action.conversationId ? unwrap(
      await insforge.database.from('lead_conversations').select('*').eq('id', action.conversationId).eq('tenant_id', tenantIdFromUser(user)).limit(1),
      'Failed to load conversation'
    ) : [],
    action.conversationId ? unwrap(
      await insforge.database
        .from('lead_conversation_messages')
        .select('*')
        .eq('conversation_id', action.conversationId)
        .eq('tenant_id', tenantIdFromUser(user))
        .order('created_at', { ascending: true })
        .limit(100),
      'Failed to load messages'
    ) : [],
  ]);

  const messages = fromDbRows(messageRows || []).filter((message) => (
    message.channel === 'phone' ||
    message.channel === 'sms' ||
    ['call_transcript', 'booking_link_sms', 'callback_confirmation_sms', 'post_call_booking_sms', 'sms_reply', 'sms_delivery_status']
      .includes(message.messageType)
  ));

  return {
    action,
    lead: fromDbRecord(leadRows?.[0]) || null,
    conversation: fromDbRecord(conversationRows?.[0]) || null,
    messages,
  };
}

export async function recordCallOutcome(user, actionId, { outcome, notes }) {
  if (!CALL_OUTCOMES.includes(outcome)) throw new Error('Unsupported call outcome');
  const activity = await getBobActivity(user);
  const action = activity.actions.find((row) => row.id === actionId);
  if (!action) throw new Error('Bob action not found');

  const now = new Date().toISOString();
  await updateTenantRow('bob_actions', user, actionId, {
    status: 'completed',
    executedAt: now,
    result: {
      ...(action.result || {}),
      callOutcome: outcome,
      outcome,
      callOutcomeNotes: typeof notes === 'string' ? notes.trim() : null,
      callOutcomeRecordedAt: now,
      callOutcomeRecordedBy: user?.authUserId || user?.id || null,
    },
  });

  return updateTenantRow('leads', user, action.leadId, {
    lastUpdatedBy: user?.authUserId || user?.id || null,
    lastContactedAt: now,
  });
}

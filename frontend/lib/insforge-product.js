import { insforge } from './insforge';
import {
  buildLeadImportPreview,
  contactPolicyForLead,
  importedLeadPayload,
  summarizeContactPolicy,
} from './lead-import';

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
  emailAddress: 'email_address',
  emailLocalPart: 'email_local_part',
  emailDomain: 'email_domain',
  emailConfiguredAt: 'email_configured_at',
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
  city: 'city',
  country: 'country',
  businessHoursStart: 'business_hours_start',
  businessHoursEnd: 'business_hours_end',
  businessNiche: 'business_niche',
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
  preferredLanguage: 'preferred_language',
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
  completedSteps: 'completed_steps',
  actorMode: 'actor_mode',
  actorUserId: 'actor_user_id',
  isComplete: 'is_complete',
  nicheKey: 'niche_key',
  sourceUrl: 'source_url',
  defaultPlaybookNotes: 'default_playbook_notes',
  platformKnowledgeDocumentId: 'platform_knowledge_document_id',
  assignmentSource: 'assignment_source',
  syncedAt: 'synced_at',
  superAdminUserId: 'super_admin_user_id',
  onboardingProgressId: 'onboarding_progress_id',
  emailNormalized: 'email_normalized',
  invitedByUserId: 'invited_by_user_id',
  claimedByUserId: 'claimed_by_user_id',
  claimedAt: 'claimed_at',
  auditSummary: 'audit_summary',
  completedAt: 'completed_at',
  attemptCount: 'attempt_count',
  nextActionAt: 'next_action_at',
  stopReason: 'stop_reason',
  followUpAt: 'follow_up_at',
  followUpStatus: 'follow_up_status',
};

export const ONBOARDING_STEPS = [
  'company',
  'agent',
  'phone',
  'email',
  'booking',
  'knowledge',
  'leads',
  'review',
];

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
  const tenantId = user?.tenantId || user?.tenant?.id || null;
  if (!tenantId) {
    throw new Error('Tenant context is required. Please sign out and sign back in.');
  }
  return tenantId;
}

async function unwrap(result, defaultMessage) {
  if (result.error) {
    throw new Error(result.error.message || defaultMessage);
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

async function selectRows(table, options = {}) {
  let query = insforge.database.from(table).select(options.select || '*');
  if (options.order) {
    query = query.order(options.order.column, { ascending: options.order.ascending ?? false });
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }
  return fromDbRows(await unwrap(await query, `Failed to load ${table}`) || []);
}

async function safeSelectRows(table, options = {}) {
  try {
    return await selectRows(table, options);
  } catch (error) {
    console.warn(`Platform data skipped ${table}:`, error?.message || error);
    return [];
  }
}

async function insertRow(table, values) {
  const data = await unwrap(
    await insforge.database.from(table).insert([toDbRecord(values)]).select(),
    `Failed to create ${table}`
  );
  return fromDbRecord(data?.[0]);
}

async function updateRow(table, id, patch) {
  const data = await unwrap(
    await insforge.database
      .from(table)
      .update(toDbRecord({ ...patch, updatedAt: new Date().toISOString() }))
      .eq('id', id)
      .select(),
    `Failed to update ${table}`
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

function slugifyTenantName(name = '') {
  const slug = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || `tenant-${Date.now()}`;
}

function nicheKeyFromName(name = '') {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function assertValidPhoneNumber(phoneNumber) {
  const normalized = normalizePhoneNumber(phoneNumber);
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new Error('Use an E.164 phone number, like +15551234567');
  }
  return normalized;
}

function sanitizeStorageName(name = 'knowledge-document') {
  const defaultName = 'knowledge-document';
  const trimmed = String(name || defaultName).trim() || defaultName;
  return trimmed
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || defaultName;
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

export async function listTenantAgents(user) {
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

export async function listTenantsForAdmin() {
  return selectRows('tenants', {
    order: { column: 'created_at', ascending: false },
    limit: 500,
  });
}

export async function getCurrentPlatformAdminProfile() {
  const data = await unwrap(
    await insforge.database.rpc('current_platform_admin_profile'),
    'Failed to load platform admin profile'
  );
  return fromDbRecord(data || { isPlatformAdmin: false });
}

export async function createAssistedTenant(user, input = {}) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Company name is required');
  const ownerEmail = String(input.ownerEmail || '').trim();
  if (!ownerEmail) throw new Error('Owner email is required');
  const ownerEmailNormalized = ownerEmail.toLowerCase();
  const existingClaims = await unwrap(
    await insforge.database
      .from('tenant_owner_claims')
      .select('id, email, tenant_id, status')
      .eq('email_normalized', ownerEmailNormalized)
      .eq('status', 'pending')
      .limit(1),
    'Failed to validate owner email'
  );
  if (existingClaims?.length) {
    throw new Error('This owner email already has a pending tenant account claim.');
  }
  const slugBase = slugifyTenantName(input.slug || name);
  const slug = `${slugBase}-${Date.now().toString(36)}`.slice(0, 118);
  const tenant = await insertRow('tenants', {
    name,
    slug,
    industry: String(input.industry || '').trim() || null,
    businessNiche: input.businessNiche || null,
    defaultTimezone: String(input.defaultTimezone || '').trim() || 'America/Toronto',
    status: 'onboarding',
    metadata: {
      source: 'super_admin_assisted',
      ownerEmail: ownerEmail || null,
      createdByUserId: user?.authUserId || user?.id || null,
    },
  });

  const ownerClaim = ownerEmail ? await insertRow('tenant_owner_claims', {
    tenantId: tenant.id,
    email: ownerEmail,
    emailNormalized: ownerEmailNormalized,
    role: 'owner',
    status: 'pending',
    invitedByUserId: user?.authUserId || user?.id || null,
    metadata: {
      source: 'super_admin_assisted',
      targetTenantName: name,
    },
  }) : null;

  const progress = await insertRow('tenant_onboarding_progress', {
    tenantId: tenant.id,
    currentStep: 'company',
    completedSteps: [],
    answers: {
      company: {
        name,
        industry: String(input.industry || '').trim() || null,
        businessNiche: input.businessNiche || null,
        defaultTimezone: String(input.defaultTimezone || '').trim() || 'America/Toronto',
      },
    },
    actorMode: 'super_admin_assisted',
    actorUserId: user?.authUserId || user?.id || null,
    isComplete: false,
    metadata: {
      source: 'super_admin_assisted',
      targetTenantName: name,
    },
  });

  const session = await insertRow('super_admin_tenant_setup_sessions', {
    tenantId: tenant.id,
    superAdminUserId: user?.authUserId || user?.id || null,
    onboardingProgressId: progress.id,
    currentStep: 'company',
    status: 'in_progress',
    auditSummary: `Assisted setup started for ${name}`,
    metadata: {
      actorMode: 'super_admin_assisted',
      targetTenantName: name,
      ownerEmail: ownerEmail || null,
      ownerClaimId: ownerClaim?.id || null,
    },
  });

  return { tenant, progress, session, ownerClaim };
}

export async function updateSuperAdminTenantProfile(user, tenantId, input = {}) {
  if (!tenantId) throw new Error('Tenant is required');
  const profile = await getCurrentPlatformAdminProfile();
  if (!profile?.isPlatformAdmin) throw new Error('Platform admin access is required');

  const patch = {};
  if (input.name !== undefined) {
    const name = String(input.name || '').trim();
    if (!name) throw new Error('Company name is required');
    patch.name = name;
  }
  if (input.industry !== undefined) patch.industry = String(input.industry || '').trim() || null;
  if (input.businessNiche !== undefined) patch.businessNiche = String(input.businessNiche || '').trim() || null;
  if (input.defaultTimezone !== undefined) {
    const defaultTimezone = String(input.defaultTimezone || '').trim();
    if (!defaultTimezone) throw new Error('Default timezone is required');
    patch.defaultTimezone = defaultTimezone;
  }
  if (input.city !== undefined) patch.city = String(input.city || '').trim() || null;
  if (input.country !== undefined) patch.country = String(input.country || '').trim() || null;
  if (input.status !== undefined) {
    const status = String(input.status || '').trim();
    if (!['active', 'onboarding', 'suspended', 'archived'].includes(status)) {
      throw new Error('Unsupported tenant status');
    }
    patch.status = status;
  }

  if (!Object.keys(patch).length) throw new Error('No tenant changes were provided');

  const data = await unwrap(
    await insforge.database
      .from('tenants')
      .update(toDbRecord({
        ...patch,
        metadata: {
          ...(input.existingMetadata || {}),
          lastPlatformAdminEdit: {
            userId: user?.authUserId || user?.id || null,
            editedAt: new Date().toISOString(),
            source: 'super_admin_tenants_page',
          },
        },
        updatedAt: new Date().toISOString(),
      }))
      .eq('id', tenantId)
      .select(),
    'Failed to update tenant'
  );
  return fromDbRecord(data?.[0]);
}

export async function updateTenantBusinessNiche(tenantId, businessNiche) {
  const data = await unwrap(
    await insforge.database
      .from('tenants')
      .update(toDbRecord({ businessNiche: businessNiche || null, updatedAt: new Date().toISOString() }))
      .eq('id', tenantId)
      .select(),
    'Failed to update tenant niche'
  );
  return fromDbRecord(data?.[0]);
}

export async function listSuperAdminSetupSessions() {
  return selectRows('super_admin_tenant_setup_sessions', {
    order: { column: 'updated_at', ascending: false },
    limit: 200,
  });
}

export async function updateSuperAdminSetupSession(sessionId, input = {}) {
  const patch = {};
  if (input.currentStep) patch.currentStep = input.currentStep;
  if (input.status) patch.status = input.status;
  if (input.auditSummary !== undefined) patch.auditSummary = String(input.auditSummary || '').trim() || null;
  if (input.metadata !== undefined) patch.metadata = input.metadata || {};
  if (input.status === 'complete') patch.completedAt = new Date().toISOString();
  return updateRow('super_admin_tenant_setup_sessions', sessionId, patch);
}

export async function listBusinessNiches() {
  return selectRows('business_niches', {
    order: { column: 'name', ascending: true },
    limit: 500,
  });
}

export async function upsertBusinessNiche(user, input = {}) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Niche name is required');
  const key = nicheKeyFromName(input.key || name);
  if (!key || key.length < 3) throw new Error('Use a longer niche key');
  const payload = {
    key,
    name,
    description: String(input.description || '').trim() || null,
    defaultPlaybookNotes: String(input.defaultPlaybookNotes || '').trim() || null,
    status: input.status || 'active',
    metadata: input.metadata || {},
    createdByUserId: user?.authUserId || user?.id || null,
  };
  const existing = await unwrap(
    await insforge.database.from('business_niches').select('*').eq('key', key).limit(1),
    'Failed to check business niche'
  );

  if (existing?.[0]) {
    const data = await unwrap(
      await insforge.database
        .from('business_niches')
        .update(toDbRecord({ ...payload, updatedAt: new Date().toISOString() }))
        .eq('key', key)
        .select(),
      'Failed to update business niche'
    );
    return fromDbRecord(data?.[0]);
  }

  return insertRow('business_niches', payload);
}

export async function listPlatformKnowledgeDocuments() {
  return selectRows('platform_knowledge_documents', {
    order: { column: 'updated_at', ascending: false },
    limit: 500,
  });
}

export async function createPlatformKnowledgeDocument(user, input = {}) {
  const title = assertKnowledgeTitle(input.title);
  const scope = input.scope === 'niche' ? 'niche' : 'global';
  const sourceType = input.sourceType || 'text';
  if (!['text', 'url', 'file'].includes(sourceType)) throw new Error('Unsupported knowledge source type');
  if (scope === 'niche' && !input.nicheKey) throw new Error('Choose a niche for niche knowledge');
  if (scope === 'global' && input.nicheKey) throw new Error('Global knowledge cannot have a niche key');
  if (sourceType === 'url' && !/^https?:\/\/\S+$/i.test(String(input.sourceUrl || '').trim())) {
    throw new Error('Use a valid source URL');
  }
  if (sourceType === 'text' && !String(input.bodyText || '').trim()) {
    throw new Error('Add document text before saving');
  }

  return insertRow('platform_knowledge_documents', {
    scope,
    nicheKey: scope === 'niche' ? input.nicheKey : null,
    title,
    sourceType,
    sourceUrl: sourceType === 'url' ? String(input.sourceUrl || '').trim() : null,
    bodyText: sourceType === 'text' ? String(input.bodyText || '').trim() : null,
    storageUrl: input.storageUrl || null,
    storageKey: input.storageKey || null,
    status: input.status || 'uploaded',
    version: Number(input.version) || 1,
    metadata: input.metadata || { source: 'phase18_admin_dashboard' },
    createdByUserId: user?.authUserId || user?.id || null,
  });
}

export async function uploadPlatformKnowledgeFile(user, file, input = {}) {
  if (!file) throw new Error('Choose a file to upload');
  const title = assertKnowledgeTitle(input.title || file.name);
  const scope = input.scope === 'niche' ? 'niche' : 'global';
  if (scope === 'niche' && !input.nicheKey) throw new Error('Choose a niche for niche knowledge');
  if (scope === 'global' && input.nicheKey) throw new Error('Global knowledge cannot have a niche key');

  const safeName = sanitizeStorageName(file.name || title);
  const storageKey = `${scope}/${input.nicheKey || 'global'}/${Date.now()}-${safeName}`;
  const { data, error } = await insforge.storage
    .from('platform-knowledge')
    .upload(storageKey, file);

  if (error) {
    throw new Error(error.message || 'Failed to upload file to platform knowledge storage');
  }

  return insertRow('platform_knowledge_documents', {
    scope,
    nicheKey: scope === 'niche' ? input.nicheKey : null,
    title,
    sourceType: 'file',
    storageUrl: data?.url || null,
    storageKey: data?.key || storageKey,
    status: 'uploaded',
    version: Number(input.version) || 1,
    metadata: {
      source: 'super_admin_knowledge_upload',
      originalFileName: file.name || null,
      mimeType: file.type || null,
      fileSize: Number.isFinite(file.size) ? file.size : null,
      uploadedByUserId: user?.authUserId || user?.id || null,
      uploadedAt: new Date().toISOString(),
    },
    createdByUserId: user?.authUserId || user?.id || null,
  });
}

export async function updatePlatformKnowledgeDocument(documentId, input = {}) {
  const patch = {};
  if (input.title !== undefined) patch.title = assertKnowledgeTitle(input.title);
  if (input.status) patch.status = input.status;
  if (input.sourceUrl !== undefined) patch.sourceUrl = String(input.sourceUrl || '').trim() || null;
  if (input.bodyText !== undefined) patch.bodyText = String(input.bodyText || '').trim() || null;
  if (input.elevenlabsDocumentId !== undefined) patch.elevenlabsDocumentId = String(input.elevenlabsDocumentId || '').trim() || null;
  if (input.version !== undefined) patch.version = Number(input.version) || 1;
  if (input.metadata !== undefined) patch.metadata = input.metadata || {};
  return updateRow('platform_knowledge_documents', documentId, patch);
}

export async function listTenantKnowledgeAssignments() {
  return selectRows('tenant_knowledge_assignments', {
    order: { column: 'updated_at', ascending: false },
    limit: 1000,
  });
}

export async function upsertTenantKnowledgeAssignment(user, input = {}) {
  if (!input.tenantId) throw new Error('Choose a tenant');
  if (!input.platformKnowledgeDocumentId) throw new Error('Choose a shared knowledge document');
  const payload = {
    tenantId: input.tenantId,
    tenantAgentId: input.tenantAgentId || null,
    platformKnowledgeDocumentId: input.platformKnowledgeDocumentId,
    assignmentSource: input.assignmentSource || 'super_admin_override',
    status: input.status || 'active',
    metadata: input.metadata || {},
    createdByUserId: user?.authUserId || user?.id || null,
  };
  let query = insforge.database
    .from('tenant_knowledge_assignments')
    .select('*')
    .eq('tenant_id', payload.tenantId)
    .eq('platform_knowledge_document_id', payload.platformKnowledgeDocumentId);
  query = payload.tenantAgentId
    ? query.eq('tenant_agent_id', payload.tenantAgentId)
    : query.is('tenant_agent_id', null);
  const existing = await unwrap(await query.limit(1), 'Failed to check knowledge assignment');

  if (existing?.[0]) {
    return updateRow('tenant_knowledge_assignments', existing[0].id, {
      assignmentSource: payload.assignmentSource,
      status: payload.status,
      metadata: payload.metadata,
    });
  }

  return insertRow('tenant_knowledge_assignments', payload);
}

export async function updateTenantKnowledgeAssignment(assignmentId, input = {}) {
  const patch = {};
  if (input.status) patch.status = input.status;
  if (input.assignmentSource) patch.assignmentSource = input.assignmentSource;
  if (input.syncedAt !== undefined) patch.syncedAt = input.syncedAt || null;
  if (input.metadata !== undefined) patch.metadata = input.metadata || {};
  return updateRow('tenant_knowledge_assignments', assignmentId, patch);
}

function countBy(rows = [], keyFn) {
  return rows.reduce((counts, row) => {
    const key = keyFn(row) || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function percent(value, total) {
  return total ? Math.round((value / total) * 100) : 0;
}

export async function getSuperAdminDashboardData() {
  const [
    tenants,
    tenantAgents,
    campaigns,
    campaignLeads,
    bobActions,
    meetings,
    messages,
    emails,
    phoneNumbers,
    billingProfiles,
    usageEvents,
    operationalAlerts,
    platformKnowledgeDocuments,
    businessNiches,
    knowledgeAssignments,
    setupSessions,
    platformAdmins,
    auditLogs,
    voiceSessions,
    bookingIntegrations,
    emailIdentities,
    tenantOwnerClaims,
    tenantUsers,
  ] = await Promise.all([
    safeSelectRows('tenants', { order: { column: 'created_at', ascending: false }, limit: 1000 }),
    safeSelectRows('tenant_agents', { order: { column: 'created_at', ascending: false }, limit: 5000 }),
    safeSelectRows('campaigns', { order: { column: 'created_at', ascending: false }, limit: 5000 }),
    safeSelectRows('campaign_leads', { order: { column: 'created_at', ascending: false }, limit: 10000 }),
    safeSelectRows('bob_actions', { order: { column: 'created_at', ascending: false }, limit: 10000 }),
    safeSelectRows('meetings', { order: { column: 'created_at', ascending: false }, limit: 10000 }),
    safeSelectRows('lead_conversation_messages', { order: { column: 'created_at', ascending: false }, limit: 10000 }),
    safeSelectRows('email_queue', { order: { column: 'created_at', ascending: false }, limit: 10000 }),
    safeSelectRows('tenant_phone_numbers', { order: { column: 'created_at', ascending: false }, limit: 5000 }),
    safeSelectRows('tenant_billing_profiles', { order: { column: 'created_at', ascending: false }, limit: 1000 }),
    safeSelectRows('tenant_usage_events', { order: { column: 'created_at', ascending: false }, limit: 10000 }),
    safeSelectRows('tenant_operational_alerts', { order: { column: 'created_at', ascending: false }, limit: 1000 }),
    listPlatformKnowledgeDocuments(),
    listBusinessNiches(),
    listTenantKnowledgeAssignments(),
    listSuperAdminSetupSessions(),
    safeSelectRows('platform_admin_users', { order: { column: 'created_at', ascending: false }, limit: 200 }),
    safeSelectRows('platform_admin_audit_logs', { order: { column: 'created_at', ascending: false }, limit: 1000 }),
    safeSelectRows('voice_call_sessions', { order: { column: 'created_at', ascending: false }, limit: 10000 }),
    safeSelectRows('tenant_booking_integrations', { order: { column: 'created_at', ascending: false }, limit: 5000 }),
    safeSelectRows('tenant_email_identities', { order: { column: 'created_at', ascending: false }, limit: 5000 }),
    safeSelectRows('tenant_owner_claims', { order: { column: 'created_at', ascending: false }, limit: 5000 }),
    safeSelectRows('tenant_users', { order: { column: 'created_at', ascending: false }, limit: 5000 }),
  ]);

  const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]));
  const agentUsageCounts = bobActions.reduce((counts, action) => {
    const agentId = action.tenantAgentId || action.payload?.tenantAgentId || action.result?.tenantAgentId;
    if (!agentId) return counts;
    counts[agentId] = (counts[agentId] || 0) + 1;
    return counts;
  }, {});
  const agentsWithUsage = tenantAgents.map((agent) => ({
    ...agent,
    tenantName: tenantById.get(agent.tenantId)?.name || 'Unknown tenant',
    usageCount: agentUsageCounts[agent.id] || 0,
    meetingCount: meetings.filter((meeting) => meeting.tenantAgentId === agent.id).length,
  })).sort((a, b) => b.usageCount - a.usageCount);

  const usageByTenant = tenants.map((tenant) => {
    const tenantUsage = usageEvents.filter((event) => event.tenantId === tenant.id);
    const tenantMessages = messages.filter((message) => message.tenantId === tenant.id);
    const tenantEmails = emails.filter((email) => email.tenantId === tenant.id);
    const tenantCalls = voiceSessions.filter((session) => session.tenantId === tenant.id);
    const tenantMeetings = meetings.filter((meeting) => meeting.tenantId === tenant.id);
    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      status: tenant.status,
      businessNiche: tenant.businessNiche,
      usageEvents: tenantUsage.length,
      calls: tenantCalls.length,
      messages: tenantMessages.length,
      emails: tenantEmails.length,
      meetings: tenantMeetings.length,
      agents: tenantAgents.filter((agent) => agent.tenantId === tenant.id && agent.status !== 'archived').length,
      openAlerts: operationalAlerts.filter((alert) => alert.tenantId === tenant.id && alert.status !== 'resolved').length,
    };
  }).sort((a, b) => (b.usageEvents + b.calls + b.messages + b.emails) - (a.usageEvents + a.calls + a.messages + a.emails));

  const tenantReadiness = tenants.map((tenant) => {
    const hasAgent = tenantAgents.some((agent) => agent.tenantId === tenant.id && ['live', 'testing'].includes(agent.status));
    const hasPhone = phoneNumbers.some((phone) => phone.tenantId === tenant.id && phone.status === 'active');
    const hasEmail = emailIdentities.some((identity) => identity.tenantId === tenant.id && identity.status === 'active');
    const hasBooking = bookingIntegrations.some((booking) => booking.tenantId === tenant.id && booking.status === 'connected');
    const activeSetup = setupSessions.find((session) => session.tenantId === tenant.id && session.status !== 'complete');
    const completed = [hasAgent, hasPhone, hasEmail, hasBooking].filter(Boolean).length;
    return {
      ...tenant,
      hasAgent,
      hasPhone,
      hasEmail,
      hasBooking,
      readinessScore: percent(completed, 4),
      setupStep: activeSetup?.currentStep || (completed === 4 ? 'review' : 'company'),
      setupStatus: activeSetup?.status || (completed === 4 ? 'complete' : 'not_started'),
    };
  });

  const providerHealth = [
    {
      provider: 'Twilio Voice',
      status: phoneNumbers.some((phone) => phone.voiceEnabled && phone.status === 'active') ? 'active' : 'needs_setup',
      healthy: phoneNumbers.filter((phone) => phone.voiceEnabled && phone.status === 'active').length,
      attention: voiceSessions.filter((session) => ['failed', 'interrupted'].includes(session.status) || ['failed', 'interrupted'].includes(session.outcome)).length,
    },
    {
      provider: 'Twilio SMS',
      status: phoneNumbers.some((phone) => phone.smsEnabled && phone.status === 'active') ? 'active' : 'needs_setup',
      healthy: messages.filter((message) => message.channel === 'sms' && ['sent', 'delivered'].includes(message.status)).length,
      attention: messages.filter((message) => message.channel === 'sms' && message.status === 'failed').length,
    },
    {
      provider: 'Twilio WhatsApp',
      status: phoneNumbers.some((phone) => phone.whatsappStatus === 'active') ? 'active' : 'needs_setup',
      healthy: messages.filter((message) => message.channel === 'whatsapp' && ['sent', 'delivered'].includes(message.status)).length,
      attention: messages.filter((message) => message.channel === 'whatsapp' && message.status === 'failed').length,
    },
    {
      provider: 'ElevenLabs',
      status: tenantAgents.some((agent) => agent.elevenlabsAgentId) ? 'active' : 'needs_setup',
      healthy: tenantAgents.filter((agent) => agent.elevenlabsAgentId && ['live', 'testing'].includes(agent.status)).length,
      attention: tenantAgents.filter((agent) => !agent.elevenlabsAgentId && agent.status !== 'archived').length,
    },
    {
      provider: 'Calendly / Booking',
      status: bookingIntegrations.some((booking) => booking.status === 'connected') ? 'active' : 'needs_setup',
      healthy: bookingIntegrations.filter((booking) => booking.status === 'connected').length,
      attention: bookingIntegrations.filter((booking) => booking.status === 'needs_attention').length,
    },
    {
      provider: 'Email',
      status: emailIdentities.some((identity) => identity.status === 'active') ? 'active' : 'needs_setup',
      healthy: emails.filter((email) => ['sent', 'delivered'].includes(email.status)).length,
      attention: emails.filter((email) => ['failed', 'bounced'].includes(email.status)).length,
    },
  ];

  return {
    tenants,
    tenantAgents,
    campaigns,
    campaignLeads,
    bobActions,
    meetings,
    messages,
    emails,
    phoneNumbers,
    billingProfiles,
    usageEvents,
    operationalAlerts,
    platformKnowledgeDocuments,
    businessNiches,
    knowledgeAssignments,
    setupSessions,
    platformAdmins,
    auditLogs,
    voiceSessions,
    bookingIntegrations,
    emailIdentities,
    tenantOwnerClaims,
    tenantUsers,
    tenantReadiness,
    agentsWithUsage,
    usageByTenant,
    providerHealth,
    counts: {
      tenants: tenants.length,
      activeTenants: tenants.filter((tenant) => tenant.status === 'active').length,
      onboardingTenants: tenants.filter((tenant) => tenant.status === 'onboarding').length,
      aiAgents: tenantAgents.filter((agent) => agent.status !== 'archived').length,
      liveAgents: tenantAgents.filter((agent) => agent.status === 'live').length,
      meetings: meetings.length,
      campaigns: campaigns.length,
      activeCampaigns: campaigns.filter((campaign) => ['ACTIVE', 'running'].includes(campaign.status)).length,
      openAlerts: operationalAlerts.filter((alert) => alert.status !== 'resolved').length,
      sharedKnowledge: platformKnowledgeDocuments.filter((document) => document.status !== 'archived').length,
      platformAdmins: platformAdmins.filter((admin) => admin.status === 'active').length,
    },
    breakdowns: {
      tenantsByStatus: countBy(tenants, (tenant) => tenant.status),
      agentsByStatus: countBy(tenantAgents, (agent) => agent.status),
      actionsByStatus: countBy(bobActions, (action) => action.status),
      usageByType: countBy(usageEvents, (event) => event.eventType || event.usageType || event.metricKey),
      alertsBySeverity: countBy(operationalAlerts, (alert) => alert.severity || alert.level || 'info'),
    },
  };
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

function normalizeCompletedSteps(value) {
  if (Array.isArray(value)) return value.filter((step) => ONBOARDING_STEPS.includes(step));
  return [];
}

function buildOnboardingReadiness({ summary, knowledgeDocuments = [], leads = [] }) {
  const tenant = summary?.tenant || {};
  const agents = summary?.agents || [];
  const primaryPhoneNumber = summary?.primaryPhoneNumber || null;
  const emailIdentity = summary?.emailIdentity || null;
  const bookingIntegration = summary?.bookingIntegration || null;
  const callableAgent = agents.find((agent) => agent.status === 'live' && agent.elevenlabsAgentId)
    || agents.find((agent) => agent.status === 'live');
  const reachableLeads = leads.filter((lead) => {
    if (lead.doNotContact) return false;
    if (!lead.phone && !lead.email) return false;
    return Boolean(lead.callConsent || lead.smsConsent || lead.whatsappConsent || lead.emailConsent);
  });

  const checks = [
    {
      key: 'company',
      label: 'Company profile',
      complete: Boolean(tenant.name && tenant.defaultTimezone && tenant.city && tenant.country),
      required: true,
      detail: tenant.name
        ? [tenant.name, [tenant.city, tenant.country].filter(Boolean).join(', ')].filter(Boolean).join(' - ')
        : 'Company name, city, country, and timezone are required.',
    },
    {
      key: 'agent',
      label: 'AI agent',
      complete: Boolean(callableAgent),
      required: true,
      detail: callableAgent ? callableAgent.displayName : 'Create a live AI agent.',
    },
    {
      key: 'phone',
      label: 'Phone identity',
      complete: Boolean(primaryPhoneNumber?.phoneNumber),
      required: false,
      detail: primaryPhoneNumber?.phoneNumber || 'Optional. A dedicated tenant number can be added later.',
    },
    {
      key: 'email',
      label: 'Sender identity',
      complete: Boolean(emailIdentity?.fromEmail && emailIdentity?.fromName),
      required: false,
      detail: emailIdentity?.fromEmail || 'Optional, but recommended for confirmations and follow-up.',
    },
    {
      key: 'booking',
      label: 'Booking path',
      complete: Boolean(
        bookingIntegration?.status === 'connected'
        && bookingIntegration.provider === 'calendly'
        && (bookingIntegration.bookingUrl || bookingIntegration.eventTypeId)
      ),
      required: true,
      detail: bookingIntegration?.bookingUrl || bookingIntegration?.eventTypeId || 'Connect Calendly or add a Calendly event URL.',
    },
    {
      key: 'knowledge',
      label: 'Knowledge base',
      complete: knowledgeDocuments.length > 0,
      required: false,
      detail: knowledgeDocuments.length ? `${knowledgeDocuments.length} source${knowledgeDocuments.length === 1 ? '' : 's'} saved` : 'Optional, but recommended before live outreach.',
    },
    {
      key: 'leads',
      label: 'Leads with consent',
      complete: reachableLeads.length > 0,
      required: true,
      detail: reachableLeads.length ? `${reachableLeads.length} reachable lead${reachableLeads.length === 1 ? '' : 's'}` : 'Import at least one lead with channel consent.',
    },
  ];

  const blockers = checks.filter((check) => check.required && !check.complete);
  const warnings = checks.filter((check) => !check.required && !check.complete);
  return {
    checks,
    blockers,
    warnings,
    isReady: blockers.length === 0,
    score: Math.round((checks.filter((check) => check.complete).length / checks.length) * 100),
  };
}

async function getExistingOnboardingProgress(user) {
  const rows = await selectTenantRows('tenant_onboarding_progress', user, {
    order: { column: 'created_at', ascending: false },
    limit: 1,
  });
  return rows[0] || null;
}

async function ensureTenantOnboardingProgress(user) {
  const existing = await getExistingOnboardingProgress(user);
  if (existing) {
    return {
      ...existing,
      completedSteps: normalizeCompletedSteps(existing.completedSteps),
      answers: existing.answers || {},
    };
  }

  const created = await insertTenantRow('tenant_onboarding_progress', user, {
    currentStep: 'company',
    completedSteps: [],
    answers: {},
    actorMode: 'tenant_self_service',
    actorUserId: user?.authUserId || user?.id || null,
    isComplete: false,
    metadata: { source: 'frontend_onboarding' },
  });
  return {
    ...created,
    completedSteps: normalizeCompletedSteps(created.completedSteps),
    answers: created.answers || {},
  };
}

export async function getTenantOnboardingState(user) {
  const [summary, knowledgeDocuments, leads, progress] = await Promise.all([
    getTenantSettingsSummary(user),
    listTenantKnowledgeDocuments(user).catch(() => []),
    listLeads(user, 500).catch(() => []),
    ensureTenantOnboardingProgress(user),
  ]);
  const readiness = buildOnboardingReadiness({ summary, knowledgeDocuments, leads });
  return {
    progress,
    summary,
    knowledgeDocuments,
    leads,
    readiness,
  };
}

export async function saveTenantOnboardingStep(user, step, input = {}) {
  if (!ONBOARDING_STEPS.includes(step)) throw new Error('Unsupported onboarding step');
  const progress = await ensureTenantOnboardingProgress(user);
  const completedSteps = new Set(normalizeCompletedSteps(progress.completedSteps));
  if (input.completed !== false) completedSteps.add(step);
  const answers = {
    ...(progress.answers || {}),
    [step]: {
      ...((progress.answers || {})[step] || {}),
      ...(input.answers || {}),
      updatedAt: new Date().toISOString(),
    },
  };
  const nextStep = input.nextStep && ONBOARDING_STEPS.includes(input.nextStep)
    ? input.nextStep
    : step;

  return updateTenantRow('tenant_onboarding_progress', user, progress.id, {
    currentStep: nextStep,
    completedSteps: Array.from(completedSteps),
    answers,
    actorUserId: user?.authUserId || user?.id || null,
    isComplete: Boolean(input.isComplete),
    completedAt: input.isComplete ? new Date().toISOString() : null,
    metadata: {
      ...(progress.metadata || {}),
      lastSavedStep: step,
    },
  });
}

export async function completeTenantOnboarding(user) {
  const state = await getTenantOnboardingState(user);
  if (!state.readiness.isReady) {
    throw new Error('Complete required setup before starting live outreach.');
  }

  const progress = await saveTenantOnboardingStep(user, 'review', {
    completed: true,
    nextStep: 'review',
    isComplete: true,
    answers: {
      readinessScore: state.readiness.score,
      completedAt: new Date().toISOString(),
    },
  });

  await unwrap(
    await insforge.database
      .from('tenants')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', tenantIdFromUser(user))
      .select('id'),
    'Failed to mark tenant onboarding complete'
  );

  return progress;
}

export async function getTenantOnboardingRedirect(user) {
  if (!user?.tenantId && !user?.tenant?.id) return '/onboarding';
  try {
    const { progress } = await getTenantOnboardingState(user);
    return progress?.isComplete ? '/admin-dashboard' : '/onboarding';
  } catch (error) {
    console.warn('Onboarding redirect check skipped:', error?.message || error);
    return '/admin-dashboard';
  }
}

export async function updateTenantCompanyProfile(user, input = {}) {
  const name = input.name?.trim();
  if (!name) throw new Error('Company name is required');
  const defaultTimezone = input.defaultTimezone?.trim() || 'America/Toronto';
  const city = input.city?.trim() || null;
  const country = input.country?.trim() || null;
  if (!city) throw new Error('City is required');
  if (!country) throw new Error('Country is required');
  const industry = input.industry?.trim() || null;
  const businessNiche = input.businessNiche?.trim() || null;
  const tenantId = tenantIdFromUser(user);

  const data = await unwrap(
    await insforge.database
      .from('tenants')
      .update(toDbRecord({
        name,
        industry,
        businessNiche,
        defaultTimezone,
        city,
        country,
        businessHoursStart: '10:00',
        businessHoursEnd: '17:00',
        status: 'onboarding',
        updatedAt: new Date().toISOString(),
      }))
      .eq('id', tenantId)
      .select(),
    'Failed to update company profile'
  );
  return fromDbRecord(data?.[0]);
}

export async function createTenantAgent(user, input = {}) {
  const displayName = input.displayName?.trim();
  if (!displayName) throw new Error('Agent name is required');
  const metadata = {
    ...(input.metadata || {}),
    voiceProfile: input.voiceProfile || input.metadata?.voiceProfile || null,
    personality: input.personality || input.metadata?.personality || null,
    customPersonalityNotes: input.customPersonalityNotes?.trim() || input.metadata?.customPersonalityNotes || null,
  };

  return insertTenantRow('tenant_agents', user, {
    createdByUserId: user?.authUserId || user?.id || null,
    displayName,
    templateKey: input.templateKey || 'custom-agent',
    voiceId: input.voiceId?.trim() || null,
    promptVersion: input.promptVersion?.trim() || 'agent-template-v2',
    status: input.status || 'live',
    metadata,
  });
}

export async function updateTenantAgent(user, agentId, input = {}) {
  if (!agentId) throw new Error('AI agent is required');
  const patch = {};
  if (input.displayName !== undefined) {
    const displayName = input.displayName?.trim();
    if (!displayName) throw new Error('Agent name is required');
    patch.displayName = displayName;
  }
  if (input.voiceId !== undefined) patch.voiceId = input.voiceId?.trim() || null;
  if (input.status !== undefined) {
    const allowed = ['testing', 'live', 'paused', 'archived'];
    if (!allowed.includes(input.status)) throw new Error('Unsupported AI agent status');
    patch.status = input.status;
  }
  if (
    input.voiceProfile !== undefined
    || input.personality !== undefined
    || input.customPersonalityNotes !== undefined
    || input.metadata !== undefined
  ) {
    patch.metadata = {
      ...(input.existingMetadata || {}),
      ...(input.metadata || {}),
      voiceProfile: input.voiceProfile || input.metadata?.voiceProfile || null,
      personality: input.personality || input.metadata?.personality || null,
      customPersonalityNotes: input.customPersonalityNotes?.trim() || input.metadata?.customPersonalityNotes || null,
    };
  }
  return updateTenantRow('tenant_agents', user, agentId, patch);
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
    whatsappStatus: input.whatsappStatus || 'active',
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
  const provider = input.provider || 'calendly';
  const bookingUrl = input.bookingUrl?.trim() || null;
  const meetingLink = input.meetingLink?.trim() || null;
  const eventTypeId = input.eventTypeId?.trim() || null;
  if (provider === 'manual' && !bookingUrl) {
    throw new Error('Manual booking requires a booking URL');
  }
  if (provider === 'calendly' && !bookingUrl && !eventTypeId) {
    throw new Error('Calendly setup requires a booking URL or event type ID');
  }
  if (meetingLink && !/^https?:\/\/\S+$/i.test(meetingLink)) {
    throw new Error('Meeting link must start with http:// or https://');
  }

  const existing = primaryActive(await selectTenantRows('tenant_booking_integrations', user));
  const values = {
    provider,
    status: bookingUrl || eventTypeId ? 'connected' : 'disconnected',
    bookingUrl,
    eventTypeId,
    externalAccountId: input.externalAccountId?.trim() || null,
    defaultMeetingType: input.defaultMeetingType || 'phone',
    metadata: {
      ...(existing?.metadata || {}),
      ...(input.metadata || {}),
      meetingLink,
    },
  };
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
        const rawPreferredChannel = String(lead?.preferredContactChannel || '').toLowerCase().replace(/[\s_-]+/g, '_');
        const preferredChannel = ['phone', 'voice', 'call', 'calls', 'phone_call', 'phonecall', 'telephone'].includes(rawPreferredChannel)
          ? 'call'
          : ['sms', 'text', 'text_message'].includes(rawPreferredChannel)
            ? 'sms'
            : ['whatsapp', 'wa'].includes(rawPreferredChannel)
              ? 'whatsapp'
              : ['email', 'e_mail', 'mail'].includes(rawPreferredChannel)
                ? 'email'
                : rawPreferredChannel;
        const prefersEmail = preferredChannel === 'email';
        const canEmail = Boolean(lead?.emailConsent && lead?.email);
        const canCall = Boolean(lead?.callConsent && lead?.phone);
        const canSms = Boolean(lead?.smsConsent && lead?.phone);
        const useEmail = prefersEmail && canEmail;
        const useCall = !useEmail && canCall;
        const useSms = !useEmail && !useCall && canSms;
        return {
          campaignId: campaign.id,
          campaignLeadId: campaignLead.id,
          leadId: campaignLead.leadId,
          actionType: useEmail ? 'send_email' : useCall ? 'queue_call_attempt' : 'send_sms',
          channel: useEmail ? 'email' : useCall ? 'phone' : 'sms',
          status: useCall ? 'awaiting_call' : ((useEmail || useSms) ? 'pending' : 'awaiting_human'),
          reason: useEmail ? 'Campaign first step: email preference' : useCall ? 'Campaign first step: call' : (useSms ? 'Campaign next step: SMS' : 'Campaign requires email preference, call, or SMS consent'),
          scheduledFor: new Date().toISOString(),
          payload: {
            source: 'campaign_import',
            campaignNumber: campaign.campaignNumber,
            campaignLeadId: campaignLead.id,
            tenantAgentId: campaignLead.agentId || lead?.assignedTenantAgentId || defaultAgent?.id || null,
            preferredContactChannel: preferredChannel || null,
          },
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
  const tenantId = tenantIdFromUser(user);
  await unwrap(
    await insforge.database
      .from('voice_call_sessions')
      .update({
        lead_id: null,
        conversation_id: null,
        bob_action_id: null,
      })
      .eq('tenant_id', tenantId)
      .select('id'),
    'Failed to detach voice call sessions from leads'
  );

  const data = await unwrap(
    await insforge.database
      .from('leads')
      .delete()
      .eq('tenant_id', tenantId)
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
  if (typeof updates.preferredLanguage === 'string') {
    patch.preferredLanguage = updates.preferredLanguage.trim() || null;
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

function compactText(value, maxLength = 220) {
  if (!value || typeof value !== 'string') return '';
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength - 1).trimEnd() + '...';
}

function readableLabel(value) {
  if (!value) return 'Unknown';
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function firstText(...values) {
  return values.find((value) => typeof value === 'string' && value.trim()) || '';
}

function eventTimestamp(row = {}) {
  return row.sentAt || row.deliveredAt || row.executedAt || row.callStartedAt || row.answeredAt || row.endedAt || row.startTime || row.createdAt || row.updatedAt || null;
}

function buildLeadDiscussionSummary({ lead, conversations, messages, emails, calls, actions, meetings }) {
  const channelCounts = {
    calls: calls.length,
    emails: emails.length,
    texts: messages.filter((message) => message.channel === 'sms').length,
    chats: messages.filter((message) => ['chat', 'whatsapp', 'web_chat'].includes(message.channel)).length,
  };

  const latestConversation = [...conversations]
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())[0];
  const latestCall = [...calls]
    .sort((a, b) => new Date(eventTimestamp(b) || 0).getTime() - new Date(eventTimestamp(a) || 0).getTime())[0];

  const overview = compactText(firstText(
    latestConversation?.lastSummary,
    latestCall?.summary,
    lead.notes,
    lead.serviceInterest ? 'Interested in ' + lead.serviceInterest + '.' : ''
  ), 360);

  const keyPoints = [
    lead.serviceInterest ? 'Service interest: ' + lead.serviceInterest : null,
    lead.qualificationStatus ? 'Qualification: ' + readableLabel(lead.qualificationStatus) + (lead.qualificationScore ? ' (' + lead.qualificationScore + ')' : '') : null,
    lead.schedulingState ? 'Scheduling: ' + readableLabel(lead.schedulingState) : null,
    latestCall ? 'Latest call: ' + readableLabel(latestCall.outcome || latestCall.status) + (latestCall.summary ? ' - ' + compactText(latestCall.summary, 120) : '') : null,
    meetings[0] ? 'Meeting: ' + readableLabel(meetings[0].status) + ' for ' + meetings[0].title : null,
    lead.requiresHumanReview ? 'Needs human review: ' + (lead.escalationReason || 'Review requested.') : null,
    lead.doNotContact || lead.optedOutAt ? 'Contact paused: lead is marked do not contact or opted out.' : null,
  ].filter(Boolean).slice(0, 7);

  const timeline = [
    ...calls.map((call) => ({
      id: 'call-' + call.id,
      channel: 'Call',
      title: readableLabel(call.outcome || call.status || 'Call'),
      body: compactText(firstText(call.summary, call.transcript, call.errorMessage), 280),
      status: call.status,
      occurredAt: eventTimestamp(call),
    })),
    ...emails.map((email) => ({
      id: 'email-' + email.id,
      channel: 'Email',
      title: compactText(email.subject || readableLabel(email.emailType || email.status), 120),
      body: compactText(firstText(email.textContent, email.errorMessage), 280),
      status: email.status,
      occurredAt: eventTimestamp(email),
    })),
    ...messages.map((message) => ({
      id: 'message-' + message.id,
      channel: readableLabel(message.channel),
      title: readableLabel([message.direction, message.messageType].filter(Boolean).join(' ')),
      body: compactText(firstText(message.bodyText, message.subject, message.errorMessage), 280),
      status: message.status,
      occurredAt: eventTimestamp(message),
    })),
    ...actions.map((action) => ({
      id: 'action-' + action.id,
      channel: readableLabel(action.channel),
      title: readableLabel(action.actionType),
      body: compactText(firstText(action.reason, action.result?.summary, action.result?.outcome, action.errorMessage), 240),
      status: action.status,
      occurredAt: eventTimestamp(action),
    })),
    ...meetings.map((meeting) => ({
      id: 'meeting-' + meeting.id,
      channel: 'Meeting',
      title: meeting.title || readableLabel(meeting.meetingType),
      body: compactText(firstText(meeting.notes, meeting.description, meeting.location), 240),
      status: meeting.status,
      occurredAt: eventTimestamp(meeting),
    })),
  ]
    .filter((event) => event.occurredAt || event.body || event.title)
    .sort((a, b) => new Date(b.occurredAt || 0).getTime() - new Date(a.occurredAt || 0).getTime())
    .slice(0, 20);

  return {
    overview: overview || 'No discussion summary has been captured yet.',
    keyPoints,
    channelCounts,
    timeline,
    totals: {
      conversations: conversations.length,
      messages: messages.length,
      emails: emails.length,
      calls: calls.length,
      actions: actions.length,
      meetings: meetings.length,
    },
  };
}

export async function getLeadConversationSummary(user, leadId) {
  const tenantId = tenantIdFromUser(user);
  const leadRows = await unwrap(
    await insforge.database
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .eq('tenant_id', tenantId)
      .limit(1),
    'Failed to load lead'
  );
  const lead = fromDbRecord(leadRows?.[0]);
  if (!lead) throw new Error('Lead not found');

  const [conversationRows, messageRows, emailRows, callRows, actionRows, meetingRows] = await Promise.all([
    unwrap(
      await insforge.database
        .from('lead_conversations')
        .select('*')
        .eq('lead_id', leadId)
        .eq('tenant_id', tenantId)
        .order('updated_at', { ascending: false })
        .limit(25),
      'Failed to load lead conversations'
    ),
    unwrap(
      await insforge.database
        .from('lead_conversation_messages')
        .select('*')
        .eq('lead_id', leadId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(150),
      'Failed to load lead messages'
    ),
    unwrap(
      await insforge.database
        .from('email_queue')
        .select('*')
        .eq('lead_id', leadId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(50),
      'Failed to load lead emails'
    ),
    unwrap(
      await insforge.database
        .from('voice_call_sessions')
        .select('*')
        .eq('lead_id', leadId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(50),
      'Failed to load lead calls'
    ),
    unwrap(
      await insforge.database
        .from('bob_actions')
        .select('*')
        .eq('lead_id', leadId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(75),
      'Failed to load Bob actions'
    ),
    unwrap(
      await insforge.database
        .from('meetings')
        .select('*')
        .eq('lead_id', leadId)
        .eq('tenant_id', tenantId)
        .order('start_time', { ascending: false })
        .limit(25),
      'Failed to load lead meetings'
    ),
  ]);

  const conversations = fromDbRows(conversationRows || []);
  const messages = fromDbRows(messageRows || []);
  const emails = fromDbRows(emailRows || []);
  const calls = fromDbRows(callRows || []);
  const actions = fromDbRows(actionRows || []);
  const meetings = fromDbRows(meetingRows || []);

  return {
    lead,
    conversations,
    messages,
    emails,
    calls,
    actions,
    meetings,
    summary: buildLeadDiscussionSummary({ lead, conversations, messages, emails, calls, actions, meetings }),
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

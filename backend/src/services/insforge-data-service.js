import { insforgeAdmin, insforgeClientConfig } from './insforge-client.js';

const TABLES = {
  tenants: 'tenants',
  tenantUsers: 'tenant_users',
  tenantAgents: 'tenant_agents',
  tenantPhoneNumbers: 'tenant_phone_numbers',
  tenantEmailIdentities: 'tenant_email_identities',
  tenantBookingIntegrations: 'tenant_booking_integrations',
  agents: 'agents',
  leads: 'leads',
  agentIntegrations: 'agent_integrations',
  bobActions: 'bob_actions',
  leadConversations: 'lead_conversations',
  leadConversationMessages: 'lead_conversation_messages',
  emailQueue: 'email_queue',
  systemConfig: 'system_config',
};

const CAMEL_TO_SNAKE_OVERRIDES = {
  toEmail: 'to_email',
  fromEmail: 'from_email',
  htmlContent: 'html_content',
  textContent: 'text_content',
  emailType: 'email_type',
  errorMessage: 'error_message',
  retryCount: 'retry_count',
  maxRetries: 'max_retries',
  messageId: 'message_id',
  leadId: 'lead_id',
  agentId: 'agent_id',
  conversationId: 'conversation_id',
  actionType: 'action_type',
  scheduledFor: 'scheduled_for',
  executedAt: 'executed_at',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  firstName: 'first_name',
  fullName: 'full_name',
  assignedAgentId: 'assigned_agent_id',
  calendlyAccessToken: 'calendly_access_token',
  connectedAt: 'connected_at',
  scheduledAt: 'scheduled_at',
  meetingScheduled: 'meeting_scheduled',
  trackingId: 'tracking_id',
  qualificationStatus: 'qualification_status',
  qualificationScore: 'qualification_score',
  leadStage: 'lead_stage',
  schedulingState: 'scheduling_state',
  preferredContactChannel: 'preferred_contact_channel',
  preferredMeetingWindow: 'preferred_meeting_window',
  serviceInterest: 'service_interest',
  budgetRange: 'budget_range',
  locationSummary: 'location_summary',
  qualificationNotes: 'qualification_notes',
  automationPaused: 'automation_paused',
  requiresHumanReview: 'requires_human_review',
  escalationReason: 'escalation_reason',
  lastContactedAt: 'last_contacted_at',
  nextContactAt: 'next_contact_at',
  lastUpdatedBy: 'last_updated_by',
  lastOutboundAt: 'last_outbound_at',
  lastInboundAt: 'last_inbound_at',
  lastIntent: 'last_intent',
  lastIntentAt: 'last_intent_at',
  lastSummary: 'last_summary',
  humanReviewRequired: 'human_review_required',
  conversationStatus: 'conversation_status',
  nextAction: 'next_action',
  nextActionAt: 'next_action_at',
  optedOut: 'opted_out',
  messageType: 'message_type',
  bodyText: 'body_text',
  bodyHtml: 'body_html',
  sentAt: 'sent_at',
  deliveredAt: 'delivered_at',
  providerMessageId: 'provider_message_id',
  eventType: 'event_type',
  eventData: 'event_data',
  processingTimeMs: 'processing_time_ms',
  meetingScheduled: 'meeting_scheduled',
  lastMeetingReminderSent: 'last_meeting_reminder_sent',
  feedbackType: 'feedback_type',
  adminResponse: 'admin_response',
  adminRespondedBy: 'admin_responded_by',
  adminRespondedAt: 'admin_responded_at',
  isRead: 'is_read',
  tenantId: 'tenant_id',
  userId: 'user_id',
  legacyAgentId: 'legacy_agent_id',
  defaultTimezone: 'default_timezone',
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
  replyToEmail: 'reply_to_email',
  verifiedStatus: 'verified_status',
  bookingUrl: 'booking_url',
  eventTypeId: 'event_type_id',
  externalAccountId: 'external_account_id',
  encryptedTokens: 'encrypted_tokens',
  defaultMeetingType: 'default_meeting_type',
  assignedTenantAgentId: 'assigned_tenant_agent_id',
};

const SNAKE_TO_CAMEL_OVERRIDES = Object.fromEntries(
  Object.entries(CAMEL_TO_SNAKE_OVERRIDES).map(([camel, snake]) => [snake, camel])
);

function camelToSnake(key) {
  return CAMEL_TO_SNAKE_OVERRIDES[key] || key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function snakeToCamel(key) {
  return SNAKE_TO_CAMEL_OVERRIDES[key] || key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function normalizeValue(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, normalizeValue(nested)]));
  }

  return value;
}

function toDbRecord(record = {}) {
  return Object.fromEntries(
    Object.entries(record)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [camelToSnake(key), normalizeValue(value)])
  );
}

function fromDbRecord(record) {
  if (!record) return record;
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [snakeToCamel(key), value]));
}

function assertReady() {
  if (!insforgeAdmin) {
    throw new Error(
      'InsForge admin client is not configured. Set INSFORGE_API_KEY or link the project with the InsForge CLI so .insforge/project.json is available.'
    );
  }
}

async function unwrap(result, operation) {
  if (result?.error) {
    throw new Error(`${operation} failed: ${result.error.message || result.error}`);
  }

  return result?.data || [];
}

async function select(table, columns = '*') {
  assertReady();
  const result = await insforgeAdmin.database.from(table).select(columns);
  return (await unwrap(result, `select ${table}`)).map(fromDbRecord);
}

async function selectById(table, id) {
  assertReady();
  const result = await insforgeAdmin.database.from(table).select('*').eq('id', id).limit(1);
  const rows = (await unwrap(result, `select ${table} by id`)).map(fromDbRecord);
  return rows[0] || null;
}

async function selectByColumn(table, column, value) {
  assertReady();
  const result = await insforgeAdmin.database.from(table).select('*').eq(column, value);
  return (await unwrap(result, `select ${table} by ${column}`)).map(fromDbRecord);
}

async function selectByColumns(table, filters = {}, columns = '*') {
  assertReady();
  let query = insforgeAdmin.database.from(table).select(columns);

  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }

  const result = await query;
  return (await unwrap(result, `select ${table} by filters`)).map(fromDbRecord);
}

async function insert(table, values) {
  assertReady();
  const records = Array.isArray(values) ? values : [values];
  const result = await insforgeAdmin.database.from(table).insert(records.map(toDbRecord)).select();
  return (await unwrap(result, `insert ${table}`)).map(fromDbRecord);
}

async function updateById(table, id, patch) {
  assertReady();
  const result = await insforgeAdmin.database.from(table).update(toDbRecord(patch)).eq('id', id).select();
  const rows = (await unwrap(result, `update ${table}`)).map(fromDbRecord);
  return rows[0] || null;
}

async function updateByColumn(table, column, value, patch) {
  assertReady();
  const result = await insforgeAdmin.database.from(table).update(toDbRecord(patch)).eq(column, value).select();
  const rows = (await unwrap(result, `update ${table}`)).map(fromDbRecord);
  return rows[0] || null;
}

async function updateByColumns(table, filters = {}, patch) {
  assertReady();
  let query = insforgeAdmin.database.from(table).update(toDbRecord(patch));

  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }

  const result = await query.select();
  return (await unwrap(result, `update ${table} by filters`)).map(fromDbRecord);
}

async function deleteById(table, id) {
  assertReady();
  const result = await insforgeAdmin.database.from(table).delete().eq('id', id);
  await unwrap(result, `delete ${table}`);
}

export const DEFAULT_TENANT_ID = '00000000-0000-4000-8000-000000000001';

export function getTenantIdFromContext(context = {}) {
  if (!context) return DEFAULT_TENANT_ID;
  return context.tenantId || context.tenant?.id || DEFAULT_TENANT_ID;
}

export function applyTenantId(values = {}, context = {}) {
  return {
    ...values,
    tenantId: values.tenantId || getTenantIdFromContext(context),
  };
}

function byCreatedDesc(a, b) {
  return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
}

function byScheduledThenCreated(a, b) {
  const aScheduled = a.scheduledFor ? new Date(a.scheduledFor).getTime() : 0;
  const bScheduled = b.scheduledFor ? new Date(b.scheduledFor).getTime() : 0;
  if (aScheduled !== bScheduled) return aScheduled - bScheduled;
  return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
}

class InsForgeDataService {
  getStatus() {
    return {
      mode: 'insforge-rest',
      ...insforgeClientConfig,
    };
  }

  async getTenantById(tenantId) {
    return selectById(TABLES.tenants, tenantId);
  }

  async getTenantBySlug(slug) {
    if (!slug) return null;
    const rows = await selectByColumn(TABLES.tenants, 'slug', slug);
    return rows[0] || null;
  }

  async listTenants() {
    return select(TABLES.tenants);
  }

  async createTenant(values) {
    const [tenant] = await insert(TABLES.tenants, values);
    return tenant;
  }

  async getDefaultTenant() {
    return this.getTenantById(DEFAULT_TENANT_ID);
  }

  async listTenantUsersByUserId(userId) {
    if (!userId) return [];
    return selectByColumn(TABLES.tenantUsers, 'user_id', userId);
  }

  async listTenantUsersForTenant(tenantId) {
    if (!tenantId) return [];
    return selectByColumn(TABLES.tenantUsers, 'tenant_id', tenantId);
  }

  async createTenantUser(values) {
    const [tenantUser] = await insert(TABLES.tenantUsers, values);
    return tenantUser;
  }

  async getPrimaryTenantUserForUser(userId) {
    const rows = await this.listTenantUsersByUserId(userId);
    return rows.find((row) => row.status === 'active') || rows[0] || null;
  }

  async listTenantAgents(context = {}) {
    const rows = await selectByColumn(TABLES.tenantAgents, 'tenant_id', getTenantIdFromContext(context));
    return rows.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
  }

  async getTenantAgentById(agentId, context = {}) {
    const agent = await selectById(TABLES.tenantAgents, agentId);
    if (!agent) return null;
    return agent.tenantId === getTenantIdFromContext(context) ? agent : null;
  }

  async createTenantAgent(values, context = {}) {
    const [tenantAgent] = await insert(TABLES.tenantAgents, applyTenantId(values, context));
    return tenantAgent;
  }

  async updateTenantAgent(agentId, patch, context = {}) {
    const tenantAgent = await this.getTenantAgentById(agentId, context);
    if (!tenantAgent) return null;
    return updateById(TABLES.tenantAgents, agentId, patch);
  }

  async listTenantPhoneNumbers(context = {}) {
    const rows = await selectByColumn(TABLES.tenantPhoneNumbers, 'tenant_id', getTenantIdFromContext(context));
    return rows.sort(byCreatedDesc);
  }

  async getPrimaryTenantPhoneNumber(context = {}) {
    const rows = await this.listTenantPhoneNumbers(context);
    return rows.find((row) => row.isPrimary && row.status === 'active')
      || rows.find((row) => row.status === 'active')
      || null;
  }

  async getTenantPhoneNumberById(phoneNumberId, context = {}) {
    const phoneNumber = await selectById(TABLES.tenantPhoneNumbers, phoneNumberId);
    if (!phoneNumber) return null;
    return phoneNumber.tenantId === getTenantIdFromContext(context) ? phoneNumber : null;
  }

  async createTenantPhoneNumber(values, context = {}) {
    const [phoneNumber] = await insert(TABLES.tenantPhoneNumbers, applyTenantId(values, context));
    return phoneNumber;
  }

  async updateTenantPhoneNumber(phoneNumberId, patch, context = {}) {
    const phoneNumber = await this.getTenantPhoneNumberById(phoneNumberId, context);
    if (!phoneNumber) return null;
    return updateById(TABLES.tenantPhoneNumbers, phoneNumberId, patch);
  }

  async listTenantEmailIdentities(context = {}) {
    const rows = await selectByColumn(TABLES.tenantEmailIdentities, 'tenant_id', getTenantIdFromContext(context));
    return rows.sort(byCreatedDesc);
  }

  async getTenantEmailIdentityById(identityId, context = {}) {
    const identity = await selectById(TABLES.tenantEmailIdentities, identityId);
    if (!identity) return null;
    return identity.tenantId === getTenantIdFromContext(context) ? identity : null;
  }

  async createTenantEmailIdentity(values, context = {}) {
    const [identity] = await insert(TABLES.tenantEmailIdentities, applyTenantId(values, context));
    return identity;
  }

  async updateTenantEmailIdentity(identityId, patch, context = {}) {
    const identity = await this.getTenantEmailIdentityById(identityId, context);
    if (!identity) return null;
    return updateById(TABLES.tenantEmailIdentities, identityId, patch);
  }

  async listTenantBookingIntegrations(context = {}) {
    const rows = await selectByColumn(TABLES.tenantBookingIntegrations, 'tenant_id', getTenantIdFromContext(context));
    return rows.sort(byCreatedDesc);
  }

  async getTenantBookingIntegrationById(integrationId, context = {}) {
    const integration = await selectById(TABLES.tenantBookingIntegrations, integrationId);
    if (!integration) return null;
    return integration.tenantId === getTenantIdFromContext(context) ? integration : null;
  }

  async createTenantBookingIntegration(values, context = {}) {
    const [integration] = await insert(TABLES.tenantBookingIntegrations, applyTenantId(values, context));
    return integration;
  }

  async updateTenantBookingIntegration(integrationId, patch, context = {}) {
    const integration = await this.getTenantBookingIntegrationById(integrationId, context);
    if (!integration) return null;
    return updateById(TABLES.tenantBookingIntegrations, integrationId, patch);
  }

  async listRecentLeads(limit = 50, context = {}) {
    const tenantId = getTenantIdFromContext(context);
    const rows = await selectByColumn(TABLES.leads, 'tenant_id', tenantId);
    return rows.sort(byCreatedDesc).slice(0, limit);
  }

  async listLeadsForUser(user) {
    const rows = await selectByColumn(TABLES.leads, 'tenant_id', getTenantIdFromContext(user));
    const visibleRows = user?.role === 'admin'
      ? rows
      : rows.filter((row) => row.assignedAgentId === user?.id);

    return visibleRows.sort(byCreatedDesc);
  }

  async listUnassignedLeads() {
    const rows = await selectByColumn(TABLES.leads, 'tenant_id', DEFAULT_TENANT_ID);
    return rows
      .filter((row) => !row.assignedAgentId)
      .sort(byCreatedDesc)
      .map((row) => ({
        id: row.id,
        email: row.email,
        firstName: row.firstName,
        lastName: row.lastName,
        fullName: row.fullName,
        phone: row.phone,
        source: row.source,
        status: row.status,
        priority: row.priority,
        createdAt: row.createdAt,
      }));
  }

  async listUnassignedLeadsForTenant(context = {}) {
    const rows = await selectByColumn(TABLES.leads, 'tenant_id', getTenantIdFromContext(context));
    return rows
      .filter((row) => !row.assignedAgentId)
      .sort(byCreatedDesc)
      .map((row) => ({
        id: row.id,
        email: row.email,
        firstName: row.firstName,
        lastName: row.lastName,
        fullName: row.fullName,
        phone: row.phone,
        source: row.source,
        status: row.status,
        priority: row.priority,
        createdAt: row.createdAt,
      }));
  }

  async getLeadByEmail(email, context = {}) {
    if (!email) return null;
    const rows = await selectByColumns(TABLES.leads, {
      email: email.trim().toLowerCase(),
      tenant_id: getTenantIdFromContext(context),
    });
    return rows[0] || null;
  }

  async getLeadByPhone(phone, context = {}) {
    if (!phone) return null;
    const normalizedPhone = String(phone).trim();
    const tenantId = getTenantIdFromContext(context);
    const rows = await selectByColumns(TABLES.leads, { phone: normalizedPhone, tenant_id: tenantId });
    if (rows[0]) return rows[0];

    const digits = normalizedPhone.replace(/\D/g, '');
    if (!digits) return null;
    const allRows = await selectByColumn(TABLES.leads, 'tenant_id', tenantId);
    return allRows.find((row) => String(row.phone || '').replace(/\D/g, '') === digits) || null;
  }

  async createLead(values, context = {}) {
    const [lead] = await insert(TABLES.leads, applyTenantId(values, context));
    return lead;
  }

  async getAgentByEmail(email, context = null) {
    if (!email) return null;
    const rows = context
      ? await selectByColumn(TABLES.agents, 'tenant_id', getTenantIdFromContext(context))
      : await select(TABLES.agents);
    return rows.find((row) => row.email?.toLowerCase() === email.toLowerCase()) || null;
  }

  async getAgentById(agentId) {
    return selectById(TABLES.agents, agentId);
  }

  async listAvailableAgents(context = {}) {
    const rows = await selectByColumn(TABLES.agents, 'tenant_id', getTenantIdFromContext(context));
    return rows
      .filter((row) => row.isActive && row.emailVerified && row.role === 'agent')
      .sort((a, b) => {
        const first = (a.firstName || '').localeCompare(b.firstName || '');
        if (first !== 0) return first;
        return (a.lastName || '').localeCompare(b.lastName || '');
      })
      .map((row) => ({
        id: row.id,
        agentId: row.agentId,
        email: row.email,
        firstName: row.firstName,
        lastName: row.lastName,
        fullName: row.fullName,
        role: row.role,
        isActive: row.isActive,
        lastLogin: row.lastLogin,
      }));
  }

  async createAgent(values, context = {}) {
    const [agent] = await insert(TABLES.agents, applyTenantId(values, context));
    return agent;
  }

  async updateAgent(agentId, patch) {
    return updateById(TABLES.agents, agentId, patch);
  }

  async deleteAgent(agentId) {
    await deleteById(TABLES.agents, agentId);
  }

  async getLeadById(leadId, context = {}) {
    const lead = await selectById(TABLES.leads, leadId);
    if (!lead) return null;
    return lead.tenantId === getTenantIdFromContext(context) ? lead : null;
  }

  async updateLead(leadId, patch, context = {}) {
    const lead = await this.getLeadById(leadId, context);
    if (!lead) return null;
    return updateById(TABLES.leads, leadId, patch);
  }

  async updateLeads(leadIds, patch, context = {}) {
    const uniqueLeadIds = [...new Set((leadIds || []).filter(Boolean))];
    return Promise.all(uniqueLeadIds.map((leadId) => this.updateLead(leadId, patch, context)));
  }

  async listAgents() {
    return select(TABLES.agents);
  }

  async listAdminAgents(context = {}) {
    const rows = await selectByColumn(TABLES.agents, 'tenant_id', getTenantIdFromContext(context));
    return rows
      .filter((row) => ['agent', 'admin'].includes(row.role) && row.isActive)
      .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
  }

  async getAgentIntegration(agentId) {
    const rows = await selectByColumn(TABLES.agentIntegrations, 'agent_id', agentId);
    return rows[0] || null;
  }

  async upsertAgentIntegration(agentId, patch, context = {}) {
    const existing = await this.getAgentIntegration(agentId);
    const values = {
      ...patch,
      connectedAt: new Date(),
    };

    if (existing) {
      return updateById(TABLES.agentIntegrations, existing.id, values);
    }

    const [created] = await insert(TABLES.agentIntegrations, {
      agentId,
      tenantId: getTenantIdFromContext(context),
      ...values,
    });
    return created;
  }

  async getLatestConversationForLead(leadId, context = {}) {
    const rows = await selectByColumn(TABLES.leadConversations, 'tenant_id', getTenantIdFromContext(context));
    return rows.filter((row) => row.leadId === leadId).sort(byCreatedDesc)[0] || null;
  }

  async listLeadConversations(context = {}) {
    return selectByColumn(TABLES.leadConversations, 'tenant_id', getTenantIdFromContext(context));
  }

  async listConversationMessages(conversationId, limit = 100, context = {}) {
    if (!conversationId) return [];
    const rows = await selectByColumns(TABLES.leadConversationMessages, {
      conversation_id: conversationId,
      tenant_id: getTenantIdFromContext(context),
    });
    return rows
      .sort((a, b) => new Date(a.createdAt || a.sentAt || 0).getTime() - new Date(b.createdAt || b.sentAt || 0).getTime())
      .slice(-limit);
  }

  async getConversationById(conversationId, context = {}) {
    const conversation = await selectById(TABLES.leadConversations, conversationId);
    if (!conversation) return null;
    return conversation.tenantId === getTenantIdFromContext(context) ? conversation : null;
  }

  async createConversation(values, context = {}) {
    const [conversation] = await insert(TABLES.leadConversations, applyTenantId(values, context));
    return conversation;
  }

  async updateConversation(conversationId, patch, context = {}) {
    const conversation = await this.getConversationById(conversationId, context);
    if (!conversation) return null;
    return updateById(TABLES.leadConversations, conversationId, patch);
  }

  async updateConversationsForLead(leadId, patch) {
    const rows = await selectByColumn(TABLES.leadConversations, 'lead_id', leadId);
    return Promise.all(rows.map((conversation) => updateById(TABLES.leadConversations, conversation.id, patch)));
  }

  async createConversationMessage(values, context = {}) {
    const [message] = await insert(TABLES.leadConversationMessages, applyTenantId(values, context));
    return message;
  }

  async updateConversationMessage(messageId, patch) {
    return updateById(TABLES.leadConversationMessages, messageId, patch);
  }

  async getLatestOpenBobAction(leadId) {
    const openStatuses = new Set(['pending', 'deferred', 'awaiting_call', 'processing']);
    const rows = await select(TABLES.bobActions);
    return rows
      .filter((row) => row.leadId === leadId && openStatuses.has(row.status))
      .sort(byCreatedDesc)[0] || null;
  }

  async createBobAction(values, context = {}) {
    const [action] = await insert(TABLES.bobActions, applyTenantId(values, context));
    return action;
  }

  async getBobActionById(actionId, context = {}) {
    const action = await selectById(TABLES.bobActions, actionId);
    if (!action) return null;
    return action.tenantId === getTenantIdFromContext(context) ? action : null;
  }

  async listBobActions(limit = 50, context = {}) {
    const rows = await selectByColumn(TABLES.bobActions, 'tenant_id', getTenantIdFromContext(context));
    return rows.sort(byCreatedDesc).slice(0, limit);
  }

  async updateBobAction(actionId, patch) {
    return updateById(TABLES.bobActions, actionId, patch);
  }

  async createLeadProcessingLog(values, context = {}) {
    const [log] = await insert('lead_processing_logs', applyTenantId(values, context));
    return log;
  }

  async cancelPendingEmailQueueForLead(leadId, patch = {}, context = {}) {
    return updateByColumns(TABLES.emailQueue, {
      lead_id: leadId,
      status: 'pending',
      tenant_id: getTenantIdFromContext(context),
    }, patch);
  }

  async cancelPendingWorkflowAutomationForLead(leadId, patch = {}, context = {}) {
    return updateByColumns('workflow_automation', {
      lead_id: leadId,
      status: 'pending',
      tenant_id: getTenantIdFromContext(context),
    }, patch);
  }

  async listFeedback(context = {}) {
    const rows = await selectByColumn('agent_feedback', 'tenant_id', getTenantIdFromContext(context));
    return rows.sort(byCreatedDesc);
  }

  async getFeedbackById(feedbackId, context = {}) {
    const feedback = await selectById('agent_feedback', feedbackId);
    if (!feedback) return null;
    return feedback.tenantId === getTenantIdFromContext(context) ? feedback : null;
  }

  async createFeedback(values, context = {}) {
    const [feedback] = await insert('agent_feedback', applyTenantId(values, context));
    return feedback;
  }

  async updateFeedback(feedbackId, patch, context = {}) {
    const feedback = await this.getFeedbackById(feedbackId, context);
    if (!feedback) return null;
    return updateById('agent_feedback', feedbackId, patch);
  }

  async deleteFeedback(feedbackId, context = {}) {
    const feedback = await this.getFeedbackById(feedbackId, context);
    if (!feedback) return null;
    await deleteById('agent_feedback', feedbackId);
    return feedback;
  }

  async getDueBobActions(limit = 20, now = new Date()) {
    const dueTime = now.getTime();
    const statuses = new Set(['pending', 'deferred']);
    const rows = await select(TABLES.bobActions);
    return rows
      .filter((row) => statuses.has(row.status))
      .filter((row) => !row.scheduledFor || new Date(row.scheduledFor).getTime() <= dueTime)
      .sort(byScheduledThenCreated)
      .slice(0, limit);
  }

  async getQueuedCallActions(limit = 20, now = new Date()) {
    const dueTime = now.getTime();
    const rows = await select(TABLES.bobActions);
    return rows
      .filter((row) => row.actionType === 'queue_call_attempt' && row.status === 'awaiting_call')
      .filter((row) => !row.scheduledFor || new Date(row.scheduledFor).getTime() <= dueTime)
      .sort(byScheduledThenCreated)
      .slice(0, limit);
  }

  async getActiveVoiceCallActions() {
    const rows = await select(TABLES.bobActions);
    return rows.filter((row) => row.actionType === 'queue_call_attempt' && row.status === 'calling');
  }

  async createEmailQueue(values, context = {}) {
    const [queuedEmail] = await insert(TABLES.emailQueue, applyTenantId(values, context));
    return queuedEmail;
  }

  async updateEmailQueue(emailId, patch) {
    return updateById(TABLES.emailQueue, emailId, patch);
  }

  async getDueScheduledEmails(limit = 10, now = new Date()) {
    const dueTime = now.getTime();
    const rows = await select(TABLES.emailQueue);
    return rows
      .filter((row) => row.status === 'scheduled')
      .filter((row) => row.scheduledFor && new Date(row.scheduledFor).getTime() <= dueTime)
      .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())
      .slice(0, limit);
  }

  async getSystemConfig(key) {
    const rows = await select(TABLES.systemConfig);
    return rows.find((row) => row.key === key) || null;
  }

  async upsertSystemConfig(key, value, description = null) {
    const existing = await this.getSystemConfig(key);
    if (existing) {
      return updateByColumn(TABLES.systemConfig, 'key', key, {
        value,
        updatedAt: new Date(),
      });
    }

    const [created] = await insert(TABLES.systemConfig, {
      key,
      value,
      description,
    });
    return created;
  }
}

const insforgeDataService = new InsForgeDataService();
export default insforgeDataService;
export { InsForgeDataService, camelToSnake, snakeToCamel, toDbRecord, fromDbRecord };

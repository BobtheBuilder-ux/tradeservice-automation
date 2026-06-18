import { insforgeAdmin, insforgeClientConfig } from './insforge-client.js';

const TABLES = {
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

async function deleteById(table, id) {
  assertReady();
  const result = await insforgeAdmin.database.from(table).delete().eq('id', id);
  await unwrap(result, `delete ${table}`);
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

  async listRecentLeads(limit = 50) {
    const rows = await select(TABLES.leads);
    return rows.sort(byCreatedDesc).slice(0, limit);
  }

  async listLeadsForUser(user) {
    const rows = await select(TABLES.leads);
    const visibleRows = user?.role === 'admin'
      ? rows
      : rows.filter((row) => row.assignedAgentId === user?.id);

    return visibleRows.sort(byCreatedDesc);
  }

  async listUnassignedLeads() {
    const rows = await select(TABLES.leads);
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

  async getLeadByEmail(email) {
    if (!email) return null;
    const rows = await selectByColumn(TABLES.leads, 'email', email.trim().toLowerCase());
    return rows[0] || null;
  }

  async getLeadByPhone(phone) {
    if (!phone) return null;
    const normalizedPhone = String(phone).trim();
    const rows = await selectByColumn(TABLES.leads, 'phone', normalizedPhone);
    if (rows[0]) return rows[0];

    const digits = normalizedPhone.replace(/\D/g, '');
    if (!digits) return null;
    const allRows = await select(TABLES.leads);
    return allRows.find((row) => String(row.phone || '').replace(/\D/g, '') === digits) || null;
  }

  async createLead(values) {
    const [lead] = await insert(TABLES.leads, values);
    return lead;
  }

  async getAgentByEmail(email) {
    if (!email) return null;
    const rows = await select(TABLES.agents);
    return rows.find((row) => row.email?.toLowerCase() === email.toLowerCase()) || null;
  }

  async getAgentById(agentId) {
    return selectById(TABLES.agents, agentId);
  }

  async listAvailableAgents() {
    const rows = await select(TABLES.agents);
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

  async createAgent(values) {
    const [agent] = await insert(TABLES.agents, values);
    return agent;
  }

  async updateAgent(agentId, patch) {
    return updateById(TABLES.agents, agentId, patch);
  }

  async deleteAgent(agentId) {
    await deleteById(TABLES.agents, agentId);
  }

  async getLeadById(leadId) {
    return selectById(TABLES.leads, leadId);
  }

  async updateLead(leadId, patch) {
    return updateById(TABLES.leads, leadId, patch);
  }

  async updateLeads(leadIds, patch) {
    const uniqueLeadIds = [...new Set((leadIds || []).filter(Boolean))];
    return Promise.all(uniqueLeadIds.map((leadId) => this.updateLead(leadId, patch)));
  }

  async listAgents() {
    return select(TABLES.agents);
  }

  async listAdminAgents() {
    const rows = await select(TABLES.agents);
    return rows
      .filter((row) => ['agent', 'admin'].includes(row.role) && row.isActive)
      .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
  }

  async getAgentIntegration(agentId) {
    const rows = await selectByColumn(TABLES.agentIntegrations, 'agent_id', agentId);
    return rows[0] || null;
  }

  async upsertAgentIntegration(agentId, patch) {
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
      ...values,
    });
    return created;
  }

  async getLatestConversationForLead(leadId) {
    const rows = await select(TABLES.leadConversations);
    return rows.filter((row) => row.leadId === leadId).sort(byCreatedDesc)[0] || null;
  }

  async listLeadConversations() {
    return select(TABLES.leadConversations);
  }

  async getConversationById(conversationId) {
    return selectById(TABLES.leadConversations, conversationId);
  }

  async createConversation(values) {
    const [conversation] = await insert(TABLES.leadConversations, values);
    return conversation;
  }

  async updateConversation(conversationId, patch) {
    return updateById(TABLES.leadConversations, conversationId, patch);
  }

  async updateConversationsForLead(leadId, patch) {
    const rows = await selectByColumn(TABLES.leadConversations, 'lead_id', leadId);
    return Promise.all(rows.map((conversation) => updateById(TABLES.leadConversations, conversation.id, patch)));
  }

  async createConversationMessage(values) {
    const [message] = await insert(TABLES.leadConversationMessages, values);
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

  async createBobAction(values) {
    const [action] = await insert(TABLES.bobActions, values);
    return action;
  }

  async getBobActionById(actionId) {
    return selectById(TABLES.bobActions, actionId);
  }

  async listBobActions(limit = 50) {
    const rows = await select(TABLES.bobActions);
    return rows.sort(byCreatedDesc).slice(0, limit);
  }

  async updateBobAction(actionId, patch) {
    return updateById(TABLES.bobActions, actionId, patch);
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

  async createEmailQueue(values) {
    const [queuedEmail] = await insert(TABLES.emailQueue, values);
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

import insforgeDataService, { getTenantIdFromContext } from './insforge-data-service.js';

export const TENANT_AGENT_STATUSES = ['draft', 'testing', 'live', 'paused', 'archived'];
export const BOOKING_PROVIDERS = ['calendly', 'google_calendar', 'zoom', 'manual'];
export const BOOKING_STATUSES = ['disconnected', 'connected', 'needs_attention'];
export const MEETING_TYPES = ['zoom', 'google_meet', 'phone', 'in_person'];
export const EMAIL_PROVIDERS = ['platform', 'resend', 'sendgrid', 'smtp'];
export const EMAIL_VERIFICATION_STATUSES = ['unverified', 'pending', 'verified', 'failed'];

const DEFAULT_AGENT_NAME = 'Bob';
const DEFAULT_TEMPLATE_KEY = 'bob-default';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function requireAllowed(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function safeMetadata(metadata) {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
}

export function validateTenantAgentInput(input = {}, options = {}) {
  const displayName = cleanText(input.displayName);
  if (options.requireName !== false && !displayName) {
    const error = new Error('Agent name is required');
    error.statusCode = 400;
    throw error;
  }

  const status = input.status ? requireAllowed(input.status, TENANT_AGENT_STATUSES, null) : undefined;
  if (input.status && !status) {
    const error = new Error('Invalid agent status');
    error.statusCode = 400;
    throw error;
  }

  return {
    ...(displayName ? { displayName } : {}),
    ...(cleanText(input.templateKey) ? { templateKey: cleanText(input.templateKey) } : {}),
    ...(cleanText(input.voiceId) ? { voiceId: cleanText(input.voiceId) } : {}),
    ...(cleanText(input.promptVersion) ? { promptVersion: cleanText(input.promptVersion) } : {}),
    ...(status ? { status } : {}),
    metadata: safeMetadata(input.metadata),
  };
}

export function validateEmailIdentityInput(input = {}) {
  const fromName = cleanText(input.fromName);
  const fromEmail = cleanText(input.fromEmail)?.toLowerCase();
  const replyToEmail = cleanText(input.replyToEmail)?.toLowerCase() || null;

  if (!fromName) {
    const error = new Error('Sender name is required');
    error.statusCode = 400;
    throw error;
  }

  if (!fromEmail || !EMAIL_RE.test(fromEmail)) {
    const error = new Error('A valid sender email is required');
    error.statusCode = 400;
    throw error;
  }

  if (replyToEmail && !EMAIL_RE.test(replyToEmail)) {
    const error = new Error('Reply-to email must be valid');
    error.statusCode = 400;
    throw error;
  }

  return {
    fromName,
    fromEmail,
    replyToEmail,
    provider: requireAllowed(input.provider, EMAIL_PROVIDERS, 'platform'),
    verifiedStatus: requireAllowed(input.verifiedStatus, EMAIL_VERIFICATION_STATUSES, 'unverified'),
    status: input.status === 'disabled' ? 'disabled' : 'active',
    metadata: safeMetadata(input.metadata),
  };
}

export function validateBookingIntegrationInput(input = {}) {
  const provider = requireAllowed(input.provider, BOOKING_PROVIDERS, 'manual');
  const bookingUrl = cleanText(input.bookingUrl);
  const eventTypeId = cleanText(input.eventTypeId);

  if (provider === 'manual' && !bookingUrl) {
    const error = new Error('Manual booking requires a booking URL');
    error.statusCode = 400;
    throw error;
  }

  if (provider === 'calendly' && !bookingUrl && !eventTypeId) {
    const error = new Error('Calendly setup requires a booking URL or event type ID');
    error.statusCode = 400;
    throw error;
  }

  return {
    provider,
    status: requireAllowed(input.status, BOOKING_STATUSES, bookingUrl || eventTypeId ? 'connected' : 'disconnected'),
    bookingUrl,
    eventTypeId,
    externalAccountId: cleanText(input.externalAccountId),
    defaultMeetingType: requireAllowed(input.defaultMeetingType, MEETING_TYPES, 'phone'),
    metadata: safeMetadata(input.metadata),
  };
}

function primaryActive(rows = []) {
  return rows.find((row) => row.status === 'active' || row.status === 'connected') || rows[0] || null;
}

class TenantIdentityService {
  async ensureDefaultTenantAgent(context = {}) {
    const tenantId = getTenantIdFromContext(context);
    const existing = (await insforgeDataService.listTenantAgents(context))
      .find((agent) => agent.templateKey === DEFAULT_TEMPLATE_KEY && agent.status !== 'archived');

    if (existing) return existing;

    return insforgeDataService.createTenantAgent({
      tenantId,
      createdByUserId: context.authUserId || context.userId || null,
      displayName: DEFAULT_AGENT_NAME,
      templateKey: DEFAULT_TEMPLATE_KEY,
      promptVersion: 'v1',
      status: 'draft',
      metadata: { source: 'phase2_default_agent' },
      createdAt: new Date(),
      updatedAt: new Date(),
    }, context);
  }

  async listAgents(context = {}) {
    await this.ensureDefaultTenantAgent(context);
    return insforgeDataService.listTenantAgents(context);
  }

  async createAgent(input = {}, context = {}) {
    const values = validateTenantAgentInput(input);
    return insforgeDataService.createTenantAgent({
      displayName: values.displayName,
      templateKey: values.templateKey || DEFAULT_TEMPLATE_KEY,
      voiceId: values.voiceId || null,
      promptVersion: values.promptVersion || 'v1',
      status: values.status || 'draft',
      createdByUserId: context.authUserId || context.userId || null,
      metadata: values.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    }, context);
  }

  async updateAgent(agentId, input = {}, context = {}) {
    const values = validateTenantAgentInput(input, { requireName: false });
    return insforgeDataService.updateTenantAgent(agentId, {
      ...values,
      updatedAt: new Date(),
    }, context);
  }

  async archiveAgent(agentId, context = {}) {
    return insforgeDataService.updateTenantAgent(agentId, {
      status: 'archived',
      updatedAt: new Date(),
    }, context);
  }

  async assignLeadToAgent(leadId, tenantAgentId, context = {}) {
    const [lead, tenantAgent] = await Promise.all([
      insforgeDataService.getLeadById(leadId, context),
      insforgeDataService.getTenantAgentById(tenantAgentId, context),
    ]);

    if (!lead) {
      const error = new Error('Lead not found');
      error.statusCode = 404;
      throw error;
    }

    if (!tenantAgent || tenantAgent.status === 'archived') {
      const error = new Error('AI agent not found');
      error.statusCode = 404;
      throw error;
    }

    return insforgeDataService.updateLead(leadId, {
      assignedTenantAgentId: tenantAgent.id,
      updatedAt: new Date(),
    }, context);
  }

  async upsertEmailIdentity(input = {}, context = {}) {
    const values = validateEmailIdentityInput(input);
    const existing = primaryActive(await insforgeDataService.listTenantEmailIdentities(context));

    if (existing) {
      return insforgeDataService.updateTenantEmailIdentity(existing.id, {
        ...values,
        updatedAt: new Date(),
      }, context);
    }

    return insforgeDataService.createTenantEmailIdentity({
      ...values,
      createdAt: new Date(),
      updatedAt: new Date(),
    }, context);
  }

  async upsertBookingIntegration(input = {}, context = {}) {
    const values = validateBookingIntegrationInput(input);
    const existing = primaryActive(await insforgeDataService.listTenantBookingIntegrations(context));

    if (existing) {
      return insforgeDataService.updateTenantBookingIntegration(existing.id, {
        ...values,
        updatedAt: new Date(),
      }, context);
    }

    return insforgeDataService.createTenantBookingIntegration({
      ...values,
      createdAt: new Date(),
      updatedAt: new Date(),
    }, context);
  }

  async getSettingsSummary(context = {}) {
    const [tenant, agents, emailIdentities, bookingIntegrations] = await Promise.all([
      insforgeDataService.getTenantById(getTenantIdFromContext(context)),
      this.listAgents(context),
      insforgeDataService.listTenantEmailIdentities(context),
      insforgeDataService.listTenantBookingIntegrations(context),
    ]);

    return {
      tenant,
      agents,
      emailIdentity: primaryActive(emailIdentities),
      bookingIntegration: primaryActive(bookingIntegrations),
    };
  }
}

const tenantIdentityService = new TenantIdentityService();
export default tenantIdentityService;

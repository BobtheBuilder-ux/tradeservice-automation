import logger from '../utils/logger.js';
import insforgeDataService from './insforge-data-service.js';

class LeadConversationService {
  async ensurePrimaryConversation(lead, channel = 'email') {
    const existing = await insforgeDataService.getLatestConversationForLead(lead.id);

    if (existing) {
      return existing;
    }

    const conversation = await insforgeDataService.createConversation({
      leadId: lead.id,
      channel,
      status: 'active',
      conversationStatus: 'active_nurture',
      metadata: {
        source: lead.source || 'unknown',
        bootstrap: 'bob_phase_1',
        outboundCount: 0,
        callQueueCount: 0,
      },
    });

    return conversation;
  }

  async updateConversation(conversationId, patch = {}) {
    return insforgeDataService.updateConversation(conversationId, {
      ...patch,
      updatedAt: new Date(),
    });
  }

  async logMessage({
    leadId,
    conversationId,
    direction,
    channel = 'email',
    messageType = 'email',
    subject = null,
    bodyText = null,
    bodyHtml = null,
    status = 'logged',
    sentAt = null,
    deliveredAt = null,
    providerMessageId = null,
    errorMessage = null,
    metadata = {},
  }) {
    const message = await insforgeDataService.createConversationMessage({
      leadId,
      conversationId,
      direction,
      channel,
      messageType,
      subject,
      bodyText,
      bodyHtml,
      status,
      sentAt,
      deliveredAt,
      providerMessageId,
      errorMessage,
      metadata,
    });

    return message;
  }

  async logQueuedOutboundEmail({ lead, subject, bodyText, bodyHtml, metadata = {} }) {
    const conversation = await this.ensurePrimaryConversation(lead, 'email');
    const existingMetadata = conversation.metadata || {};
    const outboundCount = Number(existingMetadata.outboundCount || 0) + 1;
    const queuedAt = new Date();

    const message = await this.logMessage({
      leadId: lead.id,
      conversationId: conversation.id,
      direction: 'outbound',
      channel: 'email',
      messageType: 'email',
      subject,
      bodyText,
      bodyHtml,
      status: 'queued',
      metadata,
    });

    const updatedConversation = await this.updateConversation(conversation.id, {
      lastOutboundAt: queuedAt,
      conversationStatus: metadata.conversationStatus || 'awaiting_reply',
      lastIntent: metadata.lastIntent || conversation.lastIntent || null,
      lastSummary: `Queued outbound email: ${subject}`,
      metadata: {
        ...existingMetadata,
        outboundCount,
        lastOutboundActionType: metadata.actionType || metadata.template || 'email',
        lastOutboundSubject: subject,
        lastQueuedEmailAt: queuedAt.toISOString(),
        lastConversationMessageId: message.id,
      },
    });

    return { conversation: updatedConversation, message, outboundCount };
  }

  async markMessageStatus(messageId, status, patch = {}) {
    return insforgeDataService.updateConversationMessage(messageId, {
      status,
      ...patch,
    });
  }

  async markEmailSent({ messageId, providerMessageId, sentAt = new Date() }) {
    return this.markMessageStatus(messageId, 'sent', {
      providerMessageId,
      sentAt,
    });
  }

  async markEmailFailed({ messageId, errorMessage }) {
    return this.markMessageStatus(messageId, 'failed', {
      errorMessage,
    });
  }

  async logSystemEvent({ lead, conversationId, channel = 'system', messageType = 'system_note', subject, bodyText, metadata = {} }) {
    const conversation = conversationId
      ? await insforgeDataService.getConversationById(conversationId)
      : await this.ensurePrimaryConversation(lead, channel === 'phone' ? 'phone' : 'email');

    const message = await this.logMessage({
      leadId: lead.id,
      conversationId: conversation.id,
      direction: 'system',
      channel,
      messageType,
      subject,
      bodyText,
      status: 'logged',
      metadata,
    });

    await this.updateConversation(conversation.id, {
      conversationStatus: metadata.conversationStatus || conversation.conversationStatus || 'active_nurture',
      lastIntent: metadata.lastIntent || conversation.lastIntent || null,
      lastIntentAt: metadata.lastIntent ? new Date() : conversation.lastIntentAt || null,
      humanReviewRequired: metadata.humanReviewRequired ?? conversation.humanReviewRequired ?? false,
      lastSummary: bodyText || subject,
      metadata: {
        ...(conversation?.metadata || {}),
      },
    });

    logger.info('Conversation system event logged', {
      leadId: lead.id,
      conversationId: conversation.id,
      messageId: message.id,
      channel,
      messageType,
    });

    return { conversationId: conversation.id, message };
  }
}

const leadConversationService = new LeadConversationService();
export default leadConversationService;
export { LeadConversationService };

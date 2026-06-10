import { desc, eq } from 'drizzle-orm';
import { db } from '../config/index.js';
import { leadConversationMessages, leadConversations } from '../db/schema.js';
import logger from '../utils/logger.js';

class LeadConversationService {
  async ensurePrimaryConversation(lead, channel = 'email') {
    const existing = await db
      .select()
      .from(leadConversations)
      .where(eq(leadConversations.leadId, lead.id))
      .orderBy(desc(leadConversations.createdAt))
      .limit(1);

    if (existing[0]) {
      return existing[0];
    }

    const [conversation] = await db
      .insert(leadConversations)
      .values({
        leadId: lead.id,
        channel,
        status: 'active',
        metadata: {
          source: lead.source || 'unknown',
          bootstrap: 'bob_phase_1',
          outboundCount: 0,
          callQueueCount: 0,
        },
      })
      .returning();

    return conversation;
  }

  async updateConversation(conversationId, patch = {}) {
    const [updated] = await db
      .update(leadConversations)
      .set({
        ...patch,
        updatedAt: new Date(),
      })
      .where(eq(leadConversations.id, conversationId))
      .returning();

    return updated;
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
    const [message] = await db
      .insert(leadConversationMessages)
      .values({
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
      })
      .returning();

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
    const [updated] = await db
      .update(leadConversationMessages)
      .set({
        status,
        ...patch,
      })
      .where(eq(leadConversationMessages.id, messageId))
      .returning();

    return updated;
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
      ? (await db
          .select()
          .from(leadConversations)
          .where(eq(leadConversations.id, conversationId))
          .limit(1))[0]
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

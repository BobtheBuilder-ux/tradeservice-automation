/**
 * Email Queue Processor
 * Processes scheduled emails from the email_queue table
 */

import EmailService from './email-service.js';
import leadConversationService from './lead-conversation-service.js';
import logger from '../utils/logger.js';
import insforgeDataService from './insforge-data-service.js';
import dotenv from 'dotenv';

dotenv.config();

class EmailQueueProcessor {
  constructor() {
    this.isRunning = false;
    this.processingInterval = null;
    this.batchSize = 10;
    this.processingDelay = 30000; // 30 seconds between batches
  }

  async start() {
    if (this.isRunning) {
      console.log('📧 Email queue processor is already running');
      return;
    }

    this.isRunning = true;
    console.log('📧 Starting email queue processor...');
    console.log(`   - Batch size: ${this.batchSize}`);
    console.log(`   - Processing interval: ${this.processingDelay}ms`);

    this.processingInterval = setInterval(async () => {
      try {
        await this.processBatch();
      } catch (error) {
        console.error('❌ Email queue processor error:', error.message);
        logger.error('Email queue processor error', {
          error: error.message,
          stack: error.stack,
        });
      }
    }, this.processingDelay);

    console.log('✅ Email queue processor started successfully');
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    console.log('🛑 Email queue processor stopped');
  }

  async processBatch() {
    const emails = await insforgeDataService.getDueScheduledEmails(this.batchSize, new Date());

    if (emails.length === 0) {
      return [];
    }

    console.log(`📧 Processing ${emails.length} scheduled emails...`);
    const results = [];
    for (const email of emails) {
      results.push(await this.processEmail(email));
    }

    return results;
  }

  async updateConversationLogFromQueue(email, statusPatch) {
    const conversationMessageId = email.metadata?.conversationMessageId;
    if (!conversationMessageId) {
      return null;
    }

    if (statusPatch.status === 'sent') {
      return leadConversationService.markEmailSent({
        messageId: conversationMessageId,
        providerMessageId: statusPatch.messageId,
        sentAt: statusPatch.sentAt,
      });
    }

    if (statusPatch.status === 'failed') {
      return leadConversationService.markEmailFailed({
        messageId: conversationMessageId,
        errorMessage: statusPatch.errorMessage,
      });
    }

    return leadConversationService.markMessageStatus(conversationMessageId, statusPatch.status, statusPatch.extra || {});
  }

  async updateBobActionFromQueue(email, statusPatch) {
    const bobActionId = email.metadata?.bobActionId;
    if (!bobActionId) {
      return null;
    }

    const patch = {
      updatedAt: new Date(),
    };

    if (statusPatch.status === 'sent') {
      patch.result = {
        queueId: email.id,
        queueStatus: 'sent',
        messageId: statusPatch.messageId,
        conversationMessageId: email.metadata?.conversationMessageId || null,
        sentAt: statusPatch.sentAt?.toISOString?.() || new Date().toISOString(),
      };
    }

    if (statusPatch.status === 'failed') {
      patch.result = {
        queueId: email.id,
        queueStatus: 'failed',
        conversationMessageId: email.metadata?.conversationMessageId || null,
        errorMessage: statusPatch.errorMessage,
      };
    }

    await insforgeDataService.updateBobAction(bobActionId, patch);
  }

  async processEmail(email) {
    try {
      console.log(`📤 Sending email to ${email.toEmail}...`);
      await this.updateEmailStatus(email.id, 'sending');

      if (email.metadata?.conversationMessageId) {
        await this.updateConversationLogFromQueue(email, { status: 'sending' });
      }

      const result = await EmailService.sendEmail({
        to: email.toEmail,
        subject: email.subject,
        html: email.htmlContent || email.textContent,
        text: email.textContent || email.htmlContent?.replace(/<[^>]*>/g, ''),
      });

      if (!result.success) {
        throw new Error(result.error || 'Email sending failed');
      }

      const sentAt = new Date();
      await this.updateEmailStatus(email.id, 'sent', {
        sentAt,
        messageId: result.messageId,
      });
      await this.updateConversationLogFromQueue(email, {
        status: 'sent',
        sentAt,
        messageId: result.messageId,
      });
      await this.updateBobActionFromQueue(email, {
        status: 'sent',
        sentAt,
        messageId: result.messageId,
      });

      console.log(`✅ Email sent successfully to ${email.toEmail} (ID: ${result.messageId})`);
      return { success: true, emailId: email.id, messageId: result.messageId };
    } catch (error) {
      console.error(`❌ Failed to send email to ${email.toEmail}:`, error.message);

      const newRetryCount = (email.retryCount || 0) + 1;
      const maxRetries = email.maxRetries || 3;

      if (newRetryCount >= maxRetries) {
        await this.updateEmailStatus(email.id, 'failed', {
          errorMessage: error.message,
          retryCount: newRetryCount,
        });
        await this.updateConversationLogFromQueue(email, {
          status: 'failed',
          errorMessage: error.message,
        });
        await this.updateBobActionFromQueue(email, {
          status: 'failed',
          errorMessage: error.message,
        });
        console.log(`❌ Email to ${email.toEmail} marked as failed after ${newRetryCount} attempts`);
      } else {
        await this.updateEmailStatus(email.id, 'scheduled', {
          errorMessage: error.message,
          retryCount: newRetryCount,
          scheduledFor: new Date(Date.now() + newRetryCount * 60000),
        });
        await this.updateConversationLogFromQueue(email, {
          status: 'queued',
          extra: { errorMessage: error.message },
        });
        console.log(`🔄 Email to ${email.toEmail} scheduled for retry ${newRetryCount}/${maxRetries}`);
      }

      return { success: false, emailId: email.id, error: error.message };
    }
  }

  async updateEmailStatus(emailId, status, additionalFields = {}) {
    const updateData = {
      status,
      updatedAt: new Date(),
      ...additionalFields,
    };

    await insforgeDataService.updateEmailQueue(emailId, updateData);
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      batchSize: this.batchSize,
      processingDelay: this.processingDelay,
    };
  }
}

const emailQueueProcessor = new EmailQueueProcessor();
export default emailQueueProcessor;

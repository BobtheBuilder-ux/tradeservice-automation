/**
 * Email Queue Processor
 * Processes scheduled emails from the email_queue table
 */

import { db } from '../db/connection.js';
import { emailQueue } from '../db/schema.js';
import { eq, and, lte, or, asc } from 'drizzle-orm';
import EmailService from './email-service.js';
import logger from '../utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

class EmailQueueProcessor {
  constructor() {
    this.isRunning = false;
    this.processingInterval = null;
    this.batchSize = 10;
    this.processingDelay = 30000; // 30 seconds between batches
  }

  /**
   * Start the email queue processor
   */
  async start() {
    if (this.isRunning) {
      console.log('📧 Email queue processor is already running');
      return;
    }

    this.isRunning = true;
    console.log('📧 Starting email queue processor...');
    console.log(`   - Batch size: ${this.batchSize}`);
    console.log(`   - Processing interval: ${this.processingDelay}ms`);

    // Start processing loop
    this.processingInterval = setInterval(async () => {
      try {
        await this.processBatch();
      } catch (error) {
        console.error('❌ Email queue processor error:', error.message);
        logger.error('Email queue processor error', {
          error: error.message,
          stack: error.stack
        });
      }
    }, this.processingDelay);

    console.log('✅ Email queue processor started successfully');
  }

  /**
   * Stop the email queue processor
   */
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

  /**
   * Process a batch of scheduled emails
   */
  async processBatch() {
    try {
      // Get emails that are due to be sent
      const emails = await db
        .select()
        .from(emailQueue)
        .where(
          and(
            eq(emailQueue.status, 'pending'),
            lte(emailQueue.scheduledFor, new Date())
          )
        )
        .orderBy(asc(emailQueue.scheduledFor))
        .limit(this.batchSize);

      if (emails.length === 0) {
        return; // No emails to process
      }

      console.log(`📧 Processing ${emails.length} scheduled emails...`);

      for (const email of emails) {
        await this.processEmail(email);
      }

    } catch (error) {
      console.error('❌ Error processing email batch:', error.message);
      throw error;
    }
  }

  /**
   * Process a single email
   */
  async processEmail(email) {
    try {
      console.log(`📤 Sending email to ${email.toEmail}...`);
      
      // Mark email as sending
      await this.updateEmailStatus(email.id, 'sending');

      // Send the email
      const result = await EmailService.sendEmail({
        to: email.toEmail,
        subject: email.subject,
        html: email.htmlContent || email.textContent,
        text: email.textContent || email.htmlContent?.replace(/<[^>]*>/g, '') // Strip HTML for text version
      });

      if (result.success) {
        // Mark email as sent
        await this.updateEmailStatus(email.id, 'sent', {
          sentAt: new Date()
        });
        
        console.log(`✅ Email sent successfully to ${email.toEmail} (ID: ${result.messageId})`);
      } else {
        throw new Error(result.error || 'Email sending failed');
      }

    } catch (error) {
      console.error(`❌ Failed to send email to ${email.toEmail}:`, error.message);
      
      // Increment retry count
      const newRetryCount = (email.retryCount || 0) + 1;
      const maxRetries = email.maxRetries || 3;
      
      if (newRetryCount >= maxRetries) {
        // Mark as failed if max retries reached
        await this.updateEmailStatus(email.id, 'failed', {
          errorMessage: error.message,
          retryCount: newRetryCount
        });
        console.log(`❌ Email to ${email.toEmail} marked as failed after ${newRetryCount} attempts`);
      } else {
        // Schedule retry (back to scheduled status with incremented retry count)
        await this.updateEmailStatus(email.id, 'scheduled', {
          errorMessage: error.message,
          retryCount: newRetryCount,
          scheduledFor: new Date(Date.now() + (newRetryCount * 60000)) // Retry in 1, 2, 3 minutes
        });
        console.log(`🔄 Email to ${email.toEmail} scheduled for retry ${newRetryCount}/${maxRetries}`);
      }
    }
  }

  /**
   * Update email status in database
   */
  async updateEmailStatus(emailId, status, additionalFields = {}) {
    try {
      const updateData = {
        status,
        updatedAt: new Date(),
        ...additionalFields
      };

      await db
        .update(emailQueue)
        .set(updateData)
        .where(eq(emailQueue.id, emailId));

    } catch (error) {
      console.error('❌ Error updating email status:', error.message);
      throw error;
    }
  }

  /**
   * Get processor status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      batchSize: this.batchSize,
      processingDelay: this.processingDelay
    };
  }

  /**
   * Add email to queue
   */
  async queueEmail(recipient_email, subject, body, scheduled_for = null) {
    try {
      const emailData = {
        recipient_email,
        subject,
        body,
        scheduled_for: scheduled_for || new Date().toISOString(),
        status: 'scheduled',
        created_at: new Date().toISOString()
      };

      const { data, error } = await this.supabase
        .from('email_queue')
        .insert(emailData)
        .select();

      if (error) {
        throw new Error(`Failed to queue email: ${error.message}`);
      }

      console.log(`📧 Email queued for ${recipient_email} (scheduled: ${emailData.scheduled_for})`);
      return data[0];

    } catch (error) {
      console.error('❌ Error queueing email:', error.message);
      throw error;
    }
  }
}

const emailQueueProcessor = new EmailQueueProcessor();
export default emailQueueProcessor;
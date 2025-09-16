import express from 'express';
import { generateTrackingId } from '../utils/crypto.js';
import logger from '../utils/logger.js';
import emailService from '../services/email-service.js';
import emailTemplateService from '../services/email-template-service.js';

const router = express.Router();

/**
 * Zapier webhook verification endpoint
 * GET /webhook/zapier
 */
router.get('/', (req, res) => {
  logger.info('Zapier webhook verification attempt');
  
  res.status(200).json({
    status: 'verified',
    message: 'Zapier webhook endpoint verified',
    timestamp: new Date().toISOString(),
    service: 'email-automation'
  });
});

/**
 * Zapier email sending webhook
 * POST /webhook/zapier/send-email
 */
router.post('/send-email', express.json(), async (req, res) => {
  const trackingId = generateTrackingId();
  const { to, subject, html, text, template_type, lead_data, metadata } = req.body;

  logger.info('Zapier email request received', {
    trackingId,
    to: to ? '[PROVIDED]' : '[MISSING]',
    subject: subject ? '[PROVIDED]' : '[MISSING]',
    template_type: template_type || 'custom',
    hasHtml: !!html,
    hasText: !!text
  });

  try {
    // Validate required fields
    if (!to || !subject) {
      logger.warn('Missing required email fields', {
        trackingId,
        missingFields: {
          to: !to,
          subject: !subject
        }
      });
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: to and subject are required',
        trackingId
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      logger.warn('Invalid email format', {
        trackingId,
        email: '[INVALID_FORMAT]'
      });
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
        trackingId
      });
    }

    // Use email service to send the email
    // Use the imported singleton emailService
    const result = await emailService.sendEmail({
      to,
      subject,
      html: html || text, // Use HTML if provided, otherwise fall back to text
      text: text || html?.replace(/<[^>]*>/g, '') // Strip HTML tags for text version
    });

    if (result.success) {
      logger.info('Zapier email sent successfully', {
        trackingId,
        messageId: result.messageId,
        to: '[SENT]'
      });

      // Optionally queue the email in our system for tracking
      if (template_type && lead_data?.id) {
        try {
          await emailTemplateService.queueEmail({
            to,
            subject,
            html: html || text,
            text: text || html?.replace(/<[^>]*>/g, ''),
            template_type,
            lead_id: lead_data.id,
            tracking_id: trackingId,
            metadata: {
              ...metadata,
              source: 'zapier',
              external_message_id: result.messageId
            },
            status: 'sent' // Mark as already sent
          });
        } catch (queueError) {
          logger.warn('Failed to queue email for tracking', {
            trackingId,
            error: queueError.message
          });
          // Don't fail the request if queuing fails
        }
      }

      res.json({
        success: true,
        messageId: result.messageId,
        trackingId,
        timestamp: new Date().toISOString()
      });
    } else {
      logger.error('Zapier email sending failed', {
        trackingId,
        error: result.error
      });

      res.status(500).json({
        success: false,
        error: result.error,
        trackingId
      });
    }

  } catch (error) {
    logger.error('Zapier webhook error', {
      trackingId,
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      trackingId
    });
  }
});

/**
 * Zapier template-based email sending webhook
 * POST /webhook/zapier/send-template-email
 */
router.post('/send-template-email', express.json(), async (req, res) => {
  const trackingId = generateTrackingId();
  const { 
    template_type, 
    lead_data, 
    email_data = {}, 
    metadata = {} 
  } = req.body;

  logger.info('Zapier template email request received', {
    trackingId,
    template_type,
    hasLeadData: !!lead_data,
    leadEmail: lead_data?.email ? '[PROVIDED]' : '[MISSING]'
  });

  try {
    // Validate required fields
    if (!template_type || !lead_data?.email) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: template_type and lead_data.email are required',
        trackingId
      });
    }

    let result;

    // Handle different template types
    switch (template_type) {
      case 'welcome':
        result = await emailTemplateService.queueWelcomeEmail(
          lead_data.id,
          lead_data.email,
          lead_data.full_name || lead_data.name,
          { ...metadata, source: 'zapier', tracking_id: trackingId }
        );
        break;

      case 'scheduling':
        result = await emailTemplateService.queueSchedulingEmail(
          lead_data.id,
          lead_data.email,
          lead_data.full_name || lead_data.name,
          { ...metadata, source: 'zapier', tracking_id: trackingId }
        );
        break;

      case 'appointment':
        result = await emailTemplateService.queueAppointmentEmail(
          lead_data,
          email_data.calendly_link || metadata.calendly_link,
          trackingId
        );
        break;

      case 'follow_up':
        result = await emailTemplateService.queueFollowUpEmail(
          lead_data,
          email_data.calendly_link || metadata.calendly_link,
          trackingId
        );
        break;

      case 'scheduling_reminder':
        result = await emailTemplateService.queueSchedulingReminderEmail(
          lead_data.id,
          lead_data.email,
          lead_data.full_name || lead_data.name,
          email_data.reminder_type || '24h',
          { ...metadata, source: 'zapier', tracking_id: trackingId }
        );
        break;

      default:
        return res.status(400).json({
          success: false,
          error: `Unsupported template type: ${template_type}`,
          supportedTypes: ['welcome', 'scheduling', 'appointment', 'follow_up', 'scheduling_reminder'],
          trackingId
        });
    }

    if (result.success) {
      logger.info('Zapier template email queued successfully', {
        trackingId,
        template_type,
        queueId: result.queueId
      });

      res.json({
        success: true,
        queueId: result.queueId,
        template_type,
        trackingId,
        timestamp: new Date().toISOString()
      });
    } else {
      logger.error('Zapier template email queueing failed', {
        trackingId,
        template_type,
        error: result.error
      });

      res.status(500).json({
        success: false,
        error: result.error,
        trackingId
      });
    }

  } catch (error) {
    logger.error('Zapier template webhook error', {
      trackingId,
      template_type,
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      trackingId
    });
  }
});

/**
 * Health check endpoint for Zapier webhook
 * GET /webhook/zapier/health
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'zapier-webhook',
    timestamp: new Date().toISOString(),
    endpoints: {
      verification: 'GET /webhook/zapier',
      sendEmail: 'POST /webhook/zapier/send-email',
      sendTemplateEmail: 'POST /webhook/zapier/send-template-email'
    },
    configuration: {
      emailServiceConfigured: true,
      templateServiceConfigured: true
    }
  });
});

/**
 * Test endpoint for Zapier webhook
 * POST /webhook/zapier/test
 */
router.post('/test', express.json(), async (req, res) => {
  const trackingId = generateTrackingId();
  
  logger.info('Zapier webhook test initiated', { trackingId });

  res.json({
    success: true,
    message: 'Zapier webhook is working correctly',
    trackingId,
    timestamp: new Date().toISOString(),
    receivedData: req.body
  });
});

export default router;
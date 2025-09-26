import express from 'express';
import { generateTrackingId } from '../utils/crypto.js';
import logger from '../utils/logger.js';
import emailService from '../services/email-service.js';
import emailTemplateService from '../services/email-template-service.js';
import leadAutomationService from '../services/lead-automation-service.js';

const router = express.Router();

/**
 * N8N webhook verification endpoint
 * GET /webhook/n8n
 */
router.get('/', (req, res) => {
  logger.info('N8N webhook verification attempt');
  
  res.status(200).json({
    status: 'verified',
    message: 'N8N webhook endpoint verified',
    timestamp: new Date().toISOString(),
    service: 'email-automation',
    endpoints: {
      sendEmail: 'POST /webhook/n8n/send-email',
      sendTemplateEmail: 'POST /webhook/n8n/send-template-email',
      queueEmail: 'POST /webhook/n8n/queue-email',
      triggerLeadAutomation: 'POST /webhook/n8n/trigger-lead-automation'
    }
  });
});

/**
 * N8N email sending webhook
 * POST /webhook/n8n/send-email
 */
router.post('/send-email', express.json(), async (req, res) => {
  const trackingId = generateTrackingId();
  const { to, subject, html, text, template_type, lead_data, metadata } = req.body;

  logger.info('N8N email request received', {
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
    const result = await emailService.sendEmail({
      to,
      subject,
      html: html || text, // Use HTML if provided, otherwise fall back to text
      text: text || html?.replace(/<[^>]*>/g, '') // Strip HTML tags for text version
    });

    if (result.success) {
      logger.info('N8N email sent successfully', {
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
              source: 'n8n_webhook',
              sent_via: 'direct'
            }
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
      logger.error('N8N email sending failed', {
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
    logger.error('N8N email webhook error', {
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
 * N8N template email sending webhook
 * POST /webhook/n8n/send-template-email
 */
router.post('/send-template-email', express.json(), async (req, res) => {
  const trackingId = generateTrackingId();
  const { 
    to, 
    template_type, 
    lead_data, 
    calendly_link, 
    meeting_data, 
    reminder_type,
    custom_data,
    metadata 
  } = req.body;

  logger.info('N8N template email request received', {
    trackingId,
    to: to ? '[PROVIDED]' : '[MISSING]',
    template_type: template_type || '[MISSING]',
    hasLeadData: !!lead_data,
    hasCalendlyLink: !!calendly_link,
    hasMeetingData: !!meeting_data
  });

  try {
    // Validate required fields
    if (!to || !template_type) {
      logger.warn('Missing required template email fields', {
        trackingId,
        missingFields: {
          to: !to,
          template_type: !template_type
        }
      });
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: to and template_type are required',
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

    let result;

    // Handle different template types
    switch (template_type) {
      case 'appointment_scheduling':
      case 'calendly_appointment':
        if (!lead_data || !calendly_link) {
          return res.status(400).json({
            success: false,
            error: 'lead_data and calendly_link are required for appointment scheduling emails',
            trackingId
          });
        }
        result = await emailTemplateService.queueAppointmentEmail(
          { ...lead_data, email: to },
          calendly_link,
          trackingId
        );
        break;

      case 'welcome':
        const name = lead_data?.full_name || lead_data?.name || custom_data?.name || 'Valued Customer';
        result = await emailService.sendWelcomeEmail(to, name);
        break;

      case 'meeting_reminder':
        if (!meeting_data || !reminder_type) {
          return res.status(400).json({
            success: false,
            error: 'meeting_data and reminder_type are required for meeting reminder emails',
            trackingId
          });
        }
        result = await emailTemplateService.queueMeetingReminderEmail(
          to,
          lead_data?.id || null,
          meeting_data,
          reminder_type,
          trackingId
        );
        break;

      case 'follow_up':
        const followUpName = lead_data?.full_name || lead_data?.name || custom_data?.name || 'there';
        result = await emailTemplateService.queueFollowUpEmail(
          to,
          followUpName,
          lead_data?.id || null,
          trackingId
        );
        break;

      case 'scheduling_reminder':
        const reminderName = lead_data?.full_name || lead_data?.name || custom_data?.name || 'there';
        const reminderTypeValue = reminder_type || 'first';
        result = await emailTemplateService.queueSchedulingReminderEmail(
          to,
          reminderName,
          reminderTypeValue,
          lead_data?.id || null,
          trackingId
        );
        break;

      default:
        logger.warn('Unsupported template type', {
          trackingId,
          template_type
        });
        return res.status(400).json({
          success: false,
          error: `Unsupported template type: ${template_type}. Supported types: appointment_scheduling, welcome, meeting_reminder, follow_up, scheduling_reminder`,
          trackingId
        });
    }

    if (result.success) {
      logger.info('N8N template email processed successfully', {
        trackingId,
        template_type,
        queueId: result.queueId || result.messageId,
        to: '[SENT]'
      });

      res.json({
        success: true,
        template_type,
        queueId: result.queueId || result.messageId,
        trackingId,
        timestamp: new Date().toISOString()
      });
    } else {
      logger.error('N8N template email processing failed', {
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
    logger.error('N8N template email webhook error', {
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
 * N8N email queue webhook (queue for later processing)
 * POST /webhook/n8n/queue-email
 */
router.post('/queue-email', express.json(), async (req, res) => {
  const trackingId = generateTrackingId();
  const { 
    to, 
    subject, 
    html, 
    text, 
    template_type, 
    lead_id, 
    scheduled_for, 
    priority,
    metadata 
  } = req.body;

  logger.info('N8N email queue request received', {
    trackingId,
    to: to ? '[PROVIDED]' : '[MISSING]',
    subject: subject ? '[PROVIDED]' : '[MISSING]',
    template_type: template_type || 'custom',
    scheduled_for: scheduled_for || 'immediate',
    priority: priority || 'normal'
  });

  try {
    // Validate required fields
    if (!to || !subject) {
      logger.warn('Missing required email queue fields', {
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

    // Queue the email
    const result = await emailTemplateService.queueEmail({
      to,
      subject,
      html: html || text,
      text: text || html?.replace(/<[^>]*>/g, ''),
      template_type: template_type || 'custom',
      lead_id,
      tracking_id: trackingId,
      scheduled_for: scheduled_for || new Date().toISOString(),
      priority: priority || 'normal',
      metadata: {
        ...metadata,
        source: 'n8n_webhook'
      }
    });

    if (result.success) {
      logger.info('N8N email queued successfully', {
        trackingId,
        queueId: result.queueId,
        to: '[QUEUED]'
      });

      res.json({
        success: true,
        queueId: result.queueId,
        trackingId,
        timestamp: new Date().toISOString()
      });
    } else {
      logger.error('N8N email queuing failed', {
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
    logger.error('N8N email queue webhook error', {
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
 * Health check endpoint for N8N webhook
 * GET /webhook/n8n/health
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'n8n-webhook',
    timestamp: new Date().toISOString(),
    endpoints: {
      verification: 'GET /webhook/n8n',
      sendEmail: 'POST /webhook/n8n/send-email',
      sendTemplateEmail: 'POST /webhook/n8n/send-template-email',
      queueEmail: 'POST /webhook/n8n/queue-email',
      triggerLeadAutomation: 'POST /webhook/n8n/trigger-lead-automation'
    },
    supportedTemplates: [
      'appointment_scheduling',
      'calendly_appointment',
      'welcome',
      'meeting_reminder',
      'follow_up',
      'scheduling_reminder'
    ],
    configuration: {
      emailServiceConfigured: true,
      templateServiceConfigured: true
    }
  });
});

/**
 * Test endpoint for N8N webhook
 * POST /webhook/n8n/test
 */
router.post('/test', express.json(), async (req, res) => {
  const trackingId = generateTrackingId();
  
  logger.info('N8N webhook test initiated', { trackingId });

  res.json({
    success: true,
    message: 'N8N webhook is working correctly',
    trackingId,
    timestamp: new Date().toISOString(),
    receivedData: req.body,
    webhookUrl: 'https://n8n-test-nluz.onrender.com/webhook/639181ea-18f1-4e89-94b0-c257d61619e3'
  });
});

/**
 * N8N lead automation trigger webhook
 * POST /webhook/n8n/trigger-lead-automation
 * Triggers the streamlined lead assignment and Calendly workflow for new leads from HubSpot
 */
router.post('/trigger-lead-automation', express.json(), async (req, res) => {
  const trackingId = generateTrackingId();
  const { leadId, hubspot_contact_id, lead_data } = req.body;

  logger.info('N8N lead automation trigger received', {
    trackingId,
    leadId: leadId || '[MISSING]',
    hubspot_contact_id: hubspot_contact_id || '[MISSING]',
    hasLeadData: !!lead_data
  });

  try {
    // Validate required fields
    if (!leadId && !hubspot_contact_id) {
      logger.warn('Missing required lead identification', {
        trackingId,
        missingFields: {
          leadId: !leadId,
          hubspot_contact_id: !hubspot_contact_id
        }
      });
      return res.status(400).json({
        success: false,
        error: 'Either leadId or hubspot_contact_id is required',
        trackingId
      });
    }

    // Use leadId if provided, otherwise use hubspot_contact_id
    const targetLeadId = leadId || hubspot_contact_id;

    logger.info('Triggering streamlined lead automation workflow', {
      trackingId,
      targetLeadId,
      source: 'n8n_webhook'
    });

    // Execute the complete streamlined workflow (assignment + Calendly)
    const automationResult = await leadAutomationService.executeCompleteWorkflow(targetLeadId, trackingId);

    if (automationResult.success) {
      logger.info('N8N lead automation completed successfully', {
        trackingId,
        leadId: targetLeadId,
        completedSteps: automationResult.completedSteps,
        failedSteps: automationResult.failedSteps
      });

      res.json({
        success: true,
        leadId: targetLeadId,
        trackingId,
        workflow: {
          completedSteps: automationResult.completedSteps,
          failedSteps: automationResult.failedSteps,
          steps: {
            assignment: automationResult.steps.assignment,
            calendly: automationResult.steps.calendly
          }
        },
        timestamp: new Date().toISOString()
      });
    } else {
      logger.error('N8N lead automation failed', {
        trackingId,
        leadId: targetLeadId,
        error: automationResult.error
      });
      
      res.status(500).json({
        success: false,
        leadId: targetLeadId,
        error: automationResult.error,
        trackingId,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    logger.error('N8N lead automation webhook error', {
      trackingId,
      leadId: leadId || hubspot_contact_id,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      trackingId,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
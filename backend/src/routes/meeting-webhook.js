import express from 'express';
import { generateTrackingId } from '../utils/crypto.js';
import logger from '../utils/logger.js';
import insforgeDataService from '../services/insforge-data-service.js';

const router = express.Router();

function renderStatusPage({ title, heading, body, trackingId, status = 'ok' }) {
  const color = status === 'ok' ? 'green' : 'crimson';
  return `
    <html>
      <head>
        <title>${title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background-color: Canvas;">
        <div style="max-width: 600px; margin: 0 auto; background: Canvas; padding: 40px; border-radius: 10px;">
          <h1 style="color: ${color}; margin-bottom: 20px;">${heading}</h1>
          <p style="color: CanvasText; font-size: 16px;">${body}</p>
          <p style="color: GrayText; font-size: 12px; margin-top: 24px;">Tracking ID: ${trackingId}</p>
        </div>
      </body>
    </html>
  `;
}

router.get('/meeting-confirmed', async (req, res) => {
  const trackingId = generateTrackingId();
  const { leadId } = req.query;

  logger.info('Meeting confirmation webhook triggered', {
    trackingId,
    leadId: leadId || '[MISSING]',
    userAgent: req.get('User-Agent'),
    ip: req.ip,
  });

  try {
    if (!leadId) {
      return res.status(400).send(renderStatusPage({
        title: 'Invalid Request',
        heading: 'Invalid Request',
        body: 'Missing required parameters. Please contact support if this continues.',
        trackingId,
        status: 'error',
      }));
    }

    const lead = await insforgeDataService.getLeadById(leadId);
    if (!lead) {
      return res.status(404).send(renderStatusPage({
        title: 'Lead Not Found',
        heading: 'Lead Not Found',
        body: 'The specified lead could not be found.',
        trackingId,
        status: 'error',
      }));
    }

    await Promise.all([
      insforgeDataService.updateLead(leadId, {
        meetingScheduled: true,
        lastMeetingReminderSent: new Date(),
        status: 'meeting_scheduled',
        updatedAt: new Date(),
      }, lead),
      insforgeDataService.cancelPendingEmailQueueForLead(leadId, {
        status: 'cancelled',
        errorMessage: 'Lead confirmed meeting scheduled - follow-ups terminated',
        updatedAt: new Date(),
      }, lead),
      insforgeDataService.cancelPendingWorkflowAutomationForLead(leadId, {
        status: 'cancelled',
        errorMessage: 'Lead confirmed meeting scheduled - automations terminated',
        updatedAt: new Date(),
      }, lead),
    ]);

    logger.info('Meeting confirmation processed successfully', {
      trackingId,
      leadId,
      leadEmail: lead.email ? '[UPDATED]' : '[MISSING]',
    });

    res.status(200).send(renderStatusPage({
      title: 'Meeting Confirmed',
      heading: 'Thank You',
      body: "Meeting confirmation received. We've updated your status and stopped follow-up automation for this lead.",
      trackingId,
      status: 'ok',
    }));
  } catch (error) {
    logger.logError(error, {
      context: 'meeting_confirmation_webhook',
      trackingId,
      leadId,
    });

    res.status(500).send(renderStatusPage({
      title: 'System Error',
      heading: 'System Error',
      body: 'We encountered an error processing your request. Please try again or contact support.',
      trackingId,
      status: 'error',
    }));
  }
});

router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'meeting-webhook',
    timestamp: new Date().toISOString(),
    endpoints: {
      meetingConfirmed: 'GET /api/webhook/meeting-confirmed',
    },
  });
});

export default router;

import express from 'express';
import { generateTrackingId } from '../utils/crypto.js';
import logger from '../utils/logger.js';
import { db } from '../config/index.js';
import { leads, emailQueue, workflowAutomation } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

const router = express.Router();

/**
 * Meeting confirmation webhook endpoint
 * GET /api/webhook/meeting-confirmed
 * This endpoint is triggered when a lead clicks "I have scheduled my meeting" button
 */
router.get('/meeting-confirmed', async (req, res) => {
  const trackingId = generateTrackingId();
  const { leadId, trackingId: emailTrackingId } = req.query;

  logger.info('Meeting confirmation webhook triggered', {
    trackingId,
    leadId: leadId || '[MISSING]',
    emailTrackingId: emailTrackingId || '[MISSING]',
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });

  try {
    // Validate required parameters
    if (!leadId) {
      logger.warn('Missing leadId parameter', { trackingId });
      return res.status(400).send(`
        <html>
          <head><title>Invalid Request</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2>❌ Invalid Request</h2>
            <p>Missing required parameters. Please contact support if you continue to see this error.</p>
          </body>
        </html>
      `);
    }

    // Find the lead in the database
    const lead = await db.select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!lead || lead.length === 0) {
      logger.warn('Lead not found', { trackingId, leadId });
      return res.status(404).send(`
        <html>
          <head><title>Lead Not Found</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2>❌ Lead Not Found</h2>
            <p>The specified lead could not be found. Please contact support if you continue to see this error.</p>
          </body>
        </html>
      `);
    }

    const leadData = lead[0];

    // Update lead status to indicate meeting is scheduled
    await db.update(leads)
      .set({
        meetingScheduled: true,
        lastMeetingReminderSent: new Date(),
        status: 'meeting_scheduled',
        updatedAt: new Date()
      })
      .where(eq(leads.id, leadId));

    // Cancel all pending follow-up emails for this lead
    await db.update(emailQueue)
      .set({
        status: 'cancelled',
        errorMessage: 'Lead confirmed meeting scheduled - follow-ups terminated',
        updatedAt: new Date()
      })
      .where(
        and(
          eq(emailQueue.leadId, leadId),
          eq(emailQueue.status, 'pending')
        )
      );

    // Cancel all pending workflow automations for this lead
    await db.update(workflowAutomation)
      .set({
        status: 'cancelled',
        errorMessage: 'Lead confirmed meeting scheduled - automations terminated',
        updatedAt: new Date()
      })
      .where(
        and(
          eq(workflowAutomation.leadId, leadId),
          eq(workflowAutomation.status, 'pending')
        )
      );

    logger.info('Meeting confirmation processed successfully', {
      trackingId,
      leadId,
      leadEmail: leadData.email ? '[UPDATED]' : '[MISSING]',
      cancelledEmails: 'pending_followups',
      cancelledAutomations: 'pending_workflows'
    });

    // Return success page
    res.status(200).send(`
      <html>
        <head>
          <title>Meeting Confirmed</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background-color: #f8f9fa;">
          <div style="max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h1 style="color: #27ae60; margin-bottom: 20px;">✅ Thank You!</h1>
            <h2 style="color: #2c3e50; margin-bottom: 30px;">Meeting Confirmation Received</h2>
            
            <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #27ae60;">
              <p style="color: #2c3e50; font-size: 16px; margin: 0;">
                We've successfully updated your status and <strong>stopped all follow-up emails</strong> for your account.
              </p>
            </div>
            
            <div style="margin: 30px 0;">
              <h3 style="color: #2c3e50;">What happens next?</h3>
              <ul style="text-align: left; color: #34495e; line-height: 1.6;">
                <li>All automated follow-up emails have been cancelled</li>
                <li>Your meeting status has been updated in our system</li>
                <li>You'll only receive meeting-related communications going forward</li>
                <li>Our team will prepare for your scheduled consultation</li>
              </ul>
            </div>
            
            <div style="background-color: #f39c12; color: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; font-weight: bold;">📅 Don't forget about your meeting!</p>
              <p style="margin: 5px 0 0 0; font-size: 14px;">You'll receive reminder emails closer to your scheduled time.</p>
            </div>
            
            <p style="color: #7f8c8d; font-size: 14px; margin-top: 30px;">
              Questions? Contact our support team - we're here to help!
            </p>
            
            <p style="color: #bdc3c7; font-size: 12px; margin-top: 20px;">
              Tracking ID: ${trackingId}
            </p>
          </div>
        </body>
      </html>
    `);

  } catch (error) {
    logger.logError(error, {
      context: 'meeting_confirmation_webhook',
      trackingId,
      leadId
    });

    res.status(500).send(`
      <html>
        <head><title>System Error</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h2>❌ System Error</h2>
          <p>We encountered an error processing your request. Please try again or contact support.</p>
          <p style="color: #7f8c8d; font-size: 12px;">Error ID: ${trackingId}</p>
        </body>
      </html>
    `);
  }
});

/**
 * Health check endpoint for meeting webhook
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'meeting-webhook',
    timestamp: new Date().toISOString(),
    endpoints: {
      meetingConfirmed: 'GET /api/webhook/meeting-confirmed'
    }
  });
});

export default router;
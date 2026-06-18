import logger from '../utils/logger.js';
import { hashForLogging } from '../utils/crypto.js';
import insforgeDataService from './insforge-data-service.js';
import leadConversationService from './lead-conversation-service.js';
import twilioSmsService from './twilio-sms-service.js';

export async function processCalendlyEvent(webhookData, trackingId) {
  const validationResult = validateWebhookData(webhookData);
  if (!validationResult.isValid) {
    const error = new Error(`Invalid webhook data: ${validationResult.errors.join(', ')}`);
    logger.logError(error, {
      context: 'calendly_webhook_validation',
      trackingId,
      errors: validationResult.errors,
    });
    throw error;
  }

  const eventType = webhookData.event;
  const payload = webhookData.payload;
  const results = {
    event: eventType,
    trackingId,
    processed: false,
    leadUpdated: false,
    meetingCreated: false,
    meetingUpdated: false,
    errors: [],
    warnings: validationResult.warnings,
    dataConsistencyChecks: {
      duplicateCheck: false,
      leadExists: false,
      meetingExists: false,
    },
  };

  logger.logLeadProcessing(trackingId, 'calendly_event_processing_started', {
    event: eventType,
    inviteeEmail: payload?.invitee?.email ? hashForLogging(payload.invitee.email) : '[MISSING]',
    eventUri: payload?.event?.uri,
    validationWarnings: validationResult.warnings,
  });

  try {
    switch (eventType) {
      case 'invitee.created':
        results.processed = await handleInviteeCreated(payload, trackingId, results);
        break;
      case 'invitee.canceled':
        results.processed = await handleInviteeCanceled(payload, trackingId, results);
        break;
      case 'invitee.rescheduled':
        results.processed = await handleInviteeRescheduled(payload, trackingId, results);
        break;
      case 'invitee_no_show.created':
        results.processed = await handleInviteeNoShow(payload, trackingId, results);
        break;
      default:
        logger.logWebhookProcessing(trackingId, eventType, 'event_type_not_handled', { event: eventType });
        break;
    }

    logger.logLeadProcessing(trackingId, 'calendly_event_processing_completed', {
      event: eventType,
      processed: results.processed,
      leadUpdated: results.leadUpdated,
      meetingCreated: results.meetingCreated,
      meetingUpdated: results.meetingUpdated,
    });

    return results;
  } catch (error) {
    results.errors.push(error.message);
    logger.logError(error, {
      context: 'calendly_event_processing',
      trackingId,
      event: eventType,
    });
    throw error;
  }
}

function validateWebhookData(webhookData) {
  const errors = [];
  const warnings = [];

  if (!webhookData || typeof webhookData !== 'object') {
    errors.push('Webhook data must be an object');
    return { isValid: false, errors, warnings };
  }

  if (!webhookData.event || typeof webhookData.event !== 'string') {
    errors.push('Missing or invalid event type');
  }

  const payload = webhookData.payload;
  if (!payload || typeof payload !== 'object') {
    errors.push('Missing or invalid payload');
    return { isValid: errors.length === 0, errors, warnings };
  }

  if (!payload.invitee || typeof payload.invitee !== 'object') {
    errors.push('Missing or invalid invitee data');
  } else if (!payload.invitee.email || typeof payload.invitee.email !== 'string') {
    errors.push('Missing or invalid invitee email');
  }

  if (!payload.event || typeof payload.event !== 'object') {
    errors.push('Missing or invalid event data');
  } else if (!payload.event.uri || typeof payload.event.uri !== 'string') {
    errors.push('Missing or invalid event URI');
  }

  if (['invitee.created', 'invitee.rescheduled'].includes(webhookData.event)) {
    if (!payload.event?.start_time || !payload.event?.end_time) {
      errors.push('Missing required start_time or end_time for scheduling event');
    }
  }

  if (!payload.event_type || typeof payload.event_type !== 'object') {
    warnings.push('Missing event_type data');
  }

  return { isValid: errors.length === 0, errors, warnings };
}

function getCalendlyLocationText(location) {
  if (!location) return null;
  if (Array.isArray(location)) return location.filter(Boolean).join(', ');
  if (typeof location === 'object') {
    return location.join_url || location.location || location.type || JSON.stringify(location);
  }
  return String(location);
}

function getCalendlyJoinUrl(location) {
  if (!location || typeof location !== 'object' || Array.isArray(location)) return null;
  return location.join_url || null;
}

function getInviteeName(invitee = {}) {
  return invitee.name || [invitee.first_name, invitee.last_name].filter(Boolean).join(' ') || 'Calendly Invitee';
}

function getMeetingReminderScheduledFor(startTime, now = new Date()) {
  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) {
    return new Date(now.getTime() + 5 * 60 * 1000);
  }

  const oneHourBefore = new Date(start.getTime() - 60 * 60 * 1000);
  if (oneHourBefore.getTime() <= now.getTime()) {
    return new Date(now.getTime() + 5 * 60 * 1000);
  }

  return oneHourBefore;
}

async function findLeadByEmail(email, trackingId) {
  if (!email) return null;
  logger.logLeadProcessing(trackingId, 'searching_lead_by_email', {
    email: hashForLogging(email),
  });
  const lead = await insforgeDataService.getLeadByEmail(email);
  if (lead) {
    logger.logLeadProcessing(trackingId, 'lead_found_by_email', {
      leadId: lead.id,
      email: hashForLogging(email),
    });
  }
  return lead;
}

async function updateLeadSafely(leadId, patch, fallbackPatch, trackingId) {
  try {
    return await insforgeDataService.updateLead(leadId, patch);
  } catch (error) {
    logger.warn('Full Calendly lead update failed; retrying with minimal patch', {
      trackingId,
      leadId,
      error: error.message,
    });
    return insforgeDataService.updateLead(leadId, fallbackPatch);
  }
}

async function createLeadFromCalendlyEvent(payload, trackingId) {
  const invitee = payload.invitee;
  const event = payload.event;
  const nameParts = getInviteeName(invitee).split(' ');

  const lead = await insforgeDataService.createLead({
    email: invitee.email.trim().toLowerCase(),
    firstName: invitee.first_name || nameParts[0] || null,
    lastName: invitee.last_name || nameParts.slice(1).join(' ') || null,
    fullName: getInviteeName(invitee),
    source: 'calendly_direct',
    priority: 'high',
    status: 'scheduled',
    qualificationStatus: 'qualified',
    qualificationScore: 90,
    leadStage: 'booked',
    schedulingState: 'scheduled',
    preferredContactChannel: 'email',
    meetingScheduled: true,
    scheduledAt: event.start_time,
    meetingEndTime: event.end_time,
    meetingLocation: getCalendlyLocationText(event.location),
    calendlyEventUri: event.uri,
    calendlyInviteeUri: invitee.uri || null,
    calendlyEventType: payload.event_type?.name || null,
    calendlyQuestions: invitee.questions_and_answers || [],
    calendlyTrackingData: invitee.tracking || {},
    lastCalendlyUpdate: new Date(),
    trackingId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  logger.logLeadProcessing(trackingId, 'lead_created_from_calendly', {
    leadId: lead.id,
    email: hashForLogging(invitee.email),
  });

  return lead;
}

async function logCalendlyConversation({ lead, payload, messageType, subject, bodyText, trackingId, extraMetadata = {} }) {
  const conversation = await leadConversationService.ensurePrimaryConversation(lead, 'email');
  await leadConversationService.logSystemEvent({
    lead,
    conversationId: conversation.id,
    channel: 'calendar',
    messageType,
    subject,
    bodyText,
    metadata: {
      trackingId,
      calendlyEventUri: payload.event?.uri || null,
      calendlyInviteeUri: payload.invitee?.uri || null,
      eventType: payload.event_type?.name || null,
      startTime: payload.event?.start_time || null,
      endTime: payload.event?.end_time || null,
      location: getCalendlyLocationText(payload.event?.location),
      joinUrl: getCalendlyJoinUrl(payload.event?.location),
      ...extraMetadata,
    },
  });

  await leadConversationService.updateConversation(conversation.id, {
    conversationStatus: messageType === 'calendly_meeting_scheduled' ? 'meeting_scheduled' : conversation.conversationStatus,
    nextAction: messageType === 'calendly_meeting_scheduled' ? 'monitor_meeting' : conversation.nextAction,
    nextActionAt: null,
    lastIntent: messageType,
    lastIntentAt: new Date(),
    lastSummary: bodyText,
  });

  return conversation;
}

async function sendCalendlyMeetingDetailsSms({ lead, payload, trackingId }) {
  if (!lead?.phone) {
    logger.info('Skipping Calendly meeting details SMS because lead has no phone', {
      trackingId,
      leadId: lead?.id,
    });
    return null;
  }

  const smsResult = await twilioSmsService.sendCalendlyMeetingDetails(
    lead,
    {
      startTime: payload.event?.start_time,
      meeting_url: getCalendlyJoinUrl(payload.event?.location),
      location: getCalendlyLocationText(payload.event?.location),
    },
    trackingId
  );

  logger.info('Calendly meeting details SMS processed', {
    trackingId,
    leadId: lead.id,
    success: smsResult.success,
    status: smsResult.status || null,
    error: smsResult.success ? null : smsResult.error,
  });

  return smsResult;
}

async function scheduleMeetingSmsReminder({ lead, conversationId, payload, trackingId }) {
  if (!lead?.phone || !payload.event?.start_time) {
    logger.info('Skipping meeting SMS reminder schedule because lead has no phone or event start time', {
      trackingId,
      leadId: lead?.id,
      hasStartTime: Boolean(payload.event?.start_time),
    });
    return null;
  }

  const scheduledFor = getMeetingReminderScheduledFor(payload.event.start_time);
  const action = await insforgeDataService.createBobAction({
    leadId: lead.id,
    conversationId,
    actionType: 'send_meeting_sms_reminder',
    channel: 'sms',
    status: 'pending',
    reason: 'Send SMS reminder after Calendly booking is confirmed',
    payload: {
      source: 'calendly_webhook',
      trackingId,
      calendlyEventUri: payload.event?.uri || null,
      calendlyInviteeUri: payload.invitee?.uri || null,
      eventType: payload.event_type?.name || null,
      startTime: payload.event?.start_time,
      endTime: payload.event?.end_time || null,
      location: getCalendlyLocationText(payload.event?.location),
      meetingUrl: getCalendlyJoinUrl(payload.event?.location),
    },
    scheduledFor,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  logger.info('Scheduled post-booking SMS meeting reminder', {
    trackingId,
    leadId: lead.id,
    actionId: action.id,
    scheduledFor,
  });

  return action;
}

async function handleInviteeCreated(payload, trackingId, results) {
  const invitee = payload.invitee;
  const event = payload.event;
  let lead = await findLeadByEmail(invitee.email, trackingId);

  if (!lead) {
    lead = await createLeadFromCalendlyEvent(payload, trackingId);
  }

  results.dataConsistencyChecks.leadExists = true;
  const fullPatch = {
    status: 'scheduled',
    leadStage: 'booked',
    schedulingState: 'scheduled',
    meetingScheduled: true,
    scheduledAt: event.start_time,
    meetingEndTime: event.end_time,
    meetingLocation: getCalendlyLocationText(event.location),
    calendlyEventUri: event.uri,
    calendlyInviteeUri: invitee.uri || null,
    calendlyEventType: payload.event_type?.name || null,
    calendlyQuestions: invitee.questions_and_answers || [],
    calendlyTrackingData: invitee.tracking || {},
    lastCalendlyUpdate: new Date(),
    requiresHumanReview: false,
    updatedAt: new Date(),
  };
  const fallbackPatch = {
    status: 'scheduled',
    leadStage: 'booked',
    schedulingState: 'scheduled',
    meetingScheduled: true,
    scheduledAt: event.start_time,
    updatedAt: new Date(),
  };

  lead = await updateLeadSafely(lead.id, fullPatch, fallbackPatch, trackingId);
  results.leadUpdated = true;

  const conversation = await logCalendlyConversation({
    lead,
    payload,
    messageType: 'calendly_meeting_scheduled',
    subject: 'Calendly meeting scheduled',
    bodyText: `Lead booked ${payload.event_type?.name || 'a consultation'} for ${event.start_time}.`,
    trackingId,
  });

  await sendCalendlyMeetingDetailsSms({ lead, payload, trackingId });
  await scheduleMeetingSmsReminder({ lead, conversationId: conversation.id, payload, trackingId });

  logger.logLeadProcessing(trackingId, 'lead_updated_with_scheduling', {
    leadId: lead.id,
    scheduledAt: event.start_time,
  });

  return true;
}

async function handleInviteeCanceled(payload, trackingId, results) {
  const lead = await findLeadByEmail(payload.invitee.email, trackingId);
  if (!lead) return false;

  await updateLeadSafely(
    lead.id,
    {
      status: 'canceled',
      schedulingState: 'reschedule_requested',
      canceledAt: payload.invitee.canceled_at || new Date(),
      cancellationReason: payload.invitee.cancellation?.reason || null,
      lastCalendlyUpdate: new Date(),
      updatedAt: new Date(),
    },
    {
      status: 'canceled',
      schedulingState: 'reschedule_requested',
      updatedAt: new Date(),
    },
    trackingId
  );
  results.leadUpdated = true;

  await logCalendlyConversation({
    lead,
    payload,
    messageType: 'calendly_meeting_canceled',
    subject: 'Calendly meeting canceled',
    bodyText: `Lead canceled the Calendly meeting.${payload.invitee.cancellation?.reason ? ` Reason: ${payload.invitee.cancellation.reason}` : ''}`,
    trackingId,
  });

  return true;
}

async function handleInviteeRescheduled(payload, trackingId, results) {
  const lead = await findLeadByEmail(payload.invitee.email, trackingId);
  if (!lead) return false;

  await updateLeadSafely(
    lead.id,
    {
      status: 'scheduled',
      leadStage: 'booked',
      schedulingState: 'scheduled',
      scheduledAt: payload.event.start_time,
      meetingEndTime: payload.event.end_time,
      meetingLocation: getCalendlyLocationText(payload.event.location),
      rescheduledAt: payload.invitee.rescheduled_at || new Date(),
      lastCalendlyUpdate: new Date(),
      updatedAt: new Date(),
    },
    {
      status: 'scheduled',
      schedulingState: 'scheduled',
      scheduledAt: payload.event.start_time,
      updatedAt: new Date(),
    },
    trackingId
  );
  results.leadUpdated = true;

  const conversation = await logCalendlyConversation({
    lead,
    payload,
    messageType: 'calendly_meeting_rescheduled',
    subject: 'Calendly meeting rescheduled',
    bodyText: `Lead rescheduled the Calendly meeting for ${payload.event.start_time}.`,
    trackingId,
  });

  await sendCalendlyMeetingDetailsSms({ lead, payload, trackingId });
  await scheduleMeetingSmsReminder({ lead, conversationId: conversation.id, payload, trackingId });

  return true;
}

async function handleInviteeNoShow(payload, trackingId, results) {
  const lead = await findLeadByEmail(payload.invitee.email, trackingId);
  if (!lead) return false;

  await updateLeadSafely(
    lead.id,
    {
      status: 'no_show',
      schedulingState: 'needs_follow_up',
      noShowAt: new Date(),
      lastCalendlyUpdate: new Date(),
      updatedAt: new Date(),
    },
    {
      status: 'no_show',
      schedulingState: 'needs_follow_up',
      updatedAt: new Date(),
    },
    trackingId
  );
  results.leadUpdated = true;

  await logCalendlyConversation({
    lead,
    payload,
    messageType: 'calendly_no_show',
    subject: 'Calendly no-show recorded',
    bodyText: 'Calendly marked the invitee as a no-show.',
    trackingId,
  });

  return true;
}

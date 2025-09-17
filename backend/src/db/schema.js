import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb, integer, inet, check, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Agents table
export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: varchar('agent_id', { length: 50 }).unique(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }),
  firstName: varchar('first_name', { length: 100 }),
  lastName: varchar('last_name', { length: 100 }),
  fullName: varchar('full_name', { length: 255 }), // Generated column handled in migration
  phone: varchar('phone', { length: 50 }),
  role: varchar('role', { length: 20 }).notNull().default('agent'),
  isActive: boolean('is_active').notNull().default(true),
  emailVerified: boolean('email_verified').notNull().default(false),
  verificationToken: varchar('verification_token', { length: 255 }),
  agentToken: varchar('agent_token', { length: 255 }),
  agentTokenExpires: timestamp('agent_token_expires', { withTimezone: true }),
  resetToken: varchar('reset_token', { length: 255 }),
  resetTokenExpires: timestamp('reset_token_expires', { withTimezone: true }),
  lastLogin: timestamp('last_login', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (table) => ({
  agentIdIdx: index('idx_agents_agent_id').on(table.agentId),
  emailIdx: index('idx_agents_email').on(table.email),
  activeIdx: index('idx_agents_active').on(table.isActive),
  roleIdx: index('idx_agents_role').on(table.role),
}));

// Leads table
export const leads = pgTable('leads', {
  // Primary identifiers
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Contact information
  email: varchar('email', { length: 255 }).notNull(),
  firstName: varchar('first_name', { length: 255 }),
  lastName: varchar('last_name', { length: 255 }),
  fullName: varchar('full_name', { length: 255 }), // Generated column handled in migration
  phone: varchar('phone', { length: 50 }),
  
  // Lead source and metadata
  source: varchar('source', { length: 100 }).notNull().default('hubspot_crm'),
  status: varchar('status', { length: 50 }).notNull().default('new'),
  
  // Custom fields
  customFields: jsonb('custom_fields'),
  
  // HubSpot integration
  hubspotContactId: varchar('hubspot_contact_id', { length: 255 }),
  hubspotSyncStatus: varchar('hubspot_sync_status', { length: 50 }).notNull().default('pending'),
  hubspotLastSync: timestamp('hubspot_last_sync', { withTimezone: true }),
  hubspotErrorMessage: text('hubspot_error_message'),
  
  // Agent tracking
  assignedAgentId: uuid('assigned_agent_id').references(() => agents.id, { onDelete: 'set null' }),
  lastUpdatedBy: uuid('last_updated_by').references(() => agents.id, { onDelete: 'set null' }),
  agentNotes: text('agent_notes'),
  followUpDate: timestamp('follow_up_date', { withTimezone: true }),
  priority: varchar('priority', { length: 20 }).notNull().default('medium'),
  
  // Calendly integration
  calendlyEventUri: text('calendly_event_uri'),
  calendlyInviteeUri: text('calendly_invitee_uri'),
  calendlyEventType: varchar('calendly_event_type', { length: 255 }),
  calendlyQuestions: jsonb('calendly_questions'),
  calendlyTrackingData: jsonb('calendly_tracking_data'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  meetingEndTime: timestamp('meeting_end_time', { withTimezone: true }),
  meetingLocation: text('meeting_location'),
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
  cancellationReason: text('cancellation_reason'),
  rescheduledAt: timestamp('rescheduled_at', { withTimezone: true }),
  previousScheduledAt: timestamp('previous_scheduled_at', { withTimezone: true }),
  noShowAt: timestamp('no_show_at', { withTimezone: true }),
  lastCalendlyUpdate: timestamp('last_calendly_update', { withTimezone: true }),
  
  // Processing metadata
  processingStatus: varchar('processing_status', { length: 50 }).notNull().default('pending'),
  processingAttempts: integer('processing_attempts').notNull().default(0),
  lastProcessingAttempt: timestamp('last_processing_attempt', { withTimezone: true }),
  processingErrors: jsonb('processing_errors'),
  trackingId: varchar('tracking_id', { length: 255 }),
  
  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (table) => ({
  emailIdx: index('idx_leads_email').on(table.email),
  statusIdx: index('idx_leads_status').on(table.status),
  createdAtIdx: index('idx_leads_created_at').on(table.createdAt),
  processingStatusIdx: index('idx_leads_processing_status').on(table.processingStatus),
  scheduledAtIdx: index('idx_leads_scheduled_at').on(table.scheduledAt),
  trackingIdIdx: index('idx_leads_tracking_id').on(table.trackingId),
  assignedAgentIdx: index('idx_leads_assigned_agent').on(table.assignedAgentId),
  emailStatusIdx: index('idx_leads_email_status').on(table.email, table.status),
  sourceCreatedAtIdx: index('idx_leads_source_created_at').on(table.source, table.createdAt),
  priorityStatusIdx: index('idx_leads_priority_status').on(table.priority, table.status),
}));

// Lead audit log table
export const leadAuditLog = pgTable('lead_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 50 }).notNull(),
  fieldName: varchar('field_name', { length: 100 }),
  oldValue: text('old_value'),
  newValue: text('new_value'),
  notes: text('notes'),
  ipAddress: varchar('ip_address', { length: 45 }), // inet type handled in migration
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  leadIdIdx: index('idx_audit_log_lead_id').on(table.leadId),
  agentIdIdx: index('idx_audit_log_agent_id').on(table.agentId),
  createdAtIdx: index('idx_audit_log_created_at').on(table.createdAt),
  actionIdx: index('idx_audit_log_action').on(table.action),
}));

// Lead processing logs table
export const leadProcessingLogs = pgTable('lead_processing_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
  trackingId: varchar('tracking_id', { length: 255 }),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  eventData: jsonb('event_data'),
  success: boolean('success').notNull().default(true),
  errorMessage: text('error_message'),
  processingTimeMs: integer('processing_time_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  leadIdIdx: index('idx_lead_logs_lead_id').on(table.leadId),
  trackingIdIdx: index('idx_lead_logs_tracking_id').on(table.trackingId),
  eventTypeIdx: index('idx_lead_logs_event_type').on(table.eventType),
  createdAtIdx: index('idx_lead_logs_created_at').on(table.createdAt),
  successIdx: index('idx_lead_logs_success').on(table.success),
}));

// Webhook events table
export const webhookEvents = pgTable('webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  source: varchar('source', { length: 50 }).notNull(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  webhookId: varchar('webhook_id', { length: 255 }),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
  trackingId: varchar('tracking_id', { length: 255 }),
  rawPayload: jsonb('raw_payload').notNull(),
  processedPayload: jsonb('processed_payload'),
  processingStatus: varchar('processing_status', { length: 50 }).notNull().default('pending'),
  processingAttempts: integer('processing_attempts').notNull().default(0),
  lastProcessingAttempt: timestamp('last_processing_attempt', { withTimezone: true }),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
}, (table) => ({
  sourceIdx: index('idx_webhook_events_source').on(table.source),
  eventTypeIdx: index('idx_webhook_events_event_type').on(table.eventType),
  leadIdIdx: index('idx_webhook_events_lead_id').on(table.leadId),
  trackingIdIdx: index('idx_webhook_events_tracking_id').on(table.trackingId),
  processingStatusIdx: index('idx_webhook_events_processing_status').on(table.processingStatus),
  createdAtIdx: index('idx_webhook_events_created_at').on(table.createdAt),
}));

// System config table
export const systemConfig = pgTable('system_config', {
  key: varchar('key', { length: 255 }).primaryKey(),
  value: jsonb('value').notNull(),
  description: text('description'),
  isSensitive: boolean('is_sensitive').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Meetings table
export const meetings = pgTable('meetings', {
  id: uuid('id').primaryKey().defaultRandom(),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  calendlyEventId: varchar('calendly_event_id', { length: 255 }).unique(),
  meetingType: varchar('meeting_type', { length: 100 }).notNull().default('consultation'),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }).notNull(),
  timezone: varchar('timezone', { length: 100 }).notNull().default('UTC'),
  status: varchar('status', { length: 50 }).notNull().default('scheduled'),
  meetingUrl: text('meeting_url'),
  location: text('location'),
  attendeeEmail: varchar('attendee_email', { length: 255 }),
  attendeeName: varchar('attendee_name', { length: 255 }),
  attendeePhone: varchar('attendee_phone', { length: 50 }),
  reminderSent: boolean('reminder_sent').notNull().default(false),
  followUpSent: boolean('follow_up_sent').notNull().default(false),
  reminder24hSent: boolean('reminder_24h_sent').notNull().default(false),
  reminder1hSent: boolean('reminder_1h_sent').notNull().default(false),
  sms24hSent: boolean('sms_24h_sent').notNull().default(false),
  sms1hSent: boolean('sms_1h_sent').notNull().default(false),
  reminder24hSentAt: timestamp('reminder_24h_sent_at', { withTimezone: true }),
  reminder1hSentAt: timestamp('reminder_1h_sent_at', { withTimezone: true }),
  notes: text('notes'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  leadIdIdx: index('idx_meetings_lead_id').on(table.leadId),
  agentIdIdx: index('idx_meetings_agent_id').on(table.agentId),
  calendlyEventIdIdx: index('idx_meetings_calendly_event_id').on(table.calendlyEventId),
  startTimeIdx: index('idx_meetings_start_time').on(table.startTime),
  statusIdx: index('idx_meetings_status').on(table.status),
}));

// Meeting reminders table
export const meetingReminders = pgTable('meeting_reminders', {
  id: uuid('id').primaryKey().defaultRandom(),
  meetingId: uuid('meeting_id').notNull().references(() => meetings.id, { onDelete: 'cascade' }),
  reminderType: varchar('reminder_type', { length: 50 }).notNull(),
  deliveryMethod: varchar('delivery_method', { length: 20 }).notNull().default('email'),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true, mode: 'string' }),
  emailMessageId: varchar('email_message_id', { length: 255 }),
  smsMessageSid: varchar('sms_message_sid', { length: 255 }),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  meetingIdIdx: index('idx_meeting_reminders_meeting_id').on(table.meetingId),
  scheduledForIdx: index('idx_meeting_reminders_scheduled_for').on(table.scheduledFor),
  statusIdx: index('idx_meeting_reminders_status').on(table.status),
}));

// Workflow automation table
export const workflowAutomation = pgTable('workflow_automation', {
  id: uuid('id').primaryKey().defaultRandom(),
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  workflowType: varchar('workflow_type', { length: 100 }).notNull(),
  stepName: varchar('step_name', { length: 255 }).notNull(),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  retryCount: integer('retry_count').notNull().default(0),
  maxRetries: integer('max_retries').notNull().default(3),
  errorMessage: text('error_message'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  leadIdIdx: index('idx_workflow_lead_id').on(table.leadId),
  scheduledAtIdx: index('idx_workflow_scheduled_at').on(table.scheduledAt),
  statusIdx: index('idx_workflow_status').on(table.status),
  typeIdx: index('idx_workflow_type').on(table.workflowType),
}));

// Email queue table
export const emailQueue = pgTable('email_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  leadId: uuid('lead_id').references(() => leads.id),
  toEmail: varchar('to_email', { length: 255 }).notNull(),
  fromEmail: varchar('from_email', { length: 255 }).notNull(),
  subject: varchar('subject', { length: 500 }).notNull(),
  htmlContent: text('html_content').notNull(),
  textContent: text('text_content'),
  emailType: varchar('email_type', { length: 100 }).notNull(),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true, mode: 'string' }),
  sentAt: timestamp('sent_at', { withTimezone: true, mode: 'string' }),
  messageId: varchar('message_id', { length: 255 }),
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').notNull().default(0),
  maxRetries: integer('max_retries').notNull().default(3),
  metadata: jsonb('metadata'),
  trackingId: varchar('tracking_id', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  leadIdIdx: index('idx_email_queue_lead_id').on(table.leadId),
  statusIdx: index('idx_email_queue_status').on(table.status),
  scheduledForIdx: index('idx_email_queue_scheduled_for').on(table.scheduledFor),
  emailTypeIdx: index('idx_email_queue_email_type').on(table.emailType),
}));

// Schema version tracking tables
export const schemaVersions = pgTable('schema_versions', {
  id: integer('id').primaryKey(),
  versionNumber: varchar('version_number', { length: 50 }).notNull().unique(),
  migrationName: varchar('migration_name', { length: 255 }).notNull(),
  description: text('description'),
  checksum: varchar('checksum', { length: 64 }),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
  appliedBy: varchar('applied_by', { length: 100 }).default('current_user'),
  executionTimeMs: integer('execution_time_ms'),
  rollbackSql: text('rollback_sql'),
}, (table) => ({
  versionIdx: index('idx_schema_versions_version').on(table.versionNumber),
  appliedAtIdx: index('idx_schema_versions_applied_at').on(table.appliedAt),
}));

export const migrationLocks = pgTable('migration_locks', {
  id: integer('id').primaryKey().default(1),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  lockedBy: varchar('locked_by', { length: 100 }),
  migrationVersion: varchar('migration_version', { length: 50 }),
});

// Relations
export const agentsRelations = relations(agents, ({ many }) => ({
  assignedLeads: many(leads, { relationName: 'assignedAgent' }),
  updatedLeads: many(leads, { relationName: 'lastUpdatedBy' }),
  auditLogs: many(leadAuditLog),
}));

export const leadsRelations = relations(leads, ({ one, many }) => ({
  assignedAgent: one(agents, {
    fields: [leads.assignedAgentId],
    references: [agents.id],
    relationName: 'assignedAgent',
  }),
  lastUpdatedByAgent: one(agents, {
    fields: [leads.lastUpdatedBy],
    references: [agents.id],
    relationName: 'lastUpdatedBy',
  }),
  auditLogs: many(leadAuditLog),
  processingLogs: many(leadProcessingLogs),
  webhookEvents: many(webhookEvents),
  workflowAutomations: many(workflowAutomation),
}));

export const leadAuditLogRelations = relations(leadAuditLog, ({ one }) => ({
  lead: one(leads, {
    fields: [leadAuditLog.leadId],
    references: [leads.id],
  }),
  agent: one(agents, {
    fields: [leadAuditLog.agentId],
    references: [agents.id],
  }),
}));

export const leadProcessingLogsRelations = relations(leadProcessingLogs, ({ one }) => ({
  lead: one(leads, {
    fields: [leadProcessingLogs.leadId],
    references: [leads.id],
  }),
}));

export const webhookEventsRelations = relations(webhookEvents, ({ one }) => ({
  lead: one(leads, {
    fields: [webhookEvents.leadId],
    references: [leads.id],
  }),
}));

export const workflowAutomationRelations = relations(workflowAutomation, ({ one }) => ({
  lead: one(leads, {
    fields: [workflowAutomation.leadId],
    references: [leads.id],
  }),
}));

export const emailQueueRelations = relations(emailQueue, ({ one }) => ({
  lead: one(leads, {
    fields: [emailQueue.leadId],
    references: [leads.id],
  }),
}));
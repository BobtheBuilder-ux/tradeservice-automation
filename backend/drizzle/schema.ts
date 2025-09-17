import { pgTable, index, foreignKey, uuid, varchar, jsonb, boolean, text, integer, timestamp, unique } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const leadProcessingLogs = pgTable("lead_processing_logs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	leadId: uuid("lead_id"),
	trackingId: varchar("tracking_id", { length: 255 }),
	eventType: varchar("event_type", { length: 100 }).notNull(),
	eventData: jsonb("event_data"),
	success: boolean().default(true).notNull(),
	errorMessage: text("error_message"),
	processingTimeMs: integer("processing_time_ms"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_lead_logs_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_lead_logs_event_type").using("btree", table.eventType.asc().nullsLast().op("text_ops")),
	index("idx_lead_logs_lead_id").using("btree", table.leadId.asc().nullsLast().op("uuid_ops")),
	index("idx_lead_logs_success").using("btree", table.success.asc().nullsLast().op("bool_ops")),
	index("idx_lead_logs_tracking_id").using("btree", table.trackingId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.leadId],
			foreignColumns: [leads.id],
			name: "lead_processing_logs_lead_id_leads_id_fk"
		}).onDelete("cascade"),
]);

export const webhookEvents = pgTable("webhook_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	source: varchar({ length: 50 }).notNull(),
	eventType: varchar("event_type", { length: 100 }).notNull(),
	webhookId: varchar("webhook_id", { length: 255 }),
	leadId: uuid("lead_id"),
	trackingId: varchar("tracking_id", { length: 255 }),
	rawPayload: jsonb("raw_payload").notNull(),
	processedPayload: jsonb("processed_payload"),
	processingStatus: varchar("processing_status", { length: 50 }).default('pending').notNull(),
	processingAttempts: integer("processing_attempts").default(0).notNull(),
	lastProcessingAttempt: timestamp("last_processing_attempt", { withTimezone: true, mode: 'string' }),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	processedAt: timestamp("processed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_webhook_events_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_webhook_events_event_type").using("btree", table.eventType.asc().nullsLast().op("text_ops")),
	index("idx_webhook_events_lead_id").using("btree", table.leadId.asc().nullsLast().op("uuid_ops")),
	index("idx_webhook_events_processing_status").using("btree", table.processingStatus.asc().nullsLast().op("text_ops")),
	index("idx_webhook_events_source").using("btree", table.source.asc().nullsLast().op("text_ops")),
	index("idx_webhook_events_tracking_id").using("btree", table.trackingId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.leadId],
			foreignColumns: [leads.id],
			name: "webhook_events_lead_id_leads_id_fk"
		}).onDelete("set null"),
]);

export const workflowAutomation = pgTable("workflow_automation", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	leadId: uuid("lead_id").notNull(),
	workflowType: varchar("workflow_type", { length: 100 }).notNull(),
	stepName: varchar("step_name", { length: 255 }).notNull(),
	scheduledAt: timestamp("scheduled_at", { withTimezone: true, mode: 'string' }).notNull(),
	executedAt: timestamp("executed_at", { withTimezone: true, mode: 'string' }),
	status: varchar({ length: 50 }).default('pending').notNull(),
	retryCount: integer("retry_count").default(0).notNull(),
	maxRetries: integer("max_retries").default(3).notNull(),
	errorMessage: text("error_message"),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_workflow_lead_id").using("btree", table.leadId.asc().nullsLast().op("uuid_ops")),
	index("idx_workflow_scheduled_at").using("btree", table.scheduledAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_workflow_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_workflow_type").using("btree", table.workflowType.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.leadId],
			foreignColumns: [leads.id],
			name: "workflow_automation_lead_id_leads_id_fk"
		}).onDelete("cascade"),
]);

export const migrationLocks = pgTable("migration_locks", {
	id: integer().default(1).primaryKey().notNull(),
	lockedAt: timestamp("locked_at", { withTimezone: true, mode: 'string' }),
	lockedBy: varchar("locked_by", { length: 100 }),
	migrationVersion: varchar("migration_version", { length: 50 }),
});

export const schemaVersions = pgTable("schema_versions", {
	id: integer().primaryKey().notNull(),
	versionNumber: varchar("version_number", { length: 50 }).notNull(),
	migrationName: varchar("migration_name", { length: 255 }).notNull(),
	description: text(),
	checksum: varchar({ length: 64 }),
	appliedAt: timestamp("applied_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	appliedBy: varchar("applied_by", { length: 100 }).default('current_user'),
	executionTimeMs: integer("execution_time_ms"),
	rollbackSql: text("rollback_sql"),
}, (table) => [
	index("idx_schema_versions_applied_at").using("btree", table.appliedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_schema_versions_version").using("btree", table.versionNumber.asc().nullsLast().op("text_ops")),
	unique("schema_versions_version_number_unique").on(table.versionNumber),
]);

export const systemConfig = pgTable("system_config", {
	key: varchar({ length: 255 }).primaryKey().notNull(),
	value: jsonb().notNull(),
	description: text(),
	isSensitive: boolean("is_sensitive").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const leads = pgTable("leads", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	email: varchar({ length: 255 }).notNull(),
	firstName: varchar("first_name", { length: 255 }),
	lastName: varchar("last_name", { length: 255 }),
	fullName: varchar("full_name", { length: 255 }),
	phone: varchar({ length: 50 }),
	source: varchar({ length: 100 }).default('hubspot_crm').notNull(),
	status: varchar({ length: 50 }).default('new').notNull(),
	customFields: jsonb("custom_fields"),
	hubspotContactId: varchar("hubspot_contact_id", { length: 255 }),
	hubspotSyncStatus: varchar("hubspot_sync_status", { length: 50 }).default('pending').notNull(),
	hubspotLastSync: timestamp("hubspot_last_sync", { withTimezone: true, mode: 'string' }),
	hubspotErrorMessage: text("hubspot_error_message"),
	assignedAgentId: uuid("assigned_agent_id"),
	lastUpdatedBy: uuid("last_updated_by"),
	agentNotes: text("agent_notes"),
	followUpDate: timestamp("follow_up_date", { withTimezone: true, mode: 'string' }),
	priority: varchar({ length: 20 }).default('medium').notNull(),
	calendlyEventUri: text("calendly_event_uri"),
	calendlyInviteeUri: text("calendly_invitee_uri"),
	calendlyEventType: varchar("calendly_event_type", { length: 255 }),
	calendlyQuestions: jsonb("calendly_questions"),
	calendlyTrackingData: jsonb("calendly_tracking_data"),
	scheduledAt: timestamp("scheduled_at", { withTimezone: true, mode: 'string' }),
	meetingEndTime: timestamp("meeting_end_time", { withTimezone: true, mode: 'string' }),
	meetingLocation: text("meeting_location"),
	canceledAt: timestamp("canceled_at", { withTimezone: true, mode: 'string' }),
	cancellationReason: text("cancellation_reason"),
	rescheduledAt: timestamp("rescheduled_at", { withTimezone: true, mode: 'string' }),
	previousScheduledAt: timestamp("previous_scheduled_at", { withTimezone: true, mode: 'string' }),
	noShowAt: timestamp("no_show_at", { withTimezone: true, mode: 'string' }),
	lastCalendlyUpdate: timestamp("last_calendly_update", { withTimezone: true, mode: 'string' }),
	processingStatus: varchar("processing_status", { length: 50 }).default('pending').notNull(),
	processingAttempts: integer("processing_attempts").default(0).notNull(),
	lastProcessingAttempt: timestamp("last_processing_attempt", { withTimezone: true, mode: 'string' }),
	processingErrors: jsonb("processing_errors"),
	trackingId: varchar("tracking_id", { length: 255 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_leads_assigned_agent").using("btree", table.assignedAgentId.asc().nullsLast().op("uuid_ops")),
	index("idx_leads_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_leads_email").using("btree", table.email.asc().nullsLast().op("text_ops")),
	index("idx_leads_email_status").using("btree", table.email.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	index("idx_leads_priority_status").using("btree", table.priority.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	index("idx_leads_processing_status").using("btree", table.processingStatus.asc().nullsLast().op("text_ops")),
	index("idx_leads_scheduled_at").using("btree", table.scheduledAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_leads_source_created_at").using("btree", table.source.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_leads_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_leads_tracking_id").using("btree", table.trackingId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.assignedAgentId],
			foreignColumns: [agents.id],
			name: "leads_assigned_agent_id_agents_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.lastUpdatedBy],
			foreignColumns: [agents.id],
			name: "leads_last_updated_by_agents_id_fk"
		}).onDelete("set null"),
]);

export const leadAuditLog = pgTable("lead_audit_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	leadId: uuid("lead_id").notNull(),
	agentId: uuid("agent_id"),
	action: varchar({ length: 50 }).notNull(),
	fieldName: varchar("field_name", { length: 100 }),
	oldValue: text("old_value"),
	newValue: text("new_value"),
	notes: text(),
	ipAddress: varchar("ip_address", { length: 45 }),
	userAgent: text("user_agent"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_audit_log_action").using("btree", table.action.asc().nullsLast().op("text_ops")),
	index("idx_audit_log_agent_id").using("btree", table.agentId.asc().nullsLast().op("uuid_ops")),
	index("idx_audit_log_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_audit_log_lead_id").using("btree", table.leadId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.agentId],
			foreignColumns: [agents.id],
			name: "lead_audit_log_agent_id_agents_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.leadId],
			foreignColumns: [leads.id],
			name: "lead_audit_log_lead_id_leads_id_fk"
		}).onDelete("cascade"),
]);

export const agents = pgTable("agents", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	agentId: varchar("agent_id", { length: 50 }),
	email: varchar({ length: 255 }).notNull(),
	firstName: varchar("first_name", { length: 100 }),
	lastName: varchar("last_name", { length: 100 }),
	fullName: varchar("full_name", { length: 255 }),
	phone: varchar({ length: 50 }),
	role: varchar({ length: 20 }).default('agent').notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	lastLogin: timestamp("last_login", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	passwordHash: varchar("password_hash", { length: 255 }),
	emailVerified: boolean("email_verified").default(false).notNull(),
	verificationToken: varchar("verification_token", { length: 255 }),
	agentToken: varchar("agent_token", { length: 255 }),
	agentTokenExpires: timestamp("agent_token_expires", { withTimezone: true, mode: 'string' }),
	resetToken: varchar("reset_token", { length: 255 }),
	resetTokenExpires: timestamp("reset_token_expires", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_agents_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("idx_agents_agent_id").using("btree", table.agentId.asc().nullsLast().op("text_ops")),
	index("idx_agents_email").using("btree", table.email.asc().nullsLast().op("text_ops")),
	index("idx_agents_role").using("btree", table.role.asc().nullsLast().op("text_ops")),
	unique("agents_agent_id_unique").on(table.agentId),
	unique("agents_email_unique").on(table.email),
]);

export const emailQueue = pgTable("email_queue", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	leadId: uuid("lead_id"),
	toEmail: varchar("to_email", { length: 255 }).notNull(),
	fromEmail: varchar("from_email", { length: 255 }).notNull(),
	subject: varchar({ length: 500 }).notNull(),
	htmlContent: text("html_content").notNull(),
	textContent: text("text_content"),
	emailType: varchar("email_type", { length: 100 }).notNull(),
	status: varchar({ length: 50 }).default('pending').notNull(),
	scheduledFor: timestamp("scheduled_for", { withTimezone: true, mode: 'string' }),
	sentAt: timestamp("sent_at", { withTimezone: true, mode: 'string' }),
	messageId: varchar("message_id", { length: 255 }),
	errorMessage: text("error_message"),
	retryCount: integer("retry_count").default(0).notNull(),
	maxRetries: integer("max_retries").default(3).notNull(),
	metadata: jsonb(),
	trackingId: varchar("tracking_id", { length: 255 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_email_queue_email_type").using("btree", table.emailType.asc().nullsLast().op("text_ops")),
	index("idx_email_queue_lead_id").using("btree", table.leadId.asc().nullsLast().op("uuid_ops")),
	index("idx_email_queue_scheduled_for").using("btree", table.scheduledFor.asc().nullsLast().op("timestamptz_ops")),
	index("idx_email_queue_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.leadId],
			foreignColumns: [leads.id],
			name: "email_queue_lead_id_leads_id_fk"
		}),
]);

export const meetings = pgTable("meetings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	leadId: uuid("lead_id"),
	agentId: uuid("agent_id"),
	calendlyEventId: varchar("calendly_event_id", { length: 255 }),
	meetingType: varchar("meeting_type", { length: 100 }).default('consultation').notNull(),
	title: varchar({ length: 255 }).notNull(),
	description: text(),
	startTime: timestamp("start_time", { withTimezone: true, mode: 'string' }).notNull(),
	endTime: timestamp("end_time", { withTimezone: true, mode: 'string' }).notNull(),
	timezone: varchar({ length: 100 }).default('UTC').notNull(),
	status: varchar({ length: 50 }).default('scheduled').notNull(),
	meetingUrl: text("meeting_url"),
	location: text(),
	attendeeEmail: varchar("attendee_email", { length: 255 }),
	attendeeName: varchar("attendee_name", { length: 255 }),
	attendeePhone: varchar("attendee_phone", { length: 50 }),
	reminderSent: boolean("reminder_sent").default(false).notNull(),
	followUpSent: boolean("follow_up_sent").default(false).notNull(),
	reminder24HSent: boolean("reminder_24h_sent").default(false).notNull(),
	reminder1HSent: boolean("reminder_1h_sent").default(false).notNull(),
	sms24HSent: boolean("sms_24h_sent").default(false).notNull(),
	sms1HSent: boolean("sms_1h_sent").default(false).notNull(),
	reminder24HSentAt: timestamp("reminder_24h_sent_at", { withTimezone: true, mode: 'string' }),
	reminder1HSentAt: timestamp("reminder_1h_sent_at", { withTimezone: true, mode: 'string' }),
	notes: text(),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_meetings_agent_id").using("btree", table.agentId.asc().nullsLast().op("uuid_ops")),
	index("idx_meetings_calendly_event_id").using("btree", table.calendlyEventId.asc().nullsLast().op("text_ops")),
	index("idx_meetings_lead_id").using("btree", table.leadId.asc().nullsLast().op("uuid_ops")),
	index("idx_meetings_start_time").using("btree", table.startTime.asc().nullsLast().op("timestamptz_ops")),
	index("idx_meetings_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.agentId],
			foreignColumns: [agents.id],
			name: "meetings_agent_id_agents_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.leadId],
			foreignColumns: [leads.id],
			name: "meetings_lead_id_leads_id_fk"
		}).onDelete("cascade"),
	unique("meetings_calendly_event_id_unique").on(table.calendlyEventId),
]);

export const meetingReminders = pgTable("meeting_reminders", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	meetingId: uuid("meeting_id").notNull(),
	reminderType: varchar("reminder_type", { length: 50 }).notNull(),
	deliveryMethod: varchar("delivery_method", { length: 20 }).default('email').notNull(),
	scheduledFor: timestamp("scheduled_for", { withTimezone: true, mode: 'string' }).notNull(),
	sentAt: timestamp("sent_at", { withTimezone: true, mode: 'string' }),
	emailMessageId: varchar("email_message_id", { length: 255 }),
	smsMessageSid: varchar("sms_message_sid", { length: 255 }),
	status: varchar({ length: 50 }).default('pending').notNull(),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_meeting_reminders_meeting_id").using("btree", table.meetingId.asc().nullsLast().op("uuid_ops")),
	index("idx_meeting_reminders_scheduled_for").using("btree", table.scheduledFor.asc().nullsLast().op("timestamptz_ops")),
	index("idx_meeting_reminders_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.meetingId],
			foreignColumns: [meetings.id],
			name: "meeting_reminders_meeting_id_meetings_id_fk"
		}).onDelete("cascade"),
]);

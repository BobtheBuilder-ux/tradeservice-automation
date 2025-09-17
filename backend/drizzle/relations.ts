import { relations } from "drizzle-orm/relations";
import { leads, leadProcessingLogs, webhookEvents, workflowAutomation, agents, leadAuditLog, emailQueue, meetings, meetingReminders } from "./schema";

export const leadProcessingLogsRelations = relations(leadProcessingLogs, ({one}) => ({
	lead: one(leads, {
		fields: [leadProcessingLogs.leadId],
		references: [leads.id]
	}),
}));

export const leadsRelations = relations(leads, ({one, many}) => ({
	leadProcessingLogs: many(leadProcessingLogs),
	webhookEvents: many(webhookEvents),
	workflowAutomations: many(workflowAutomation),
	agent_assignedAgentId: one(agents, {
		fields: [leads.assignedAgentId],
		references: [agents.id],
		relationName: "leads_assignedAgentId_agents_id"
	}),
	agent_lastUpdatedBy: one(agents, {
		fields: [leads.lastUpdatedBy],
		references: [agents.id],
		relationName: "leads_lastUpdatedBy_agents_id"
	}),
	leadAuditLogs: many(leadAuditLog),
	emailQueues: many(emailQueue),
	meetings: many(meetings),
}));

export const webhookEventsRelations = relations(webhookEvents, ({one}) => ({
	lead: one(leads, {
		fields: [webhookEvents.leadId],
		references: [leads.id]
	}),
}));

export const workflowAutomationRelations = relations(workflowAutomation, ({one}) => ({
	lead: one(leads, {
		fields: [workflowAutomation.leadId],
		references: [leads.id]
	}),
}));

export const agentsRelations = relations(agents, ({many}) => ({
	leads_assignedAgentId: many(leads, {
		relationName: "leads_assignedAgentId_agents_id"
	}),
	leads_lastUpdatedBy: many(leads, {
		relationName: "leads_lastUpdatedBy_agents_id"
	}),
	leadAuditLogs: many(leadAuditLog),
	meetings: many(meetings),
}));

export const leadAuditLogRelations = relations(leadAuditLog, ({one}) => ({
	agent: one(agents, {
		fields: [leadAuditLog.agentId],
		references: [agents.id]
	}),
	lead: one(leads, {
		fields: [leadAuditLog.leadId],
		references: [leads.id]
	}),
}));

export const emailQueueRelations = relations(emailQueue, ({one}) => ({
	lead: one(leads, {
		fields: [emailQueue.leadId],
		references: [leads.id]
	}),
}));

export const meetingsRelations = relations(meetings, ({one, many}) => ({
	agent: one(agents, {
		fields: [meetings.agentId],
		references: [agents.id]
	}),
	lead: one(leads, {
		fields: [meetings.leadId],
		references: [leads.id]
	}),
	meetingReminders: many(meetingReminders),
}));

export const meetingRemindersRelations = relations(meetingReminders, ({one}) => ({
	meeting: one(meetings, {
		fields: [meetingReminders.meetingId],
		references: [meetings.id]
	}),
}));
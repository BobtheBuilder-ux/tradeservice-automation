import logger from '../utils/logger.js';
import EmailService from './email-service.js';
import bobOrchestrator from './bob-orchestrator.js';
import insforgeDataService from './insforge-data-service.js';
import { hashForLogging } from '../utils/crypto.js';

export async function checkDatabaseConnection() {
  await insforgeDataService.getDefaultTenant();
  return true;
}

export async function findLeadByHubSpotId(hubspotContactId, trackingId) {
  const rows = await insforgeDataService.listRecentLeads(10000);
  const lead = rows.find((row) => row.hubspotContactId === hubspotContactId) || null;
  logger.logLeadProcessing(trackingId, lead ? 'database_lead_found' : 'database_lead_not_found', {
    hubspotContactId,
    leadId: lead?.id,
  });
  return lead;
}

export async function findLeadByEmail(email, trackingId) {
  const lead = await insforgeDataService.getLeadByEmail(email);
  logger.logLeadProcessing(trackingId, lead ? 'database_lead_found_by_email' : 'database_lead_not_found_by_email', {
    email: hashForLogging(email),
    leadId: lead?.id,
  });
  return lead;
}

function mapHubSpotLead(leadData = {}) {
  return {
    hubspotContactId: leadData.hubspot_contact_id,
    email: leadData.email,
    firstName: leadData.first_name,
    lastName: leadData.last_name,
    fullName: leadData.full_name,
    phone: leadData.phone,
    customFields: leadData.custom_properties || leadData.hubspot_raw_data || {},
    status: 'new',
    source: 'hubspot_crm',
    updatedAt: new Date(),
  };
}

export async function createLead(leadData, trackingId) {
  const data = await insforgeDataService.createLead({
    ...mapHubSpotLead(leadData),
    createdAt: new Date(),
  });

  if (data.assignedAgentId) {
    try {
      const assignedAgent = await insforgeDataService.getAgentById(data.assignedAgentId);
      if (assignedAgent?.email) {
        await EmailService.sendLeadNotification(assignedAgent.email, data, trackingId);
      }
    } catch (notificationError) {
      logger.logError(notificationError, {
        context: 'lead_notification_failed',
        trackingId,
        leadId: data.id,
      });
    }
  }

  await bobOrchestrator.syncLead(data);
  return data;
}

export async function updateLead(leadId, leadData, trackingId) {
  const data = await insforgeDataService.updateLead(leadId, mapHubSpotLead(leadData));
  if (data) await bobOrchestrator.syncLead(data);
  return data;
}

export async function upsertLeadToDatabase(leadData, trackingId) {
  let existingLead = await findLeadByHubSpotId(leadData.hubspot_contact_id, trackingId);
  if (!existingLead && leadData.email) {
    existingLead = await findLeadByEmail(leadData.email, trackingId);
  }

  const lead = existingLead
    ? await updateLead(existingLead.id, leadData, trackingId)
    : await createLead(leadData, trackingId);

  return {
    ...lead,
    operation: existingLead ? 'updated' : 'created',
  };
}

export async function updateLeadStatus(leadId, status) {
  return insforgeDataService.updateLead(leadId, {
    status,
    updatedAt: new Date(),
  });
}

export async function getActiveAgentEmails() {
  const agents = await insforgeDataService.listAdminAgents();
  return agents.filter((agent) => agent.isActive).map((agent) => agent.email).filter(Boolean);
}

/**
 * Lead Automation Service
 * Handles the complete automated workflow for new leads:
 * 1. Auto-assign lead to agent with lowest lead count
 * 2. Generate Calendly scheduling link for assigned agent
 * 3. Create Zoom meeting for the lead
 * 4. Send notification emails
 */

import { db } from '../config/index.js';
import { leads, agents, agentIntegrations } from '../db/schema.js';
import { eq, desc, isNull, and, count } from 'drizzle-orm';
import logger from '../utils/logger.js';
import { generateTrackingId } from '../utils/crypto.js';

class LeadAutomationService {
  constructor() {
    this.isRunning = false;
  }

  /**
   * Execute complete automation workflow for a new lead
   * @param {string} leadId - The lead ID to process
   * @param {string} trackingId - Optional tracking ID for logging
   * @returns {Promise<Object>} - Result of automation workflow
   */
  async executeCompleteWorkflow(leadId, trackingId = null) {
    if (!trackingId) {
      trackingId = generateTrackingId();
    }

    try {
      logger.info('🚀 Starting complete automation workflow', {
        trackingId,
        leadId
      });

      console.log(`🚀 AUTOMATION: Starting complete workflow for lead ${leadId}`);

      // Step 1: Auto-assign lead to agent
      const assignmentResult = await this.autoAssignLead(leadId, trackingId);
      if (!assignmentResult.success) {
        throw new Error(`Lead assignment failed: ${assignmentResult.error}`);
      }

      console.log(`✅ AUTOMATION: Lead assigned to agent ${assignmentResult.agent?.name || 'Unknown'}`);

      // Step 2: Generate Calendly scheduling link
      const calendlyResult = await this.generateCalendlyLink(leadId, trackingId);
      if (!calendlyResult.success) {
        logger.warn('Calendly link generation failed, continuing workflow', {
          trackingId,
          leadId,
          error: calendlyResult.error
        });
        console.log(`⚠️ AUTOMATION: Calendly link generation failed - ${calendlyResult.error}`);
      } else {
        console.log(`✅ AUTOMATION: Calendly link generated successfully`);
      }

      // Step 3: Create Zoom meeting
      const zoomResult = await this.createZoomMeeting(leadId, trackingId);
      if (!zoomResult.success) {
        logger.warn('Zoom meeting creation failed, continuing workflow', {
          trackingId,
          leadId,
          error: zoomResult.error
        });
        console.log(`⚠️ AUTOMATION: Zoom meeting creation failed - ${zoomResult.error}`);
      } else {
        console.log(`✅ AUTOMATION: Zoom meeting created successfully`);
      }

      // Compile results
      const workflowResult = {
        success: true,
        leadId,
        trackingId,
        steps: {
          assignment: assignmentResult,
          calendly: calendlyResult,
          zoom: zoomResult
        },
        completedSteps: [
          assignmentResult.success ? 'assignment' : null,
          calendlyResult.success ? 'calendly' : null,
          zoomResult.success ? 'zoom' : null
        ].filter(Boolean),
        failedSteps: [
          !assignmentResult.success ? 'assignment' : null,
          !calendlyResult.success ? 'calendly' : null,
          !zoomResult.success ? 'zoom' : null
        ].filter(Boolean)
      };

      logger.info('🎉 Complete automation workflow finished', {
        trackingId,
        leadId,
        completedSteps: workflowResult.completedSteps,
        failedSteps: workflowResult.failedSteps
      });

      console.log(`🎉 AUTOMATION: Workflow completed for lead ${leadId}`);
      console.log(`   ✅ Completed: ${workflowResult.completedSteps.join(', ')}`);
      if (workflowResult.failedSteps.length > 0) {
        console.log(`   ❌ Failed: ${workflowResult.failedSteps.join(', ')}`);
      }

      return workflowResult;

    } catch (error) {
      logger.error('❌ Complete automation workflow failed', {
        trackingId,
        leadId,
        error: error.message,
        stack: error.stack
      });

      console.log(`❌ AUTOMATION: Workflow failed for lead ${leadId} - ${error.message}`);

      return {
        success: false,
        leadId,
        trackingId,
        error: error.message,
        steps: {},
        completedSteps: [],
        failedSteps: ['workflow_execution']
      };
    }
  }

  /**
   * Auto-assign lead to agent with lowest lead count
   * @param {string} leadId - The lead ID to assign
   * @param {string} trackingId - Tracking ID for logging
   * @returns {Promise<Object>} - Assignment result
   */
  async autoAssignLead(leadId, trackingId) {
    try {
      console.log(`🎯 AUTOMATION: Auto-assigning lead ${leadId}`);

      // Check if lead exists and is not already assigned
      const existingLead = await db.select({
        id: leads.id,
        email: leads.email,
        firstName: leads.firstName,
        lastName: leads.lastName,
        fullName: leads.fullName,
        assignedAgentId: leads.assignedAgentId,
        status: leads.status
      })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

      if (!existingLead || existingLead.length === 0) {
        throw new Error('Lead not found');
      }

      const lead = existingLead[0];

      if (lead.assignedAgentId) {
        return {
          success: true,
          message: 'Lead already assigned',
          lead,
          agent: null,
          alreadyAssigned: true
        };
      }

      // Get agents with their current lead counts, ordered by lead count (ascending)
      const agentsWithLeadCounts = await db.select({
        id: agents.id,
        agentId: agents.agentId,
        firstName: agents.firstName,
        lastName: agents.lastName,
        fullName: agents.fullName,
        email: agents.email,
        leadCount: count(leads.id)
      })
      .from(agents)
      .leftJoin(leads, eq(agents.id, leads.assignedAgentId))
      .where(and(
        eq(agents.isActive, true),
        eq(agents.emailVerified, true)
      ))
      .groupBy(agents.id, agents.agentId, agents.firstName, agents.lastName, agents.fullName, agents.email)
      .orderBy(count(leads.id), agents.firstName);

      if (!agentsWithLeadCounts || agentsWithLeadCounts.length === 0) {
        throw new Error('No available agents found');
      }

      // Select the agent with the lowest lead count
      const selectedAgent = agentsWithLeadCounts[0];

      // Update the lead assignment
      const updatedLead = await db.update(leads)
        .set({
          assignedAgentId: selectedAgent.id,
          status: 'assigned',
          updatedAt: new Date()
        })
        .where(eq(leads.id, leadId))
        .returning({
          id: leads.id,
          email: leads.email,
          firstName: leads.firstName,
          lastName: leads.lastName,
          fullName: leads.fullName,
          assignedAgentId: leads.assignedAgentId,
          status: leads.status,
          updatedAt: leads.updatedAt
        });

      if (!updatedLead || updatedLead.length === 0) {
        throw new Error('Failed to assign lead');
      }

      logger.info('✅ Lead auto-assigned successfully', {
        trackingId,
        leadId,
        agentId: selectedAgent.id,
        agentName: selectedAgent.fullName || selectedAgent.firstName,
        previousLeadCount: selectedAgent.leadCount
      });

      return {
        success: true,
        message: 'Lead automatically assigned successfully',
        lead: updatedLead[0],
        agent: {
          id: selectedAgent.id,
          agentId: selectedAgent.agentId,
          name: selectedAgent.fullName || selectedAgent.firstName,
          email: selectedAgent.email,
          previousLeadCount: selectedAgent.leadCount
        }
      };

    } catch (error) {
      logger.error('❌ Auto-assignment failed', {
        trackingId,
        leadId,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        lead: null,
        agent: null
      };
    }
  }

  /**
   * Generate Calendly scheduling link for assigned agent
   * @param {string} leadId - The lead ID
   * @param {string} trackingId - Tracking ID for logging
   * @returns {Promise<Object>} - Calendly link result
   */
  async generateCalendlyLink(leadId, trackingId) {
    try {
      console.log(`📅 AUTOMATION: Generating Calendly link for lead ${leadId}`);

      // Get lead details with assigned agent
      const leadWithAgent = await db.select({
        leadId: leads.id,
        leadEmail: leads.email,
        leadFirstName: leads.firstName,
        leadLastName: leads.lastName,
        leadFullName: leads.fullName,
        assignedAgentId: leads.assignedAgentId,
        agentId: agents.agentId,
        agentFirstName: agents.firstName,
        agentLastName: agents.lastName,
        agentFullName: agents.fullName,
        agentEmail: agents.email
      })
      .from(leads)
      .leftJoin(agents, eq(leads.assignedAgentId, agents.id))
      .where(eq(leads.id, leadId))
      .limit(1);

      if (!leadWithAgent || leadWithAgent.length === 0) {
        throw new Error('Lead not found');
      }

      const lead = leadWithAgent[0];

      if (!lead.assignedAgentId) {
        throw new Error('Lead must be assigned to an agent first');
      }

      // Get agent's Calendly integration
      const agentIntegration = await db.select({
        calendlyAccessToken: agentIntegrations.calendlyAccessToken
      })
      .from(agentIntegrations)
      .where(eq(agentIntegrations.agentId, lead.assignedAgentId))
      .limit(1);

      if (!agentIntegration || agentIntegration.length === 0 || !agentIntegration[0].calendlyAccessToken) {
        throw new Error('Agent does not have Calendly integration configured');
      }

      const { calendlyAccessToken } = agentIntegration[0];

      // Get agent's Calendly user info
      const userResponse = await fetch('https://api.calendly.com/users/me', {
        headers: {
          'Authorization': `Bearer ${calendlyAccessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!userResponse.ok) {
        throw new Error(`Failed to get Calendly user info: ${userResponse.status}`);
      }

      const userData = await userResponse.json();
      const userUri = userData.resource.uri;

      // Get agent's event types
      const eventTypesResponse = await fetch(`https://api.calendly.com/event_types?user=${userUri}`, {
        headers: {
          'Authorization': `Bearer ${calendlyAccessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!eventTypesResponse.ok) {
        throw new Error(`Failed to get event types: ${eventTypesResponse.status}`);
      }

      const eventTypesData = await eventTypesResponse.json();
      
      if (!eventTypesData.collection || eventTypesData.collection.length === 0) {
        throw new Error('No event types found for agent');
      }

      // Use the first active event type
      const eventType = eventTypesData.collection.find(et => et.active) || eventTypesData.collection[0];
      
      // Construct scheduling URL with pre-filled information
      const schedulingUrl = new URL(eventType.scheduling_url);
      
      // Add UTM parameters and lead info
      schedulingUrl.searchParams.set('utm_source', 'lead_automation');
      schedulingUrl.searchParams.set('utm_medium', 'email');
      schedulingUrl.searchParams.set('utm_campaign', 'lead_scheduling');
      schedulingUrl.searchParams.set('lead_id', leadId);
      
      // Pre-fill lead information if available
      if (lead.leadFirstName) {
        schedulingUrl.searchParams.set('name', `${lead.leadFirstName} ${lead.leadLastName || ''}`.trim());
      }
      if (lead.leadEmail) {
        schedulingUrl.searchParams.set('email', lead.leadEmail);
      }

      logger.info('✅ Calendly link generated successfully', {
        trackingId,
        leadId,
        agentId: lead.agentId,
        eventTypeId: eventType.uri,
        schedulingUrl: schedulingUrl.toString()
      });

      return {
        success: true,
        message: 'Calendly scheduling link generated successfully',
        schedulingUrl: schedulingUrl.toString(),
        eventType: {
          name: eventType.name,
          duration: eventType.duration,
          uri: eventType.uri
        },
        lead: {
          id: lead.leadId,
          name: lead.leadFullName || lead.leadFirstName,
          email: lead.leadEmail
        },
        agent: {
          id: lead.agentId,
          name: lead.agentFullName || lead.agentFirstName,
          email: lead.agentEmail
        }
      };

    } catch (error) {
      logger.error('❌ Calendly link generation failed', {
        trackingId,
        leadId,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        schedulingUrl: null
      };
    }
  }

  /**
   * Create Zoom meeting for the lead
   * @param {string} leadId - The lead ID
   * @param {string} trackingId - Tracking ID for logging
   * @returns {Promise<Object>} - Zoom meeting result
   */
  async createZoomMeeting(leadId, trackingId) {
    try {
      console.log(`🔍 AUTOMATION: Creating Zoom meeting for lead ${leadId}`);

      // Get lead details with assigned agent
      const leadWithAgent = await db.select({
        leadId: leads.id,
        leadEmail: leads.email,
        leadFirstName: leads.firstName,
        leadLastName: leads.lastName,
        leadFullName: leads.fullName,
        assignedAgentId: leads.assignedAgentId,
        agentId: agents.agentId,
        agentFirstName: agents.firstName,
        agentLastName: agents.lastName,
        agentFullName: agents.fullName,
        agentEmail: agents.email
      })
      .from(leads)
      .leftJoin(agents, eq(leads.assignedAgentId, agents.id))
      .where(eq(leads.id, leadId))
      .limit(1);

      if (!leadWithAgent || leadWithAgent.length === 0) {
        throw new Error('Lead not found');
      }

      const lead = leadWithAgent[0];

      if (!lead.assignedAgentId) {
        throw new Error('Lead must be assigned to an agent first');
      }

      // Get agent's Zoom integration
      const agentIntegration = await db.select({
        zoomAccessToken: agentIntegrations.zoomAccessToken,
        zoomRefreshToken: agentIntegrations.zoomRefreshToken
      })
      .from(agentIntegrations)
      .where(eq(agentIntegrations.agentId, lead.assignedAgentId))
      .limit(1);

      if (!agentIntegration || agentIntegration.length === 0 || !agentIntegration[0].zoomAccessToken) {
        throw new Error('Agent does not have Zoom integration configured');
      }

      const { zoomAccessToken } = agentIntegration[0];

      // Prepare meeting data
      const meetingData = {
        topic: `Meeting with ${lead.leadFullName || lead.leadFirstName}`,
        type: 2, // Scheduled meeting
        start_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Default to tomorrow
        duration: 30,
        agenda: `Meeting with lead ${lead.leadFullName || lead.leadFirstName} (${lead.leadEmail})`,
        settings: {
          host_video: true,
          participant_video: true,
          join_before_host: true,
          mute_upon_entry: false,
          watermark: false,
          use_pmi: false,
          approval_type: 2, // No registration required
          audio: 'both', // Both telephony and VoIP
          auto_recording: 'none'
        }
      };

      // Create Zoom meeting using agent's access token
      const zoomResponse = await fetch('https://api.zoom.us/v2/users/me/meetings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${zoomAccessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(meetingData)
      });

      if (!zoomResponse.ok) {
        const errorData = await zoomResponse.text();
        throw new Error(`Zoom API error: ${zoomResponse.status} ${zoomResponse.statusText} - ${errorData}`);
      }

      const zoomMeeting = await zoomResponse.json();

      logger.info('✅ Zoom meeting created successfully', {
        trackingId,
        leadId,
        meetingId: zoomMeeting.id,
        joinUrl: zoomMeeting.join_url
      });

      return {
        success: true,
        message: 'Zoom meeting created successfully',
        meeting: {
          id: zoomMeeting.id,
          topic: zoomMeeting.topic,
          start_time: zoomMeeting.start_time,
          duration: zoomMeeting.duration,
          join_url: zoomMeeting.join_url,
          start_url: zoomMeeting.start_url,
          password: zoomMeeting.password,
          agenda: zoomMeeting.agenda
        },
        lead: {
          id: lead.leadId,
          name: lead.leadFullName || lead.leadFirstName,
          email: lead.leadEmail
        },
        agent: {
          id: lead.agentId,
          name: lead.agentFullName || lead.agentFirstName,
          email: lead.agentEmail
        }
      };

    } catch (error) {
      logger.error('❌ Zoom meeting creation failed', {
        trackingId,
        leadId,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        meeting: null
      };
    }
  }

  /**
   * Get automation status for a lead
   * @param {string} leadId - The lead ID
   * @returns {Promise<Object>} - Automation status
   */
  async getAutomationStatus(leadId) {
    try {
      // Get lead with assigned agent
      const leadWithAgent = await db.select({
        leadId: leads.id,
        leadEmail: leads.email,
        leadFirstName: leads.firstName,
        leadLastName: leads.lastName,
        leadFullName: leads.fullName,
        assignedAgentId: leads.assignedAgentId,
        status: leads.status,
        createdAt: leads.createdAt,
        updatedAt: leads.updatedAt,
        agentId: agents.agentId,
        agentFirstName: agents.firstName,
        agentLastName: agents.lastName,
        agentFullName: agents.fullName,
        agentEmail: agents.email
      })
      .from(leads)
      .leftJoin(agents, eq(leads.assignedAgentId, agents.id))
      .where(eq(leads.id, leadId))
      .limit(1);

      if (!leadWithAgent || leadWithAgent.length === 0) {
        return {
          success: false,
          error: 'Lead not found',
          status: null
        };
      }

      const lead = leadWithAgent[0];

      // Check agent integrations if assigned
      let agentIntegrationsData = null;
      if (lead.assignedAgentId) {
        const integrations = await db.select({
          calendlyAccessToken: agentIntegrations.calendlyAccessToken,
          zoomAccessToken: agentIntegrations.zoomAccessToken
        })
        .from(agentIntegrations)
        .where(eq(agentIntegrations.agentId, lead.assignedAgentId))
        .limit(1);

        agentIntegrationsData = integrations[0] || null;
      }

      return {
        success: true,
        lead: {
          id: lead.leadId,
          name: lead.leadFullName || lead.leadFirstName,
          email: lead.leadEmail,
          status: lead.status,
          createdAt: lead.createdAt,
          updatedAt: lead.updatedAt
        },
        agent: lead.assignedAgentId ? {
          id: lead.agentId,
          name: lead.agentFullName || lead.agentFirstName,
          email: lead.agentEmail,
          hasCalendlyIntegration: !!(agentIntegrationsData?.calendlyAccessToken),
          hasZoomIntegration: !!(agentIntegrationsData?.zoomAccessToken)
        } : null,
        automationStatus: {
          isAssigned: !!lead.assignedAgentId,
          canGenerateCalendlyLink: !!(lead.assignedAgentId && agentIntegrationsData?.calendlyAccessToken),
          canCreateZoomMeeting: !!(lead.assignedAgentId && agentIntegrationsData?.zoomAccessToken),
          readyForAutomation: !!(lead.assignedAgentId && agentIntegrationsData?.calendlyAccessToken && agentIntegrationsData?.zoomAccessToken)
        }
      };

    } catch (error) {
      logger.error('❌ Failed to get automation status', {
        leadId,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        status: null
      };
    }
  }
}

export default new LeadAutomationService();
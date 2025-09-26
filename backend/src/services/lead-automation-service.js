/**
 * Lead Automation Service
 * Handles the complete automated workflow for new leads:
 * 1. Auto-assign lead to agent with lowest lead count
 * 2. Generate Calendly scheduling link for assigned agent
 * 3. Send notification emails with Calendly link
 */

import { db } from '../config/index.js';
import { leads, agents, agentIntegrations } from '../db/schema.js';
import { eq, desc, isNull, and, count, not } from 'drizzle-orm';
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
      let calendlyResult;
      
      if (!assignmentResult.success) {
        // If assignment fails due to no agents with Calendly integration, 
        // use fallback mechanism with main Calendly link
        if (assignmentResult.error && assignmentResult.error.includes('No available agents with Calendly integration')) {
          logger.warn('Lead assignment failed - no agents with Calendly integration available, using fallback', {
            trackingId,
            leadId,
            error: assignmentResult.error
          });
          console.log(`⚠️ AUTOMATION: Lead assignment failed - ${assignmentResult.error}`);
          console.log(`🔄 AUTOMATION: Using fallback mechanism with main Calendly link`);
          
          // Use fallback mechanism
          calendlyResult = await this.sendFallbackCalendlyEmail(leadId, trackingId);
          
        } else {
          throw new Error(`Lead assignment failed: ${assignmentResult.error}`);
        }
      } else {
        console.log(`✅ AUTOMATION: Lead assigned to agent ${assignmentResult.agent?.name || 'Unknown'}`);

        // Step 2: Generate Calendly scheduling link and send email
        calendlyResult = await this.generateCalendlyLinkAndSendEmail(leadId, trackingId);
      }
      
      if (!calendlyResult.success) {
        logger.warn('Calendly link generation and email sending failed, continuing workflow', {
          trackingId,
          leadId,
          error: calendlyResult.error
        });
        console.log(`⚠️ AUTOMATION: Calendly link generation and email sending failed - ${calendlyResult.error}`);
      } else {
        console.log(`✅ AUTOMATION: Calendly link generated and email sent successfully`);
      }

      // Compile results
      const workflowResult = {
        success: true,
        leadId,
        trackingId,
        steps: {
          assignment: assignmentResult,
          calendly: calendlyResult
        },
        completedSteps: [
          assignmentResult.success ? 'assignment' : null,
          calendlyResult.success ? 'calendly' : null
        ].filter(Boolean),
        failedSteps: [
          !assignmentResult.success ? 'assignment' : null,
          !calendlyResult.success ? 'calendly' : null
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
      // Only include agents who have Calendly integration configured
      const agentsWithLeadCounts = await db.select({
        id: agents.id,
        agentId: agents.agentId,
        firstName: agents.firstName,
        lastName: agents.lastName,
        fullName: agents.fullName,
        email: agents.email,
        leadCount: count(leads.id),
        calendlyAccessToken: agentIntegrations.calendlyAccessToken
      })
      .from(agents)
      .leftJoin(leads, eq(agents.id, leads.assignedAgentId))
      .leftJoin(agentIntegrations, eq(agents.id, agentIntegrations.agentId))
      .where(and(
        eq(agents.isActive, true),
        eq(agents.emailVerified, true),
        not(isNull(agentIntegrations.calendlyAccessToken)) // Only agents with Calendly integration
      ))
      .groupBy(agents.id, agents.agentId, agents.firstName, agents.lastName, agents.fullName, agents.email, agentIntegrations.calendlyAccessToken)
      .orderBy(count(leads.id), agents.firstName);

      if (!agentsWithLeadCounts || agentsWithLeadCounts.length === 0) {
        throw new Error('No available agents with Calendly integration found');
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
 * Generate Calendly link and send email for the lead
 * @param {string} leadId - Lead ID
 * @param {string} trackingId - Tracking ID for logging
 * @returns {Promise<Object>} - Calendly link and email result
 */
  /**
   * Generate Calendly scheduling link and send email to lead
   * @param {string} leadId - The lead ID
   * @param {string} trackingId - Tracking ID for logging
   * @returns {Promise<Object>} - Combined result
   */
  async generateCalendlyLinkAndSendEmail(leadId, trackingId) {
    try {
      console.log(`📅 AUTOMATION: Generating Calendly link and sending email for lead ${leadId}`);

      // First generate the Calendly link
      const calendlyResult = await this.generateCalendlyLink(leadId, trackingId);
      if (!calendlyResult.success) {
        return calendlyResult;
      }

      // Get lead details for email
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

      // Import and use the Calendly email service
      const CalendlyEmailService = (await import('./calendly-email-service.js')).default;
      
      // Send appointment email with Calendly link
      const emailResult = await CalendlyEmailService.sendAppointmentEmail(
        {
          id: lead.leadId,
          email: lead.leadEmail,
          full_name: lead.leadFullName || lead.leadFirstName,
          first_name: lead.leadFirstName,
          last_name: lead.leadLastName
        },
        calendlyResult.schedulingUrl,
        trackingId
      );

      if (!emailResult.success) {
        logger.warn('Email sending failed after successful Calendly link generation', {
          trackingId,
          leadId,
          error: emailResult.error
        });
      }

      return {
        success: true,
        message: 'Calendly link generated and email sent successfully',
        schedulingUrl: calendlyResult.schedulingUrl,
        emailSent: emailResult.success,
        emailError: emailResult.success ? null : emailResult.error,
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
      logger.error('❌ Calendly link generation and email sending failed', {
        trackingId,
        leadId,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        schedulingUrl: null,
        emailSent: false
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
          calendlyAccessToken: agentIntegrations.calendlyAccessToken
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
          hasCalendlyIntegration: !!(agentIntegrationsData?.calendlyAccessToken)
        } : null,
        automationStatus: {
          isAssigned: !!lead.assignedAgentId,
          canGenerateCalendlyLink: !!(lead.assignedAgentId && agentIntegrationsData?.calendlyAccessToken),
          readyForAutomation: !!(lead.assignedAgentId && agentIntegrationsData?.calendlyAccessToken)
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

  /**
   * Send fallback Calendly email using main Calendly link via N8N webhook
   * @param {string} leadId - The lead ID
   * @param {string} trackingId - Tracking ID for logging
   * @returns {Promise<Object>} - Email sending result
   */
  async sendFallbackCalendlyEmail(leadId, trackingId) {
    try {
      console.log(`📧 AUTOMATION: Sending fallback Calendly email for lead ${leadId}`);

      // Get lead details
      const leadData = await db.select()
        .from(leads)
        .where(eq(leads.id, leadId))
        .limit(1);

      if (!leadData || leadData.length === 0) {
        throw new Error('Lead not found');
      }

      const lead = leadData[0];

      // Import calendlyConfig here to avoid circular dependency
      const { calendlyConfig } = await import('../config/index.js');
      
      if (!calendlyConfig.schedulingUrl) {
        throw new Error('Main Calendly scheduling URL not configured');
      }

      // Prepare data for N8N webhook
      const webhookData = {
        to: lead.email,
        template_type: 'appointment_scheduling',
        lead_data: {
          id: lead.id,
          full_name: lead.fullName || `${lead.firstName} ${lead.lastName}`.trim(),
          name: lead.fullName || `${lead.firstName} ${lead.lastName}`.trim(),
          email: lead.email,
          phone: lead.phone,
          company: lead.company
        },
        calendly_link: calendlyConfig.schedulingUrl,
        metadata: {
          trackingId,
          fallback: true,
          reason: 'no_agent_calendly_integration'
        }
      };

      // Send request to N8N webhook
      const response = await fetch('http://localhost:3001/webhook/n8n/send-template-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(webhookData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`N8N webhook failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      logger.info('✅ Fallback Calendly email sent successfully via N8N webhook', {
        trackingId,
        leadId,
        email: lead.email,
        calendlyLink: calendlyConfig.schedulingUrl,
        queueId: result.queueId
      });

      console.log(`✅ AUTOMATION: Fallback Calendly email sent successfully`);
      console.log(`   📧 Email: ${lead.email}`);
      console.log(`   🔗 Calendly Link: ${calendlyConfig.schedulingUrl}`);

      return {
        success: true,
        leadId,
        trackingId,
        email: lead.email,
        calendlyLink: calendlyConfig.schedulingUrl,
        fallback: true,
        queueId: result.queueId,
        webhookResponse: result
      };

    } catch (error) {
      logger.error('❌ Failed to send fallback Calendly email', {
        trackingId,
        leadId,
        error: error.message
      });

      console.log(`❌ AUTOMATION: Fallback Calendly email failed - ${error.message}`);

      return {
        success: false,
        leadId,
        trackingId,
        error: error.message,
        fallback: true
      };
    }
  }
}

export default new LeadAutomationService();
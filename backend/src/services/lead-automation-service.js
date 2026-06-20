import logger from '../utils/logger.js';
import insforgeDataService from './insforge-data-service.js';
import bobOrchestrator from './bob-orchestrator.js';

class LeadAutomationService {
  async executeCompleteWorkflow(leadId, trackingId, context = {}) {
    try {
      const lead = await insforgeDataService.getLeadById(leadId, context);
      if (!lead) {
        return {
          success: false,
          leadId,
          trackingId,
          error: 'Lead not found',
          completedSteps: [],
          failedSteps: ['load_lead'],
          steps: {},
        };
      }

      const automation = await bobOrchestrator.syncLead(lead);
      return {
        success: true,
        leadId,
        trackingId,
        completedSteps: ['bob_sync'],
        failedSteps: [],
        steps: {
          bobSync: automation,
        },
      };
    } catch (error) {
      logger.error('Lead automation workflow failed', {
        leadId,
        trackingId,
        error: error.message,
      });

      return {
        success: false,
        leadId,
        trackingId,
        error: error.message,
        completedSteps: [],
        failedSteps: ['bob_sync'],
        steps: {},
      };
    }
  }

  async getAutomationStatus(leadId, context = {}) {
    try {
      const [lead, actions] = await Promise.all([
        insforgeDataService.getLeadById(leadId, context),
        insforgeDataService.listBobActions(10000, context),
      ]);

      if (!lead) {
        return {
          success: false,
          leadId,
          error: 'Lead not found',
        };
      }

      const agent = lead.assignedAgentId
        ? await insforgeDataService.getAgentById(lead.assignedAgentId)
        : null;

      return {
        success: true,
        lead,
        agent,
        automationStatus: {
          bobActions: actions.filter((action) => action.leadId === leadId),
          status: lead.automationPaused ? 'paused' : 'active',
          requiresHumanReview: Boolean(lead.requiresHumanReview),
        },
      };
    } catch (error) {
      logger.error('Failed to load automation status', {
        leadId,
        error: error.message,
      });

      return {
        success: false,
        leadId,
        error: error.message,
      };
    }
  }
}

export default new LeadAutomationService();

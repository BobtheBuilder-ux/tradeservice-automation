import logger from '../utils/logger.js';
import bobDecisionEngine from './bob-decision-engine.js';
import leadConversationService from './lead-conversation-service.js';
import insforgeDataService from './insforge-data-service.js';

class BobOrchestrator {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.intervalMs = 5 * 60 * 1000;
  }

  start() {
    if (this.isRunning) {
      logger.info('Bob orchestrator already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting Bob orchestrator', { intervalMs: this.intervalMs });
    this.runCycle().catch((error) => {
      logger.error('Initial Bob orchestrator cycle failed', {
        error: error.message,
        stack: error.stack,
      });
    });

    this.intervalId = setInterval(() => {
      this.runCycle().catch((error) => {
        logger.error('Bob orchestrator cycle failed', {
          error: error.message,
          stack: error.stack,
        });
      });
    }, this.intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
  }

  async getLatestOpenAction(leadId) {
    return insforgeDataService.getLatestOpenBobAction(leadId);
  }

  shouldPersistDecision(decision) {
    return !['wait'].includes(decision?.actionType);
  }

  async syncLead(lead) {
    const conversation = await leadConversationService.ensurePrimaryConversation(lead);
    const context = bobDecisionEngine.buildLeadContext(lead, conversation);
    const decision = bobDecisionEngine.decideNextAction(context);
    bobDecisionEngine.logDecision(lead, decision);

    await insforgeDataService.updateConversation(conversation.id, {
      nextAction: decision.actionType,
      nextActionAt: decision.scheduledFor || null,
      lastSummary: bobDecisionEngine.summarizeDecision(lead, decision),
      updatedAt: new Date(),
    });

    if (!this.shouldPersistDecision(decision)) {
      return {
        leadId: lead.id,
        conversationId: conversation.id,
        actionId: null,
        actionType: decision.actionType,
        skippedInsert: true,
        skipReason: 'non_executable_decision',
      };
    }

    const existingOpen = await this.getLatestOpenAction(lead.id);
    if (existingOpen && existingOpen.actionType === decision.actionType) {
      return {
        leadId: lead.id,
        conversationId: conversation.id,
        actionId: existingOpen.id,
        actionType: decision.actionType,
        skippedInsert: true,
      };
    }

    const action = await insforgeDataService.createBobAction({
      leadId: lead.id,
      conversationId: conversation.id,
      actionType: decision.actionType,
      channel: decision.channel,
      status: decision.actionType === 'wait' ? 'deferred' : 'pending',
      reason: decision.reason,
      payload: decision.payload,
      scheduledFor: decision.scheduledFor || null,
    });

    return {
      leadId: lead.id,
      conversationId: conversation.id,
      actionId: action.id,
      actionType: action.actionType,
      skippedInsert: false,
    };
  }

  async runCycle(limit = 50) {
    const leadRows = await insforgeDataService.listRecentLeads(limit);

    const results = [];
    for (const lead of leadRows) {
      results.push(await this.syncLead(lead));
    }

    logger.info('Bob orchestrator cycle completed', {
      processed: results.length,
    });

    return results;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      intervalMs: this.intervalMs,
    };
  }
}

const bobOrchestrator = new BobOrchestrator();
export default bobOrchestrator;
export { BobOrchestrator };

import { and, desc, eq, or } from 'drizzle-orm';
import { db } from '../config/index.js';
import { bobActions, leadConversations, leads } from '../db/schema.js';
import logger from '../utils/logger.js';
import bobDecisionEngine from './bob-decision-engine.js';
import leadConversationService from './lead-conversation-service.js';

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
    const rows = await db
      .select()
      .from(bobActions)
      .where(
        and(
          eq(bobActions.leadId, leadId),
          or(
            eq(bobActions.status, 'pending'),
            eq(bobActions.status, 'deferred'),
            eq(bobActions.status, 'awaiting_call'),
            eq(bobActions.status, 'processing')
          )
        )
      )
      .orderBy(desc(bobActions.createdAt))
      .limit(1);

    return rows[0] || null;
  }

  async syncLead(lead) {
    const conversation = await leadConversationService.ensurePrimaryConversation(lead);
    const context = bobDecisionEngine.buildLeadContext(lead, conversation);
    const decision = bobDecisionEngine.decideNextAction(context);
    bobDecisionEngine.logDecision(lead, decision);

    await db
      .update(leadConversations)
      .set({
        nextAction: decision.actionType,
        nextActionAt: decision.scheduledFor || null,
        lastSummary: bobDecisionEngine.summarizeDecision(lead, decision),
        updatedAt: new Date(),
      })
      .where(eq(leadConversations.id, conversation.id));

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

    const [action] = await db
      .insert(bobActions)
      .values({
        leadId: lead.id,
        conversationId: conversation.id,
        actionType: decision.actionType,
        channel: decision.channel,
        status: decision.actionType === 'wait' ? 'deferred' : 'pending',
        reason: decision.reason,
        payload: decision.payload,
        scheduledFor: decision.scheduledFor || null,
      })
      .returning();

    return {
      leadId: lead.id,
      conversationId: conversation.id,
      actionId: action.id,
      actionType: action.actionType,
      skippedInsert: false,
    };
  }

  async runCycle(limit = 50) {
    const leadRows = await db
      .select({
        id: leads.id,
        email: leads.email,
        firstName: leads.firstName,
        fullName: leads.fullName,
        phone: leads.phone,
        source: leads.source,
        status: leads.status,
        assignedAgentId: leads.assignedAgentId,
        scheduledAt: leads.scheduledAt,
        meetingScheduled: leads.meetingScheduled,
        createdAt: leads.createdAt,
        updatedAt: leads.updatedAt,
        trackingId: leads.trackingId,
      })
      .from(leads)
      .orderBy(desc(leads.createdAt))
      .limit(limit);

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

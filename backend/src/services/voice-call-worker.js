import logger from '../utils/logger.js';
import insforgeDataService from './insforge-data-service.js';
import twilioVoiceService from './twilio-voice-service.js';

class VoiceCallWorker {
  constructor(options = {}) {
    this.dataService = options.dataService || insforgeDataService;
    this.voiceService = options.voiceService || twilioVoiceService;
    this.maxConcurrentCalls = Number(options.maxConcurrentCalls || process.env.MAX_CONCURRENT_CALLS || 3);
    this.enabled = options.enabled ?? process.env.VOICE_CALLING_ENABLED === 'true';
    this.batchSize = Number(options.batchSize || process.env.CALL_BATCH_SIZE || 20);
    this.isRunning = false;
    this.intervalId = null;
    this.intervalMs = Number(options.intervalMs || process.env.CALL_WORKER_INTERVAL_MS || 60_000);
  }

  start() {
    if (!this.enabled) {
      logger.info('Voice call worker disabled; set VOICE_CALLING_ENABLED=true to start outbound calls');
      return;
    }

    if (this.isRunning) {
      logger.info('Voice call worker already running');
      return;
    }

    this.isRunning = true;
    this.processQueuedCalls().catch((error) => logger.error(error.message, { context: 'voice_call_worker_initial', stack: error.stack }));
    this.intervalId = setInterval(() => {
      this.processQueuedCalls().catch((error) => logger.error(error.message, { context: 'voice_call_worker_cycle', stack: error.stack }));
    }, this.intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      maxConcurrentCalls: this.maxConcurrentCalls,
      intervalMs: this.intervalMs,
      enabled: this.enabled,
    };
  }

  async processQueuedCalls() {
    if (!this.enabled) {
      return { started: 0, failed: 0, skipped: 0, active: 0, capacity: 0, disabled: true };
    }

    const activeCalls = await this.dataService.getActiveVoiceCallActions();
    const capacity = Math.max(0, this.maxConcurrentCalls - activeCalls.length);
    if (capacity === 0) {
      return { started: 0, failed: 0, skipped: 0, active: activeCalls.length, capacity };
    }

    const queuedActions = await this.dataService.getQueuedCallActions(this.batchSize);
    const actionsToStart = queuedActions.slice(0, capacity);
    let started = 0;
    let failed = 0;

    for (const action of actionsToStart) {
      try {
        const lead = await this.dataService.getLeadById(action.leadId);
        const conversation = action.conversationId ? await this.dataService.getConversationById(action.conversationId) : null;

        if (!lead?.phone) {
          failed += 1;
          await this.dataService.updateBobAction(action.id, {
            status: 'failed',
            executedAt: new Date(),
            result: { error: 'Lead has no phone number for outbound call' },
            updatedAt: new Date(),
          });
          continue;
        }

        await this.dataService.updateBobAction(action.id, {
          status: 'calling',
          updatedAt: new Date(),
          result: {
            ...(action.result || {}),
            callStartedAt: new Date().toISOString(),
          },
        });

        const primaryPhoneNumber = typeof this.dataService.getPrimaryTenantPhoneNumber === 'function'
          ? await this.dataService.getPrimaryTenantPhoneNumber({
            tenantId: action.tenantId || action.tenant_id || lead.tenantId || lead.tenant_id,
          })
          : null;
        const callResult = await this.voiceService.startOutboundCall({
          action,
          lead,
          conversation,
          from: primaryPhoneNumber?.phoneNumber || null,
        });
        if (!callResult.success) {
          failed += 1;
          await this.dataService.updateBobAction(action.id, {
            status: 'awaiting_call',
            scheduledFor: new Date(Date.now() + 30 * 60 * 1000),
            result: { ...(action.result || {}), error: callResult.error },
            updatedAt: new Date(),
          });
          continue;
        }

        started += 1;
        await this.dataService.updateBobAction(action.id, {
          status: 'calling',
          result: {
            ...(action.result || {}),
            callSid: callResult.callSid,
            providerStatus: callResult.status,
            callStartedAt: new Date().toISOString(),
            senderPhoneNumber: primaryPhoneNumber?.phoneNumber || null,
          },
          updatedAt: new Date(),
        });
      } catch (error) {
        failed += 1;
        await this.dataService.updateBobAction(action.id, {
          status: 'awaiting_call',
          scheduledFor: new Date(Date.now() + 30 * 60 * 1000),
          result: { ...(action.result || {}), error: error.message },
          updatedAt: new Date(),
        });
      }
    }

    return {
      started,
      failed,
      skipped: Math.max(0, queuedActions.length - actionsToStart.length),
      active: activeCalls.length,
      capacity,
    };
  }
}

const voiceCallWorker = new VoiceCallWorker();
export default voiceCallWorker;
export { VoiceCallWorker };

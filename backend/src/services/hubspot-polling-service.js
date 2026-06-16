import cron from 'node-cron';
import { generateTrackingId } from '../utils/crypto.js';
import logger from '../utils/logger.js';
import { syncHubSpotLeads, fetchHubSpotLeads } from './hubspot-lead-service.js';
import insforgeDataService from './insforge-data-service.js';

/**
 * HubSpot Lead Polling Service
 * Provides continuous synchronization with HubSpot CRM
 */
class HubSpotPollingService {
  constructor() {
    this.isRunning = false;
    this.cronJob = null;
    this.lastSyncTime = null;
    this.syncInterval = process.env.HUBSPOT_SYNC_INTERVAL || '*/2 * * * *'; // Default: every 2 minutes
    this.maxLeadsPerSync = parseInt(process.env.HUBSPOT_MAX_LEADS_PER_SYNC) || 100;
    this.workflowOrchestrator = null;
  }

  async getWorkflowOrchestrator() {
    if (!this.workflowOrchestrator) {
      const { WorkflowOrchestrator } = await import('../../workflow-orchestrator.js');
      this.workflowOrchestrator = new WorkflowOrchestrator();
    }

    return this.workflowOrchestrator;
  }

  async getAutomatedEmailWorkflowService() {
    const { default: automatedEmailWorkflowService } = await import('./automated-email-workflow-service.js');
    return automatedEmailWorkflowService;
  }

  /**
   * Start the polling service
   */
  async start() {
    if (this.isRunning) {
      logger.warn('HubSpot polling service is already running');
      console.log('⚠️ [HUBSPOT POLLING] Already running - skipping start');
      return;
    }

    try {
      if (!process.env.HUBSPOT_ACCESS_TOKEN) {
        logger.warn('HubSpot polling service disabled because HUBSPOT_ACCESS_TOKEN is not configured');
        console.log('⚠️ [HUBSPOT POLLING] Disabled: HUBSPOT_ACCESS_TOKEN is not configured');
        return;
      }

      logger.info('Starting HubSpot polling service', {
        interval: this.syncInterval,
        maxLeadsPerSync: this.maxLeadsPerSync
      });
      
      console.log('🚀 [HUBSPOT POLLING] Starting autonomous HubSpot lead synchronization');
      console.log(`⏰ [HUBSPOT POLLING] Sync interval: ${this.syncInterval} (cron format)`);
      console.log(`📊 [HUBSPOT POLLING] Max leads per sync: ${this.maxLeadsPerSync}`);

      // Get last sync time from database
      await this.initializeLastSyncTime();
      console.log(`📅 [HUBSPOT POLLING] Last sync time initialized: ${this.lastSyncTime || 'Never'}`);

      // Schedule the cron job
      this.cronJob = cron.schedule(this.syncInterval, async () => {
        await this.performSync();
      }, {
        scheduled: false,
        timezone: 'UTC'
      });

      // Start the cron job
      this.cronJob.start();
      this.isRunning = true;
      console.log('✅ [HUBSPOT POLLING] Autonomous polling service started successfully');
      console.log('🔄 [HUBSPOT POLLING] Will automatically sync leads and trigger workflows');

      // Perform initial sync
      await this.performSync();

      logger.info('HubSpot polling service started successfully');

    } catch (error) {
      logger.logError(error, {
        context: 'hubspot_polling_service_start'
      });
      throw error;
    }
  }

  /**
   * Stop the polling service
   */
  async stop() {
    if (!this.isRunning) {
      logger.warn('HubSpot polling service is not running');
      return;
    }

    try {
      logger.info('Stopping HubSpot polling service');

      if (this.cronJob) {
        this.cronJob.stop();
        this.cronJob.destroy();
        this.cronJob = null;
      }

      this.isRunning = false;
      logger.info('HubSpot polling service stopped successfully');

    } catch (error) {
      logger.logError(error, {
        context: 'hubspot_polling_service_stop'
      });
      throw error;
    }
  }

  /**
   * Get the current status of the polling service
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastSyncTime: this.lastSyncTime,
      syncInterval: this.syncInterval,
      maxLeadsPerSync: this.maxLeadsPerSync,
      nextSyncTime: this.cronJob ? this.cronJob.nextDate() : null
    };
  }

  /**
   * Perform a manual sync
   */
  async performManualSync() {
    const trackingId = generateTrackingId();
    
    logger.info('Manual HubSpot sync initiated', { trackingId });
    
    try {
      const result = await this.performSync(trackingId);
      
      logger.info('Manual HubSpot sync completed', {
        trackingId,
        result
      });
      
      return result;
    } catch (error) {
      logger.logError(error, {
        context: 'manual_hubspot_sync',
        trackingId
      });
      throw error;
    }
  }

  /**
   * Initialize the last sync time from database
   */
  async initializeLastSyncTime() {
    try {
      const result = await insforgeDataService.getSystemConfig('hubspot_last_sync_time');

      if (result?.value) {
        this.lastSyncTime = new Date(result.value);
        logger.info('Initialized last sync time from database', {
          lastSyncTime: this.lastSyncTime
        });
      } else {
        // No previous sync record, start from 24 hours ago
        this.lastSyncTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
        logger.info('No previous sync record found, starting from 24 hours ago', {
          lastSyncTime: this.lastSyncTime
        });
      }

    } catch (error) {
      logger.logError(error, {
        context: 'initialize_last_sync_time'
      });
      // Fallback to 24 hours ago
      this.lastSyncTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
    }
  }

  /**
   * Update the last sync time in database
   */
  async updateLastSyncTime(syncTime) {
    try {
      await insforgeDataService.upsertSystemConfig(
        'hubspot_last_sync_time',
        syncTime.toISOString(),
        'Last sync time for HubSpot polling service'
      );

      this.lastSyncTime = syncTime;

    } catch (error) {
      logger.logError(error, {
        context: 'update_last_sync_time',
        syncTime
      });
      // Don't throw - this is not critical for the sync process
    }
  }

  /**
   * Perform the actual sync operation
   */
  async performSync(trackingId = null) {
    if (!trackingId) {
      trackingId = generateTrackingId();
    }

    const syncStartTime = new Date();

    try {
      console.log('\n🔄 HUBSPOT POLLING STARTED');
      console.log(`⏰ Sync Time: ${syncStartTime.toISOString()}`);
      console.log(`🔍 Tracking ID: ${trackingId}`);
      console.log(`📅 Last Sync: ${this.lastSyncTime || 'Never'}`);
      console.log(`📊 Max Leads Per Sync: ${this.maxLeadsPerSync}`);
      
      logger.logLeadProcessing(trackingId, 'hubspot_polling_sync_started', {
        lastSyncTime: this.lastSyncTime,
        maxLeadsPerSync: this.maxLeadsPerSync
      });

      // Fetch recent leads from HubSpot
      const hubspotLeads = await fetchHubSpotLeads({
        since: this.lastSyncTime,
        limit: this.maxLeadsPerSync
      }, trackingId);

      if (!hubspotLeads || hubspotLeads.length === 0) {
        console.log('📭 NO NEW LEADS FOUND');
        console.log('✅ Sync completed - no action needed');
        
        logger.logLeadProcessing(trackingId, 'hubspot_polling_no_new_leads', {
          lastSyncTime: this.lastSyncTime
        });

        // Update sync time even if no leads found
        await this.updateLastSyncTime(syncStartTime);

        return {
          success: true,
          leadsProcessed: 0,
          syncTime: syncStartTime,
          message: 'No new leads found'
        };
      }
      
      console.log(`📥 FOUND ${hubspotLeads.length} NEW LEADS FROM HUBSPOT`);
      console.log('🔄 Processing leads and triggering automation...');

      // Process each lead through the sync pipeline
      const results = {
        processed: 0,
        created: 0,
        updated: 0,
        errors: 0,
        errorDetails: []
      };

      for (const hubspotLead of hubspotLeads) {
        try {
          const syncResult = await syncHubSpotLeads({
            contactIds: [hubspotLead.id]
          }, trackingId);

          results.processed++;
          
          if (syncResult.results && syncResult.results.length > 0) {
            const leadResult = syncResult.results[0];
            if (leadResult.operation === 'created') {
                results.created++;
                
                // Console log new lead creation
                console.log(`🆕 NEW LEAD CREATED: ${leadResult.leadId}`);
                console.log(`📧 Lead Email: ${hubspotLead.properties?.email || 'N/A'}`);
                console.log(`👤 Lead Name: ${hubspotLead.properties?.firstname || ''} ${hubspotLead.properties?.lastname || ''}`);
                console.log(`🔄 Triggering automation workflows...`);
                
                // Trigger automation workflows for new leads
                try {
                  const workflowOrchestrator = await this.getWorkflowOrchestrator();
                  const workflowSuccess = await workflowOrchestrator.initializeWorkflow(leadResult.leadId);
                  
                  if (workflowSuccess) {
                    console.log(`✅ AUTOMATION TRIGGERED: Workflows initialized for lead ${leadResult.leadId}`);
                    console.log(`📋 Workflow types: initial_engagement, scheduling_automation`);
                    
                    // Initialize automated email workflow for new lead
                    try {
                      const automatedEmailWorkflowService = await this.getAutomatedEmailWorkflowService();
                      const emailWorkflowResult = await automatedEmailWorkflowService.initializeLeadEmailWorkflow(
                        leadResult.leadId,
                        trackingId
                      );
                      
                      if (emailWorkflowResult.success) {
                        console.log(`📧 EMAIL WORKFLOW INITIALIZED: Lead ${leadResult.leadId}`);
                        console.log(`📋 Email workflows: ${emailWorkflowResult.workflowsCreated.join(', ')}`);
                      }
                    } catch (emailWorkflowError) {
                      console.error(`❌ EMAIL WORKFLOW FAILED: Lead ${leadResult.leadId}`, emailWorkflowError.message);
                      logger.error('Failed to initialize email workflow for new lead', {
                        trackingId,
                        leadId: leadResult.leadId,
                        error: emailWorkflowError.message,
                        stack: emailWorkflowError.stack
                      });
                    }
                  } else {
                    console.log(`❌ AUTOMATION FAILED: Could not initialize workflows for lead ${leadResult.leadId}`);
                  }
                  
                  logger.logLeadProcessing(trackingId, 'automation_workflow_triggered', {
                    leadId: leadResult.leadId,
                    workflowSuccess,
                    source: 'hubspot_polling'
                  });
                  
                } catch (workflowError) {
                  console.log(`❌ AUTOMATION ERROR: ${workflowError.message}`);
                  console.log(`🔍 Lead ID: ${leadResult.leadId}`);
                  
                  logger.logError(workflowError, {
                    context: 'hubspot_polling_workflow_trigger',
                    trackingId,
                    leadId: leadResult.leadId
                  });
                }
              } else if (leadResult.operation === 'updated') {
              results.updated++;
            }
          }

        } catch (leadError) {
          results.errors++;
          results.errorDetails.push({
            contactId: hubspotLead.id,
            error: leadError.message
          });

          logger.logError(leadError, {
            context: 'hubspot_polling_lead_processing',
            trackingId,
            contactId: hubspotLead.id
          });
        }
      }

      // Update last sync time
      await this.updateLastSyncTime(syncStartTime);
      
      const duration = Date.now() - syncStartTime.getTime();
      
      console.log('\n✅ HUBSPOT POLLING COMPLETED');
      console.log(`📊 SYNC RESULTS:`);
      console.log(`   📥 Processed: ${results.processed} leads`);
      console.log(`   🆕 Created: ${results.created} new leads`);
      console.log(`   🔄 Updated: ${results.updated} existing leads`);
      console.log(`   ❌ Errors: ${results.errors} failed`);
      console.log(`   ⏱️  Duration: ${duration}ms`);
      
      if (results.created > 0) {
        console.log(`🚀 AUTOMATION STATUS: ${results.created} workflows triggered for new leads`);
      }
      
      if (results.errors > 0) {
        console.log(`⚠️  ERROR DETAILS:`);
        results.errorDetails.forEach((error, index) => {
          console.log(`   ${index + 1}. Contact ${error.contactId}: ${error.error}`);
        });
      }

      logger.logLeadProcessing(trackingId, 'hubspot_polling_sync_completed', {
        ...results,
        syncTime: syncStartTime,
        duration
      });

      return {
        success: true,
        ...results,
        syncTime: syncStartTime
      };

    } catch (error) {
      console.log('\n❌ HUBSPOT POLLING ERROR');
      console.log(`🔍 Tracking ID: ${trackingId}`);
      console.log(`💥 Error: ${error.message}`);
      console.log(`📅 Last Sync Time: ${this.lastSyncTime}`);
      
      logger.logError(error, {
        context: 'hubspot_polling_sync',
        trackingId,
        lastSyncTime: this.lastSyncTime
      });

      return {
        success: false,
        error: error.message,
        syncTime: syncStartTime
      };
    }
  }

  /**
   * Update sync configuration
   */
  async updateConfig(config) {
    const wasRunning = this.isRunning;

    try {
      // Stop if running
      if (wasRunning) {
        await this.stop();
      }

      // Update configuration
      if (config.syncInterval) {
        this.syncInterval = config.syncInterval;
      }
      if (config.maxLeadsPerSync) {
        this.maxLeadsPerSync = parseInt(config.maxLeadsPerSync);
      }

      logger.info('HubSpot polling service configuration updated', {
        syncInterval: this.syncInterval,
        maxLeadsPerSync: this.maxLeadsPerSync
      });

      // Restart if it was running
      if (wasRunning) {
        await this.start();
      }

    } catch (error) {
      logger.logError(error, {
        context: 'hubspot_polling_config_update',
        config
      });
      throw error;
    }
  }

  /**
   * Get sync statistics
   */
  async getSyncStats() {
    try {
      const { data, error } = await supabase
        .from('hubspot_lead_processing_logs')
        .select('*')
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Last 7 days
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      const stats = {
        totalSyncs: data.length,
        successfulSyncs: data.filter(log => log.status === 'success').length,
        failedSyncs: data.filter(log => log.status === 'error').length,
        lastSyncTime: this.lastSyncTime,
        recentLogs: data.slice(0, 10) // Last 10 logs
      };

      return stats;

    } catch (error) {
      logger.logError(error, {
        context: 'get_sync_stats'
      });
      throw error;
    }
  }
}

// Create singleton instance
const hubspotPollingService = new HubSpotPollingService();

export default hubspotPollingService;
export { HubSpotPollingService };
import cron from 'node-cron';
import { generateTrackingId } from '../utils/crypto.js';
import logger from '../utils/logger.js';
import { syncHubSpotLeads, fetchHubSpotLeads } from './hubspot-lead-service.js';
import { supabase } from '../config/index.js';

/**
 * HubSpot Lead Polling Service
 * Provides continuous synchronization with HubSpot CRM
 */
class HubSpotPollingService {
  constructor() {
    this.isRunning = false;
    this.cronJob = null;
    this.lastSyncTime = null;
    this.syncInterval = process.env.HUBSPOT_SYNC_INTERVAL || '*/15 * * * *'; // Default: every 15 minutes
    this.maxLeadsPerSync = parseInt(process.env.HUBSPOT_MAX_LEADS_PER_SYNC) || 100;
  }

  /**
   * Start the polling service
   */
  async start() {
    if (this.isRunning) {
      logger.warn('HubSpot polling service is already running');
      return;
    }

    try {
      logger.info('Starting HubSpot polling service', {
        interval: this.syncInterval,
        maxLeadsPerSync: this.maxLeadsPerSync
      });

      // Get last sync time from database
      await this.initializeLastSyncTime();

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
      const { data, error } = await supabase
        .from('hubspot_sync_status')
        .select('last_sync_time')
        .eq('sync_type', 'polling')
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        this.lastSyncTime = new Date(data.last_sync_time);
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
      const { error } = await supabase
        .from('hubspot_sync_status')
        .upsert({
          sync_type: 'polling',
          last_sync_time: syncTime.toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'sync_type'
        });

      if (error) {
        throw error;
      }

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

      logger.logLeadProcessing(trackingId, 'hubspot_polling_sync_completed', {
        ...results,
        syncTime: syncStartTime,
        duration: Date.now() - syncStartTime.getTime()
      });

      return {
        success: true,
        ...results,
        syncTime: syncStartTime
      };

    } catch (error) {
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
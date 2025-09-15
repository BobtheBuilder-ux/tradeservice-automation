/**
 * New Lead Monitor Service
 * Continuously monitors for leads with 'new' status and ensures they are processed
 * into the workflow automation system
 */

import { createClient } from '@supabase/supabase-js';
import logger from '../../utils/logger.js';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class NewLeadMonitor {
  constructor(options = {}) {
    this.intervalMinutes = options.intervalMinutes || 5; // Check every 5 minutes by default
    this.batchSize = options.batchSize || 50; // Process 50 leads at a time
    this.isRunning = false;
    this.intervalId = null;
    this.stats = {
      totalChecks: 0,
      totalProcessed: 0,
      lastCheck: null,
      lastProcessed: null,
      errors: 0
    };
  }

  /**
   * Start the monitoring service
   */
  start() {
    if (this.isRunning) {
      logger.warn('New Lead Monitor is already running');
      return;
    }

    this.isRunning = true;
    logger.info('🔍 Starting New Lead Monitor', {
      intervalMinutes: this.intervalMinutes,
      batchSize: this.batchSize
    });

    // Run initial check
    this.checkForNewLeads();

    // Set up recurring checks
    this.intervalId = setInterval(() => {
      this.checkForNewLeads();
    }, this.intervalMinutes * 60 * 1000);
  }

  /**
   * Stop the monitoring service
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('New Lead Monitor is not running');
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    logger.info('🛑 New Lead Monitor stopped');
  }

  /**
   * Check for new leads that need workflow processing
   */
  async checkForNewLeads() {
    if (!this.isRunning) return;

    try {
      this.stats.totalChecks++;
      this.stats.lastCheck = new Date();

      logger.info('🔍 Checking for new leads without workflows...');

      // Get monitoring statistics first
      const stats = await this.getMonitoringStats();
      
      if (stats.new_leads_without_workflows > 0) {
        logger.info('📊 New Lead Monitor Stats', {
          totalNewLeads: stats.total_new_leads,
          withWorkflows: stats.new_leads_with_workflows,
          withoutWorkflows: stats.new_leads_without_workflows,
          oldestUnprocessed: stats.oldest_unprocessed_lead
        });

        // Process orphaned new leads
        const processedLeads = await this.processOrphanedNewLeads();
        
        if (processedLeads.length > 0) {
          this.stats.totalProcessed += processedLeads.length;
          this.stats.lastProcessed = new Date();
          
          logger.info('✅ Processed orphaned new leads', {
            count: processedLeads.length,
            leads: processedLeads.map(lead => ({
              id: lead.lead_id,
              email: lead.email,
              workflowsCreated: lead.workflows_created
            }))
          });
        }
      } else {
        logger.debug('✅ All new leads have workflows assigned');
      }

    } catch (error) {
      this.stats.errors++;
      logger.error('❌ Error in New Lead Monitor check', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Get monitoring statistics
   */
  async getMonitoringStats() {
    try {
      // Try the RPC function first
      const { data, error } = await supabase.rpc('get_new_lead_monitoring_stats');
      if (error) {
        // If RPC fails, fall back to manual query
        logger.warn('RPC function not available, using fallback query:', error.message);
        return await this.getMonitoringStatsFallback();
      }
      return data[0] || {};
    } catch (error) {
      logger.error('Failed to get monitoring stats:', error.message);
      // Return fallback stats
      return await this.getMonitoringStatsFallback();
    }
  }

  async getMonitoringStatsFallback() {
    try {
      // Manual query as fallback
      const { data: newLeads, error: newLeadsError } = await supabase
        .from('leads')
        .select('id, created_at')
        .eq('status', 'new');
      
      if (newLeadsError) throw newLeadsError;

      const { data: workflows, error: workflowsError } = await supabase
        .from('workflow_automation')
        .select('lead_id')
        .eq('workflow_type', 'initial_engagement')
        .in('status', ['pending', 'processing']);
      
      if (workflowsError) throw workflowsError;

      const workflowLeadIds = new Set(workflows.map(w => w.lead_id));
      const newLeadsWithoutWorkflows = newLeads.filter(lead => !workflowLeadIds.has(lead.id));
      
      return {
        total_new_leads: newLeads.length,
        new_leads_with_workflows: newLeads.length - newLeadsWithoutWorkflows.length,
        new_leads_without_workflows: newLeadsWithoutWorkflows.length,
        oldest_unprocessed_lead: newLeadsWithoutWorkflows.length > 0 ? 
          Math.min(...newLeadsWithoutWorkflows.map(l => new Date(l.created_at).getTime())) : null,
        newest_unprocessed_lead: newLeadsWithoutWorkflows.length > 0 ? 
          Math.max(...newLeadsWithoutWorkflows.map(l => new Date(l.created_at).getTime())) : null
      };
    } catch (error) {
      logger.error('Fallback monitoring stats failed:', error.message);
      return {
        total_new_leads: 0,
        new_leads_with_workflows: 0,
        new_leads_without_workflows: 0,
        oldest_unprocessed_lead: null,
        newest_unprocessed_lead: null
      };
    }
  }

  /**
   * Process orphaned new leads
   */
  async processOrphanedNewLeads() {
    const { data, error } = await supabase
      .rpc('process_orphaned_new_leads');

    if (error) {
      throw new Error(`Failed to process orphaned new leads: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Manual trigger to check for new leads immediately
   */
  async triggerCheck() {
    logger.info('🔄 Manual trigger: Checking for new leads...');
    await this.checkForNewLeads();
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      intervalMinutes: this.intervalMinutes,
      batchSize: this.batchSize,
      uptime: this.isRunning ? Date.now() - (this.stats.lastCheck?.getTime() || Date.now()) : 0
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalChecks: 0,
      totalProcessed: 0,
      lastCheck: null,
      lastProcessed: null,
      errors: 0
    };
    logger.info('📊 New Lead Monitor stats reset');
  }

  /**
   * Check for leads with specific status
   */
  async checkLeadsWithStatus(status = 'new') {
    try {
      const { data: leads, error } = await supabase
        .from('leads')
        .select(`
          id,
          email,
          status,
          created_at,
          workflow_automation!inner(
            id,
            workflow_type,
            status
          )
        `)
        .eq('status', status)
        .limit(this.batchSize);

      if (error) {
        throw new Error(`Failed to check leads with status ${status}: ${error.message}`);
      }

      return leads || [];
    } catch (error) {
      logger.error('❌ Error checking leads with status', {
        status,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Health check for the monitoring service
   */
  async healthCheck() {
    const healthStatus = {
      status: 'healthy',
      isRunning: this.isRunning,
      lastCheck: this.stats.lastCheck,
      totalChecks: this.stats.totalChecks,
      totalProcessed: this.stats.totalProcessed,
      errors: this.stats.errors,
      warnings: []
    };

    try {
      // Test basic database connectivity
      const { data, error } = await supabase
        .from('leads')
        .select('id')
        .limit(1);

      if (error) {
        healthStatus.warnings.push(`Database table access issue: ${error.message}`);
        // Don't mark as unhealthy for table access issues - might be schema sync problem
      }

      // Test function availability (non-critical)
      try {
        await this.getMonitoringStats();
      } catch (statsError) {
        healthStatus.warnings.push(`Stats function unavailable: ${statsError.message}`);
      }

      // Only mark as unhealthy if service is not running
      if (!this.isRunning) {
        healthStatus.status = 'unhealthy';
        healthStatus.error = 'Service is not running';
      } else if (healthStatus.warnings.length > 0) {
        healthStatus.status = 'degraded';
      }

      return healthStatus;
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        isRunning: this.isRunning
      };
    }
  }
}

export default NewLeadMonitor;
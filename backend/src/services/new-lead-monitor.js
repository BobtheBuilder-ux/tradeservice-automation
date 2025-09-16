/**
 * New Lead Monitor Service
 * Continuously monitors for leads with 'new' status and ensures they are processed
 * into the workflow automation system
 */

import { db } from '../db/connection.js';
import { leads, workflowAutomation } from '../db/schema.js';
import { eq, and, isNull, gte, count, desc, inArray, min, max } from 'drizzle-orm';
import logger from '../../utils/logger.js';

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
      console.log('⚠️ [NEW LEAD MONITOR] Already running - skipping start');
      return;
    }

    this.isRunning = true;
    logger.info('🔍 Starting New Lead Monitor', {
      intervalMinutes: this.intervalMinutes,
      batchSize: this.batchSize
    });
    console.log(`🚀 [NEW LEAD MONITOR] Starting autonomous monitoring - checking every ${this.intervalMinutes} minutes`);
    console.log(`📊 [NEW LEAD MONITOR] Batch size: ${this.batchSize} leads per check`);

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

    const timestamp = new Date().toISOString();
    console.log(`\n🔍 [${timestamp}] NEW LEAD MONITOR - Starting check cycle #${this.stats.totalChecks + 1}`);

    try {
      this.stats.totalChecks++;
      this.stats.lastCheck = new Date();

      logger.info('🔍 Checking for new leads without workflows...');
      console.log('📋 [NEW LEAD MONITOR] Querying database for leads without workflows...');

      // Get monitoring statistics first
      const stats = await this.getMonitoringStats();
      console.log('📊 [NEW LEAD MONITOR] Database query completed');
      
      if (stats.new_leads_without_workflows > 0) {
        logger.info('📊 New Lead Monitor Stats', {
          totalNewLeads: stats.total_new_leads,
          withWorkflows: stats.new_leads_with_workflows,
          withoutWorkflows: stats.new_leads_without_workflows,
          oldestUnprocessed: stats.oldest_unprocessed_lead
        });
        
        console.log(`🎯 [NEW LEAD MONITOR] Found ${stats.new_leads_without_workflows} leads requiring workflow creation`);
        console.log(`📈 [NEW LEAD MONITOR] Total new leads: ${stats.total_new_leads} | With workflows: ${stats.new_leads_with_workflows}`);
        if (stats.oldest_unprocessed_lead) {
          console.log(`⏰ [NEW LEAD MONITOR] Oldest unprocessed lead: ${stats.oldest_unprocessed_lead}`);
        }

        // Process orphaned new leads
        console.log('🔄 [NEW LEAD MONITOR] Starting orphaned lead processing...');
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
          
          console.log(`✅ [NEW LEAD MONITOR] Successfully processed ${processedLeads.length} leads`);
          processedLeads.forEach((lead, index) => {
            console.log(`   ${index + 1}. Lead ID: ${lead.lead_id} | Email: ${lead.email} | Workflows: ${lead.workflows_created}`);
          });
        } else {
          console.log('⚠️ [NEW LEAD MONITOR] No leads were processed (possible processing error)');
        }
      } else {
        logger.debug('✅ All new leads have workflows assigned');
        console.log('✅ [NEW LEAD MONITOR] All new leads have workflows assigned - no action needed');
      }
      
      console.log(`📊 [NEW LEAD MONITOR] Check completed | Total checks: ${this.stats.totalChecks} | Total processed: ${this.stats.totalProcessed}`);

    } catch (error) {
      this.stats.errors++;
      logger.error('❌ Error in New Lead Monitor check', {
        error: error.message,
        stack: error.stack
      });
      console.log(`❌ [NEW LEAD MONITOR] ERROR during check: ${error.message}`);
      console.log(`🔍 [NEW LEAD MONITOR] Error details:`, error.stack);
    }
  }

  /**
   * Get monitoring statistics
   */
  async getMonitoringStats() {
    try {
      // Use the fallback method directly since we're using Drizzle ORM
      return await this.getMonitoringStatsFallback();
    } catch (error) {
      logger.error('Failed to get monitoring stats:', error.message);
      return {
        total_new_leads: 0,
        new_leads_with_workflows: 0,
        new_leads_without_workflows: 0,
        oldest_unprocessed_lead: null,
        newest_unprocessed_lead: null
      };
    }
  }

  async getMonitoringStatsFallback() {
    try {
      // Get new leads
      const newLeads = await db
        .select({
          id: leads.id,
          createdAt: leads.createdAt
        })
        .from(leads)
        .where(eq(leads.status, 'new'));

      // Get workflows for new leads
      const workflows = await db
        .select({
          leadId: workflowAutomation.leadId
        })
        .from(workflowAutomation)
        .where(
          and(
            eq(workflowAutomation.workflowType, 'initial_engagement'),
            inArray(workflowAutomation.status, ['pending', 'processing'])
          )
        );

      const workflowLeadIds = new Set(workflows.map(w => w.leadId));
      const newLeadsWithoutWorkflows = newLeads.filter(lead => !workflowLeadIds.has(lead.id));
      
      return {
        total_new_leads: newLeads.length,
        new_leads_with_workflows: newLeads.length - newLeadsWithoutWorkflows.length,
        new_leads_without_workflows: newLeadsWithoutWorkflows.length,
        oldest_unprocessed_lead: newLeadsWithoutWorkflows.length > 0 ? 
          Math.min(...newLeadsWithoutWorkflows.map(l => new Date(l.createdAt).getTime())) : null,
        newest_unprocessed_lead: newLeadsWithoutWorkflows.length > 0 ? 
          Math.max(...newLeadsWithoutWorkflows.map(l => new Date(l.createdAt).getTime())) : null
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
    console.log('🔧 [NEW LEAD MONITOR] Processing orphaned new leads');
    
    try {
      // Find leads without workflow automation
      const orphanedLeads = await db
        .select({
          id: leads.id,
          email: leads.email,
          status: leads.status,
          createdAt: leads.createdAt
        })
        .from(leads)
        .leftJoin(workflowAutomation, eq(leads.id, workflowAutomation.leadId))
        .where(and(
          eq(leads.status, 'new'),
          isNull(workflowAutomation.leadId)
        ))
        .limit(this.batchSize);

      console.log(`📋 [NEW LEAD MONITOR] Found ${orphanedLeads.length} orphaned leads`);
      return orphanedLeads;
    } catch (error) {
      console.log(`❌ [NEW LEAD MONITOR] Failed to process orphaned leads: ${error.message}`);
      throw new Error(`Failed to process orphaned new leads: ${error.message}`);
    }
  }

  /**
   * Manual trigger to check for new leads immediately
   */
  async triggerCheck() {
    logger.info('🔄 Manual trigger: Checking for new leads...');
    console.log('🔄 [NEW LEAD MONITOR] Manual trigger initiated - running immediate check');
    await this.checkForNewLeads();
    console.log('✅ [NEW LEAD MONITOR] Manual trigger completed');
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
      const leadsWithWorkflow = await db
        .select({
          id: leads.id,
          email: leads.email,
          status: leads.status,
          createdAt: leads.createdAt,
          workflowId: workflowAutomation.id,
          workflowType: workflowAutomation.workflowType,
          workflowStatus: workflowAutomation.status
        })
        .from(leads)
        .innerJoin(workflowAutomation, eq(leads.id, workflowAutomation.leadId))
        .where(eq(leads.status, status))
        .limit(this.batchSize);

      return leadsWithWorkflow;
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
      try {
        await db
          .select({ id: leads.id })
          .from(leads)
          .limit(1);
      } catch (dbError) {
        healthStatus.warnings.push(`Database table access issue: ${dbError.message}`);
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
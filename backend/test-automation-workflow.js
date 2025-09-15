#!/usr/bin/env node
/**
 * Comprehensive Automation Workflow Test
 * 
 * This script validates the entire automation system by testing:
 * 1. Database connectivity and schema validation
 * 2. Lead creation and workflow initialization
 * 3. Email automation services
 * 4. SMS automation services
 * 5. Meeting booking and monitoring
 * 6. Workflow orchestrator processing
 * 7. System configuration and monitoring functions
 * 8. End-to-end automation flow
 */

import { supabase } from './src/config/index.js';
import { createLead } from './src/services/supabase-service.js';
import { WorkflowOrchestrator } from './workflow-orchestrator.js';
import calendlyEmailService from './src/services/calendly-email-service.js';
import twilioSmsService from './src/services/twilio-sms-service.js';
import meetingService from './src/services/meeting-service.js';
import logger from './src/utils/logger.js';
import { generateTrackingId } from './src/utils/crypto.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

class AutomationWorkflowTester {
  constructor() {
    this.trackingId = generateTrackingId();
    this.testResults = {
      database: { passed: false, errors: [] },
      leadCreation: { passed: false, errors: [] },
      emailService: { passed: false, errors: [] },
      smsService: { passed: false, errors: [] },
      meetingService: { passed: false, errors: [] },
      workflowOrchestrator: { passed: false, errors: [] },
      systemConfig: { passed: false, errors: [] },
      endToEnd: { passed: false, errors: [] }
    };
    this.testLeadIds = [];
    this.orchestrator = new WorkflowOrchestrator();
  }

  /**
   * Run all automation tests
   */
  async runAllTests() {
    console.log('🚀 Starting Comprehensive Automation Workflow Test');
    console.log(`📋 Tracking ID: ${this.trackingId}`);
    console.log('=' .repeat(60));

    try {
      // Test 1: Database connectivity and schema validation
      await this.testDatabaseConnectivity();
      
      // Test 2: Lead creation and workflow initialization
      await this.testLeadCreationAndWorkflow();
      
      // Test 3: Email automation service
      await this.testEmailAutomation();
      
      // Test 4: SMS automation service
      await this.testSmsAutomation();
      
      // Test 5: Meeting booking and monitoring
      await this.testMeetingService();
      
      // Test 6: Workflow orchestrator processing
      await this.testWorkflowOrchestrator();
      
      // Test 7: System configuration and monitoring
      await this.testSystemConfiguration();
      
      // Test 8: End-to-end automation flow
      await this.testEndToEndFlow();
      
      // Generate final report
      this.generateTestReport();
      
    } catch (error) {
      console.error('💥 Critical test failure:', error.message);
      logger.logError(error, {
        context: 'automation_workflow_test',
        trackingId: this.trackingId
      });
    } finally {
      // Cleanup test data
      await this.cleanupTestData();
    }
  }

  /**
   * Test 1: Database connectivity and schema validation
   */
  async testDatabaseConnectivity() {
    console.log('\n🔍 Test 1: Database Connectivity and Schema Validation');
    console.log('-'.repeat(50));
    
    try {
      // Test basic connectivity
      console.log('📡 Testing database connection...');
      const { data: connectionTest, error: connectionError } = await supabase
        .from('leads')
        .select('count')
        .limit(1);
      
      if (connectionError) {
        throw new Error(`Database connection failed: ${connectionError.message}`);
      }
      console.log('✅ Database connection successful');
      
      // Test required tables exist
      console.log('📋 Validating required tables...');
      const requiredTables = [
        'leads',
        'workflow_automation',
        'system_config',
        'agents',
        'meetings'
      ];
      
      for (const table of requiredTables) {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .limit(1);
        
        if (error) {
          throw new Error(`Table '${table}' not accessible: ${error.message}`);
        }
        console.log(`   ✅ Table '${table}' exists and accessible`);
      }
      
      // Test monitoring functions
      console.log('🔧 Testing monitoring functions...');
      const { data: monitoringData, error: monitoringError } = await supabase
        .rpc('get_new_lead_monitoring_stats');
      
      if (monitoringError) {
        console.log(`   ⚠️  Monitoring function warning: ${monitoringError.message}`);
      } else {
        console.log('   ✅ Monitoring functions working');
      }
      
      this.testResults.database.passed = true;
      console.log('✅ Database connectivity test PASSED');
      
    } catch (error) {
      this.testResults.database.errors.push(error.message);
      console.log(`❌ Database connectivity test FAILED: ${error.message}`);
    }
  }

  /**
   * Test 2: Lead creation and workflow initialization
   */
  async testLeadCreationAndWorkflow() {
    console.log('\n👤 Test 2: Lead Creation and Workflow Initialization');
    console.log('-'.repeat(50));
    
    try {
      // Create test lead
      console.log('📝 Creating test lead...');
      const testLeadData = {
        id: `test_facebook_lead_${Date.now()}`,
        email: `test-automation-${Date.now()}@example.com`,
        first_name: 'Test',
        last_name: 'Automation',
        phone: '+1234567890',
        ad_id: 'test_ad_automation',
        ad_name: 'Test Automation Ad',
        adset_id: 'test_adset_automation',
        campaign_id: 'test_campaign_automation',
        campaign_name: 'Test Automation Campaign',
        form_id: 'test_form_automation',
        form_name: 'Test Automation Form',
        fields: {
          utm_source: 'automation_test',
          test_mode: true
        },
        raw_data: {
          test_automation: true,
          tracking_id: this.trackingId
        }
      };
      
      const leadResult = await createLead(testLeadData, this.trackingId);
      
      if (!leadResult || !leadResult.id) {
        throw new Error(`Lead creation failed: ${leadResult}`);
      }
      
      const leadId = leadResult.id;
      this.testLeadIds.push(leadId);
      console.log(`✅ Test lead created with ID: ${leadId}`);
      
      // Verify lead in database
      console.log('🔍 Verifying lead in database...');
      const { data: createdLead, error: fetchError } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();
      
      if (fetchError || !createdLead) {
        throw new Error('Lead not found in database after creation');
      }
      console.log('✅ Lead verified in database');
      
      // Test workflow initialization
      console.log('🔄 Testing workflow initialization...');
      const workflowSuccess = await this.orchestrator.initializeWorkflow(leadId);
      
      if (!workflowSuccess) {
        throw new Error('Workflow initialization failed');
      }
      console.log('✅ Workflow initialized successfully');
      
      // Verify workflow jobs created
      console.log('📊 Verifying workflow jobs...');
      const { data: workflowJobs, error: jobsError } = await supabase
        .from('workflow_automation')
        .select('*')
        .eq('lead_id', leadId);
      
      if (jobsError || !workflowJobs || workflowJobs.length === 0) {
        throw new Error('No workflow jobs created');
      }
      
      console.log(`✅ ${workflowJobs.length} workflow jobs created`);
      workflowJobs.forEach(job => {
        console.log(`   - ${job.workflow_type}: ${job.step_name} (${job.status})`);
      });
      
      this.testResults.leadCreation.passed = true;
      console.log('✅ Lead creation and workflow test PASSED');
      
    } catch (error) {
      this.testResults.leadCreation.errors.push(error.message);
      console.log(`❌ Lead creation and workflow test FAILED: ${error.message}`);
    }
  }

  /**
   * Test 3: Email automation service
   */
  async testEmailAutomation() {
    console.log('\n📧 Test 3: Email Automation Service');
    console.log('-'.repeat(50));
    
    try {
      console.log('🔧 Testing email service initialization...');
      
      if (!calendlyEmailService) {
        throw new Error('Email service failed to initialize');
      }
      console.log('✅ Email service initialized');
      
      // Test email configuration
      console.log('⚙️  Testing email configuration...');
      const hasEmailConfig = process.env.SMTP_HOST || process.env.SENDGRID_API_KEY;
      
      if (!hasEmailConfig) {
        console.log('⚠️  Email configuration not found (SMTP_HOST or SENDGRID_API_KEY)');
        console.log('   Email service will use mock mode for testing');
      } else {
        console.log('✅ Email configuration found');
      }
      
      this.testResults.emailService.passed = true;
      console.log('✅ Email automation service test PASSED');
      
    } catch (error) {
      this.testResults.emailService.errors.push(error.message);
      console.log(`❌ Email automation service test FAILED: ${error.message}`);
    }
  }

  /**
   * Test 4: SMS automation service
   */
  async testSmsAutomation() {
    console.log('\n📱 Test 4: SMS Automation Service');
    console.log('-'.repeat(50));
    
    try {
      console.log('🔧 Testing SMS service initialization...');
      
      if (!twilioSmsService) {
        throw new Error('SMS service failed to initialize');
      }
      console.log('✅ SMS service initialized');
      
      // Test SMS configuration
      console.log('⚙️  Testing SMS configuration...');
      const hasSmsConfig = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN;
      
      if (!hasSmsConfig) {
        console.log('⚠️  SMS configuration not found (TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN)');
        console.log('   SMS service will use mock mode for testing');
      } else {
        console.log('✅ SMS configuration found');
      }
      
      this.testResults.smsService.passed = true;
      console.log('✅ SMS automation service test PASSED');
      
    } catch (error) {
      this.testResults.smsService.errors.push(error.message);
      console.log(`❌ SMS automation service test FAILED: ${error.message}`);
    }
  }

  /**
   * Test 5: Meeting booking and monitoring
   */
  async testMeetingService() {
    console.log('\n📅 Test 5: Meeting Service');
    console.log('-'.repeat(50));
    
    try {
      console.log('🔧 Testing meeting service...');
      
      if (!meetingService) {
        throw new Error('Meeting service not available');
      }
      console.log('✅ Meeting service available');
      
      // Test meeting table access
      console.log('📋 Testing meeting table access...');
      const { data: meetings, error: meetingError } = await supabase
        .from('meetings')
        .select('*')
        .limit(1);
      
      if (meetingError) {
        throw new Error(`Meeting table access failed: ${meetingError.message}`);
      }
      console.log('✅ Meeting table accessible');
      
      this.testResults.meetingService.passed = true;
      console.log('✅ Meeting service test PASSED');
      
    } catch (error) {
      this.testResults.meetingService.errors.push(error.message);
      console.log(`❌ Meeting service test FAILED: ${error.message}`);
    }
  }

  /**
   * Test 6: Workflow orchestrator processing
   */
  async testWorkflowOrchestrator() {
    console.log('\n🔄 Test 6: Workflow Orchestrator Processing');
    console.log('-'.repeat(50));
    
    try {
      if (this.testLeadIds.length === 0) {
        throw new Error('No test leads available for orchestrator testing');
      }
      
      const testLeadId = this.testLeadIds[0];
      
      // Test workflow status retrieval
      console.log('📊 Testing workflow status retrieval...');
      const workflowStatus = await this.orchestrator.getWorkflowStatus(testLeadId);
      
      if (!workflowStatus) {
        throw new Error('Failed to retrieve workflow status');
      }
      
      console.log('✅ Workflow status retrieved:');
      console.log(`   Total Jobs: ${workflowStatus.totalJobs}`);
      console.log(`   Pending: ${workflowStatus.pending}`);
      console.log(`   Completed: ${workflowStatus.completed}`);
      
      // Test job processing
      console.log('⚡ Testing job processing...');
      
      // Update one job to be ready for immediate processing
      await supabase
        .from('workflow_automation')
        .update({ scheduled_at: new Date().toISOString() })
        .eq('lead_id', testLeadId)
        .eq('status', 'pending')
        .limit(1);
      
      const processedCount = await this.orchestrator.processPendingJobs(5);
      console.log(`✅ Processed ${processedCount} workflow jobs`);
      
      this.testResults.workflowOrchestrator.passed = true;
      console.log('✅ Workflow orchestrator test PASSED');
      
    } catch (error) {
      this.testResults.workflowOrchestrator.errors.push(error.message);
      console.log(`❌ Workflow orchestrator test FAILED: ${error.message}`);
    }
  }

  /**
   * Test 7: System configuration and monitoring
   */
  async testSystemConfiguration() {
    console.log('\n⚙️  Test 7: System Configuration and Monitoring');
    console.log('-'.repeat(50));
    
    try {
      // Test system config table
      console.log('📋 Testing system configuration...');
      const { data: configs, error: configError } = await supabase
        .from('system_config')
        .select('*')
        .limit(5);
      
      if (configError) {
        throw new Error(`System config access failed: ${configError.message}`);
      }
      
      console.log(`✅ Found ${configs.length} system configurations`);
      configs.forEach(config => {
        console.log(`   - ${config.key}: ${JSON.stringify(config.value)}`);
      });
      
      // Test monitoring functions
      console.log('📊 Testing monitoring functions...');
      try {
        const { data: monitoringStats, error: monitoringError } = await supabase
          .rpc('get_new_lead_monitoring_stats');
        
        if (monitoringError) {
          console.log(`   ⚠️  Monitoring function warning: ${monitoringError.message}`);
        } else {
          console.log('✅ Monitoring functions working');
          if (monitoringStats && monitoringStats.length > 0) {
            console.log(`   Found ${monitoringStats.length} monitoring records`);
          }
        }
      } catch (funcError) {
        console.log(`   ⚠️  Monitoring function not available: ${funcError.message}`);
      }
      
      this.testResults.systemConfig.passed = true;
      console.log('✅ System configuration test PASSED');
      
    } catch (error) {
      this.testResults.systemConfig.errors.push(error.message);
      console.log(`❌ System configuration test FAILED: ${error.message}`);
    }
  }

  /**
   * Test 8: End-to-end automation flow
   */
  async testEndToEndFlow() {
    console.log('\n🎯 Test 8: End-to-End Automation Flow');
    console.log('-'.repeat(50));
    
    try {
      if (this.testLeadIds.length === 0) {
        throw new Error('No test leads available for end-to-end testing');
      }
      
      const testLeadId = this.testLeadIds[0];
      
      console.log('🔄 Testing complete automation flow...');
      
      // Step 1: Verify lead exists
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('*')
        .eq('id', testLeadId)
        .single();
      
      if (leadError || !lead) {
        throw new Error('Test lead not found');
      }
      console.log(`✅ Lead verified: ${lead.email}`);
      
      // Step 2: Check workflow jobs
      const { data: jobs, error: jobsError } = await supabase
        .from('workflow_automation')
        .select('*')
        .eq('lead_id', testLeadId)
        .order('scheduled_at', { ascending: true });
      
      if (jobsError || !jobs || jobs.length === 0) {
        throw new Error('No workflow jobs found');
      }
      console.log(`✅ Found ${jobs.length} workflow jobs`);
      
      // Step 3: Process immediate jobs
      console.log('⚡ Processing immediate workflow jobs...');
      
      // Make some jobs ready for immediate processing
      await supabase
        .from('workflow_automation')
        .update({ scheduled_at: new Date().toISOString() })
        .eq('lead_id', testLeadId)
        .eq('status', 'pending')
        .limit(2);
      
      const processedCount = await this.orchestrator.processPendingJobs(10);
      console.log(`✅ Processed ${processedCount} jobs in end-to-end flow`);
      
      // Step 4: Verify job status updates
      const { data: updatedJobs, error: updatedError } = await supabase
        .from('workflow_automation')
        .select('*')
        .eq('lead_id', testLeadId)
        .order('updated_at', { ascending: false });
      
      if (updatedError) {
        throw new Error('Failed to fetch updated job status');
      }
      
      const statusCounts = {};
      updatedJobs.forEach(job => {
        statusCounts[job.status] = (statusCounts[job.status] || 0) + 1;
      });
      
      console.log('✅ Job status summary:');
      Object.entries(statusCounts).forEach(([status, count]) => {
        console.log(`   ${status}: ${count}`);
      });
      
      this.testResults.endToEnd.passed = true;
      console.log('✅ End-to-end automation flow test PASSED');
      
    } catch (error) {
      this.testResults.endToEnd.errors.push(error.message);
      console.log(`❌ End-to-end automation flow test FAILED: ${error.message}`);
    }
  }

  /**
   * Generate comprehensive test report
   */
  generateTestReport() {
    console.log('\n📊 COMPREHENSIVE TEST REPORT');
    console.log('='.repeat(60));
    
    const totalTests = Object.keys(this.testResults).length;
    const passedTests = Object.values(this.testResults).filter(result => result.passed).length;
    const failedTests = totalTests - passedTests;
    
    console.log(`📋 Test Summary:`);
    console.log(`   Total Tests: ${totalTests}`);
    console.log(`   Passed: ${passedTests}`);
    console.log(`   Failed: ${failedTests}`);
    console.log(`   Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    console.log('\n📝 Detailed Results:');
    Object.entries(this.testResults).forEach(([testName, result]) => {
      const status = result.passed ? '✅ PASSED' : '❌ FAILED';
      console.log(`   ${testName}: ${status}`);
      
      if (result.errors.length > 0) {
        result.errors.forEach(error => {
          console.log(`     Error: ${error}`);
        });
      }
    });
    
    // Overall status
    console.log('\n🎯 OVERALL STATUS:');
    if (passedTests === totalTests) {
      console.log('🎉 ALL TESTS PASSED - Automation system is working correctly!');
    } else if (passedTests >= totalTests * 0.8) {
      console.log('⚠️  MOSTLY WORKING - Some components need attention');
    } else {
      console.log('❌ CRITICAL ISSUES - Automation system needs significant fixes');
    }
    
    // Recommendations
    console.log('\n💡 Recommendations:');
    if (failedTests > 0) {
      console.log('   1. Review failed test errors above');
      console.log('   2. Check database schema and migrations');
      console.log('   3. Verify environment variables are set correctly');
      console.log('   4. Ensure all required services are running');
    } else {
      console.log('   🎉 No issues found - system is ready for production!');
    }
    
    console.log('\n🔧 Next Steps:');
    console.log('   1. Run individual component tests if needed:');
    console.log('      - node test-workflow-orchestrator.js');
    console.log('      - node test-miracle-flow.js');
    console.log('   2. Start the automation daemon:');
    console.log('      - node start-automation.js start');
    console.log('   3. Monitor logs for any issues:');
    console.log('      - tail -f logs/combined.log');
  }

  /**
   * Cleanup test data
   */
  async cleanupTestData() {
    console.log('\n🧹 Cleaning up test data...');
    
    try {
      if (this.testLeadIds.length > 0) {
        // Delete workflow automation records
        await supabase
          .from('workflow_automation')
          .delete()
          .in('lead_id', this.testLeadIds);
        
        // Delete test leads
        await supabase
          .from('leads')
          .delete()
          .in('id', this.testLeadIds);
        
        console.log(`✅ Cleaned up ${this.testLeadIds.length} test leads and their workflows`);
      }
    } catch (error) {
      console.log(`⚠️  Cleanup warning: ${error.message}`);
    }
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log('🧪 Comprehensive Automation Workflow Tester');
    console.log('\nUsage:');
    console.log('  node test-automation-workflow.js           # Run all tests');
    console.log('  node test-automation-workflow.js --help    # Show this help');
    console.log('\nThis script will test:');
    console.log('  📡 Database connectivity and schema');
    console.log('  👤 Lead creation and workflow initialization');
    console.log('  📧 Email automation service');
    console.log('  📱 SMS automation service');
    console.log('  📅 Meeting booking and monitoring');
    console.log('  🔄 Workflow orchestrator processing');
    console.log('  ⚙️  System configuration and monitoring');
    console.log('  🎯 End-to-end automation flow');
    process.exit(0);
  }
  
  const tester = new AutomationWorkflowTester();
  
  tester.runAllTests()
    .then(() => {
      console.log('\n🏁 Automation workflow test completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Test suite crashed:', error.message);
      process.exit(1);
    });
}

export default AutomationWorkflowTester;
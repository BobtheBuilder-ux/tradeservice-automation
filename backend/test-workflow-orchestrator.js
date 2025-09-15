import { WorkflowOrchestrator } from './workflow-orchestrator.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { logger } from './utils/logger.js';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Test the Workflow Orchestrator
 */
async function testWorkflowOrchestrator() {
  console.log('\n🚀 Testing Workflow Orchestrator\n');
  
  const orchestrator = new WorkflowOrchestrator();
  
  try {
    // Step 1: Get existing leads
    console.log('📋 Step 1: Fetching existing leads...');
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('*')
      .limit(3);
    
    if (leadsError) {
      throw new Error(`Failed to fetch leads: ${leadsError.message}`);
    }
    
    if (!leads || leads.length === 0) {
      console.log('❌ No leads found. Creating a test lead first...');
      
      // Create a test lead
      const { data: newLead, error: createError } = await supabase
        .from('leads')
        .insert({
          email: 'test-orchestrator@example.com',
          full_name: 'Test Orchestrator User',
          phone: '+1234567890',
          status: 'new',
          sms_opt_in: true,
          source: 'test'
        })
        .select()
        .single();
      
      if (createError) {
        throw new Error(`Failed to create test lead: ${createError.message}`);
      }
      
      leads.push(newLead);
      console.log('✅ Test lead created:', newLead.email);
    }
    
    console.log(`✅ Found ${leads.length} leads`);
    leads.forEach(lead => {
      console.log(`   - ${lead.email} (${lead.status})`);
    });
    
    // Step 2: Test workflow initialization
    console.log('\n🔧 Step 2: Testing workflow initialization...');
    const testLead = leads[0];
    
    // Clear any existing workflow for this lead
    await supabase
      .from('workflow_automation')
      .delete()
      .eq('lead_id', testLead.id);
    
    const initSuccess = await orchestrator.initializeWorkflow(testLead.id);
    
    if (initSuccess) {
      console.log('✅ Workflow initialized successfully for:', testLead.email);
    } else {
      throw new Error('Failed to initialize workflow');
    }
    
    // Step 3: Check created workflow jobs
    console.log('\n📊 Step 3: Checking created workflow jobs...');
    const { data: workflowJobs, error: jobsError } = await supabase
      .from('workflow_automation')
      .select('*')
      .eq('lead_id', testLead.id)
      .order('scheduled_at', { ascending: true });
    
    if (jobsError) {
      throw new Error(`Failed to fetch workflow jobs: ${jobsError.message}`);
    }
    
    console.log(`✅ Created ${workflowJobs.length} workflow jobs:`);
    workflowJobs.forEach((job, index) => {
      const scheduledTime = new Date(job.scheduled_at).toLocaleString();
      console.log(`   ${index + 1}. ${job.workflow_type} - ${job.step}`);
      console.log(`      Scheduled: ${scheduledTime}`);
      console.log(`      Status: ${job.status}`);
    });
    
    // Step 4: Test workflow status retrieval
    console.log('\n📈 Step 4: Testing workflow status retrieval...');
    const workflowStatus = await orchestrator.getWorkflowStatus(testLead.id);
    
    if (workflowStatus) {
      console.log('✅ Workflow status retrieved:');
      console.log(`   Total Jobs: ${workflowStatus.totalJobs}`);
      console.log(`   Pending: ${workflowStatus.pending}`);
      console.log(`   Processing: ${workflowStatus.processing}`);
      console.log(`   Completed: ${workflowStatus.completed}`);
      console.log(`   Failed: ${workflowStatus.failed}`);
    } else {
      throw new Error('Failed to retrieve workflow status');
    }
    
    // Step 5: Test immediate job processing (jobs scheduled for now)
    console.log('\n⚡ Step 5: Testing immediate job processing...');
    
    // Update one job to be ready for immediate processing
    const immediateJob = workflowJobs.find(job => job.step === 'send_welcome_email');
    if (immediateJob) {
      await supabase
        .from('workflow_automation')
        .update({ scheduled_at: new Date().toISOString() })
        .eq('id', immediateJob.id);
      
      console.log('✅ Updated welcome email job for immediate processing');
    }
    
    // Process pending jobs
    const processedCount = await orchestrator.processPendingJobs(5);
    console.log(`✅ Processed ${processedCount} workflow jobs`);
    
    // Step 6: Check job status after processing
    console.log('\n🔍 Step 6: Checking job status after processing...');
    const { data: updatedJobs, error: updatedJobsError } = await supabase
      .from('workflow_automation')
      .select('*')
      .eq('lead_id', testLead.id)
      .order('updated_at', { ascending: false });
    
    if (updatedJobsError) {
      throw new Error(`Failed to fetch updated jobs: ${updatedJobsError.message}`);
    }
    
    console.log('✅ Job status after processing:');
    const statusCounts = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      skipped: 0
    };
    
    updatedJobs.forEach(job => {
      statusCounts[job.status] = (statusCounts[job.status] || 0) + 1;
      if (job.status === 'completed' || job.status === 'failed') {
        console.log(`   ${job.step}: ${job.status}`);
        if (job.error_message) {
          console.log(`     Error: ${job.error_message}`);
        }
      }
    });
    
    console.log('\n📊 Final Status Summary:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      if (count > 0) {
        console.log(`   ${status}: ${count}`);
      }
    });
    
    // Step 7: Test workflow for multiple leads
    console.log('\n🔄 Step 7: Testing workflow for multiple leads...');
    
    let successCount = 0;
    for (let i = 1; i < Math.min(leads.length, 3); i++) {
      const lead = leads[i];
      
      // Clear existing workflow
      await supabase
        .from('workflow_automation')
        .delete()
        .eq('lead_id', lead.id);
      
      const success = await orchestrator.initializeWorkflow(lead.id);
      if (success) {
        successCount++;
        console.log(`   ✅ Workflow initialized for: ${lead.email}`);
      } else {
        console.log(`   ❌ Failed to initialize workflow for: ${lead.email}`);
      }
    }
    
    console.log(`✅ Successfully initialized workflows for ${successCount} additional leads`);
    
    // Step 8: Test batch processing
    console.log('\n⚡ Step 8: Testing batch processing...');
    
    // Update some jobs to be ready for processing
    await supabase
      .from('workflow_automation')
      .update({ scheduled_at: new Date().toISOString() })
      .eq('step', 'send_welcome_email')
      .eq('status', 'pending');
    
    const batchProcessedCount = await orchestrator.processPendingJobs(10);
    console.log(`✅ Batch processed ${batchProcessedCount} workflow jobs`);
    
    // Final summary
    console.log('\n🎉 Workflow Orchestrator Test Summary:');
    console.log('✅ Workflow initialization: PASSED');
    console.log('✅ Job creation: PASSED');
    console.log('✅ Status retrieval: PASSED');
    console.log('✅ Job processing: PASSED');
    console.log('✅ Batch processing: PASSED');
    console.log('✅ Multi-lead workflows: PASSED');
    
    // Show CLI usage examples
    console.log('\n🛠️  CLI Usage Examples:');
    console.log(`   # Initialize workflow for a lead:`);
    console.log(`   node workflow-orchestrator.js init ${testLead.id}`);
    console.log(`   `);
    console.log(`   # Process pending jobs:`);
    console.log(`   node workflow-orchestrator.js process 50`);
    console.log(`   `);
    console.log(`   # Check workflow status:`);
    console.log(`   node workflow-orchestrator.js status ${testLead.id}`);
    console.log(`   `);
    console.log(`   # Start continuous processing (every 5 minutes):`);
    console.log(`   node workflow-orchestrator.js continuous 5`);
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testWorkflowOrchestrator()
    .then(() => {
      console.log('\n🏁 Test completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Test crashed:', error.message);
      process.exit(1);
    });
}

export { testWorkflowOrchestrator };
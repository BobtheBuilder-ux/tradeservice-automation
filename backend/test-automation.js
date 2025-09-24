/**
 * Test Script for Lead Automation Workflow
 * This script demonstrates the complete automation functionality
 * by directly calling the service methods without API authentication
 */

import { db } from './src/config/index.js';
import { leads, agents } from './src/db/schema.js';
import { eq, isNull } from 'drizzle-orm';
import leadAutomationService from './src/services/lead-automation-service.js';

async function testCompleteAutomation() {
  console.log('🧪 TESTING: Complete Lead Automation Workflow');
  console.log('=' .repeat(60));

  try {
    // Get a test lead
    const testLeads = await db.select({
      id: leads.id,
      email: leads.email,
      firstName: leads.firstName,
      lastName: leads.lastName,
      fullName: leads.fullName,
      assignedAgentId: leads.assignedAgentId,
      status: leads.status
    })
    .from(leads)
    .limit(1);

    if (!testLeads || testLeads.length === 0) {
      console.log('❌ No test leads found in database');
      return;
    }

    const testLead = testLeads[0];
    console.log(`📋 Testing with lead: ${testLead.fullName || testLead.firstName} (${testLead.email})`);
    console.log(`   Lead ID: ${testLead.id}`);
    console.log(`   Current Status: ${testLead.status}`);
    console.log(`   Currently Assigned: ${testLead.assignedAgentId ? 'Yes' : 'No'}`);
    console.log('');

    // Test 1: Get automation status
    console.log('🔍 TEST 1: Getting automation status...');
    const statusResult = await leadAutomationService.getAutomationStatus(testLead.id);
    
    if (statusResult.success) {
      console.log('✅ Automation status retrieved successfully');
      console.log(`   Lead: ${statusResult.lead.name} (${statusResult.lead.email})`);
      console.log(`   Agent: ${statusResult.agent ? statusResult.agent.name : 'Not assigned'}`);
      console.log(`   Can assign: ${statusResult.automationStatus.isAssigned ? 'Already assigned' : 'Yes'}`);
      console.log(`   Can generate Calendly link: ${statusResult.automationStatus.canGenerateCalendlyLink}`);
      console.log(`   Can create Zoom meeting: ${statusResult.automationStatus.canCreateZoomMeeting}`);
      console.log(`   Ready for full automation: ${statusResult.automationStatus.readyForAutomation}`);
    } else {
      console.log(`❌ Failed to get automation status: ${statusResult.error}`);
    }
    console.log('');

    // Test 2: Execute complete automation workflow
    console.log('🚀 TEST 2: Executing complete automation workflow...');
    const workflowResult = await leadAutomationService.executeCompleteWorkflow(testLead.id);
    
    if (workflowResult.success) {
      console.log('✅ Complete automation workflow executed successfully');
      console.log(`   Tracking ID: ${workflowResult.trackingId}`);
      console.log(`   Completed steps: ${workflowResult.completedSteps.join(', ')}`);
      
      if (workflowResult.failedSteps.length > 0) {
        console.log(`   Failed steps: ${workflowResult.failedSteps.join(', ')}`);
      }

      // Show detailed results
      if (workflowResult.steps.assignment && workflowResult.steps.assignment.success) {
        const assignment = workflowResult.steps.assignment;
        console.log(`   📋 Assignment: Lead assigned to ${assignment.agent?.name || 'Unknown'} (${assignment.agent?.email || 'Unknown'})`);
      }

      if (workflowResult.steps.calendly && workflowResult.steps.calendly.success) {
        const calendly = workflowResult.steps.calendly;
        console.log(`   📅 Calendly: Scheduling link generated`);
        console.log(`      Event: ${calendly.eventType?.name || 'Unknown'} (${calendly.eventType?.duration || 'Unknown'} min)`);
        console.log(`      URL: ${calendly.schedulingUrl}`);
      }

      if (workflowResult.steps.zoom && workflowResult.steps.zoom.success) {
        const zoom = workflowResult.steps.zoom;
        console.log(`   🔍 Zoom: Meeting created`);
        console.log(`      Meeting ID: ${zoom.meeting?.id || 'Unknown'}`);
        console.log(`      Topic: ${zoom.meeting?.topic || 'Unknown'}`);
        console.log(`      Join URL: ${zoom.meeting?.join_url || 'Unknown'}`);
      }
    } else {
      console.log(`❌ Complete automation workflow failed: ${workflowResult.error}`);
      if (workflowResult.completedSteps.length > 0) {
        console.log(`   Completed steps: ${workflowResult.completedSteps.join(', ')}`);
      }
      if (workflowResult.failedSteps.length > 0) {
        console.log(`   Failed steps: ${workflowResult.failedSteps.join(', ')}`);
      }
    }
    console.log('');

    // Test 3: Get updated automation status
    console.log('🔍 TEST 3: Getting updated automation status...');
    const updatedStatusResult = await leadAutomationService.getAutomationStatus(testLead.id);
    
    if (updatedStatusResult.success) {
      console.log('✅ Updated automation status retrieved successfully');
      console.log(`   Lead: ${updatedStatusResult.lead.name} (${updatedStatusResult.lead.email})`);
      console.log(`   Status: ${updatedStatusResult.lead.status}`);
      console.log(`   Agent: ${updatedStatusResult.agent ? updatedStatusResult.agent.name : 'Not assigned'}`);
      console.log(`   Is assigned: ${updatedStatusResult.automationStatus.isAssigned}`);
      console.log(`   Can generate Calendly link: ${updatedStatusResult.automationStatus.canGenerateCalendlyLink}`);
      console.log(`   Can create Zoom meeting: ${updatedStatusResult.automationStatus.canCreateZoomMeeting}`);
      console.log(`   Ready for full automation: ${updatedStatusResult.automationStatus.readyForAutomation}`);
    } else {
      console.log(`❌ Failed to get updated automation status: ${updatedStatusResult.error}`);
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    console.error('Stack trace:', error.stack);
  }

  console.log('');
  console.log('🧪 TESTING COMPLETED');
  console.log('=' .repeat(60));
}

// Test individual components
async function testIndividualComponents() {
  console.log('🔧 TESTING: Individual Components');
  console.log('=' .repeat(60));

  try {
    // Get a test lead
    const testLeads = await db.select({
      id: leads.id,
      email: leads.email,
      firstName: leads.firstName,
      lastName: leads.lastName,
      fullName: leads.fullName,
      assignedAgentId: leads.assignedAgentId,
      status: leads.status
    })
    .from(leads)
    .where(isNull(leads.assignedAgentId))
    .limit(1);

    if (!testLeads || testLeads.length === 0) {
      console.log('❌ No unassigned test leads found in database');
      return;
    }

    const testLead = testLeads[0];
    console.log(`📋 Testing with unassigned lead: ${testLead.fullName || testLead.firstName} (${testLead.email})`);
    console.log('');

    // Test auto-assignment
    console.log('🎯 Testing auto-assignment...');
    const assignmentResult = await leadAutomationService.autoAssignLead(testLead.id, 'test-tracking-id');
    
    if (assignmentResult.success) {
      console.log('✅ Auto-assignment successful');
      console.log(`   Assigned to: ${assignmentResult.agent.name} (${assignmentResult.agent.email})`);
      console.log(`   Agent's previous lead count: ${assignmentResult.agent.previousLeadCount}`);
    } else {
      console.log(`❌ Auto-assignment failed: ${assignmentResult.error}`);
    }
    console.log('');

    // Test Calendly link generation (will likely fail due to missing integration)
    console.log('📅 Testing Calendly link generation...');
    const calendlyResult = await leadAutomationService.generateCalendlyLink(testLead.id, 'test-tracking-id');
    
    if (calendlyResult.success) {
      console.log('✅ Calendly link generation successful');
      console.log(`   Scheduling URL: ${calendlyResult.schedulingUrl}`);
      console.log(`   Event Type: ${calendlyResult.eventType.name}`);
    } else {
      console.log(`❌ Calendly link generation failed: ${calendlyResult.error}`);
    }
    console.log('');

    // Test Zoom meeting creation (will likely fail due to missing integration)
    console.log('🔍 Testing Zoom meeting creation...');
    const zoomResult = await leadAutomationService.createZoomMeeting(testLead.id, 'test-tracking-id');
    
    if (zoomResult.success) {
      console.log('✅ Zoom meeting creation successful');
      console.log(`   Meeting ID: ${zoomResult.meeting.id}`);
      console.log(`   Join URL: ${zoomResult.meeting.join_url}`);
    } else {
      console.log(`❌ Zoom meeting creation failed: ${zoomResult.error}`);
    }

  } catch (error) {
    console.error('❌ Component test failed with error:', error.message);
  }

  console.log('');
  console.log('🔧 COMPONENT TESTING COMPLETED');
  console.log('=' .repeat(60));
}

// Run tests
async function runAllTests() {
  console.log('🚀 Starting Lead Automation Tests');
  console.log('');
  
  await testCompleteAutomation();
  console.log('');
  await testIndividualComponents();
  
  console.log('');
  console.log('✅ All tests completed!');
  process.exit(0);
}

runAllTests().catch(error => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});
import { createLead } from './src/services/supabase-service.js';
import { supabase } from './src/config/index.js';
import { generateTrackingId } from './src/utils/crypto.js';
import CalendlyEmailService from './src/services/calendly-email-service.js';
import TwilioSmsService from './src/services/twilio-sms-service.js';
import meetingService from './src/services/meeting-service.js';
import logger from './src/utils/logger.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Test script to create a new lead WITHOUT triggering automated workflows
 * Provides manual control over workflow initiation
 */
class MiraceWorkflowTester {
  constructor() {
    this.calendlyLink = process.env.CALENDLY_BOOKING_URL || 'https://calendly.com/your-booking-link';
  }

  /**
   * Create a test lead in the database
   */
  async createTestLead() {
    const trackingId = generateTrackingId();
    
    const testLead = {
      id: `test_${Date.now()}`,
      email: 'bestscrapers@gmail.com',
      first_name: 'Miracle',
      last_name: 'Test User',
      phone: '+2347042729119',
      ad_id: 'miracle_ad_test',
      ad_name: 'Miracle Test Ad',
      adset_id: 'miracle_adset_test',
      campaign_id: 'miracle_campaign_test',
      campaign_name: 'Miracle Test Campaign',
      form_id: 'miracle_form_test',
      form_name: 'Miracle Test Form',
      fields: {
        utm_source: 'facebook',
        utm_medium: 'cpc',
        utm_campaign: 'miracle_test',
        test_mode: true,
        created_by: 'test_script'
      },
      raw_data: {
        test_mode: true,
        created_by: 'manual_test_script'
      }
    };

    try {
      console.log('🔄 Creating test lead in database...');
      
      const result = await createLead(testLead, trackingId);
      
      if (result && result.id) {
        console.log('✅ Test lead created successfully!');
        console.log('📋 Lead Details:');
        console.log(`   ID: ${result.id}`);
        console.log(`   Name: ${result.full_name}`);
        console.log(`   Email: ${result.email}`);
        console.log(`   Phone: ${result.phone}`);
        console.log(`   Status: ${result.status}`);
        console.log(`   Created: ${result.created_at}`);
        
        return result;
      } else {
        throw new Error('Failed to create lead - no data returned');
      }
    } catch (error) {
      console.error('❌ Error creating test lead:', error.message);
      throw error;
    }
  }

  /**
   * Send initial engagement email
   */
  async sendInitialEngagement(lead) {
    const trackingId = generateTrackingId();
    
    try {
      console.log('\n📧 Sending initial engagement email...');
      
      const result = await CalendlyEmailService.sendWelcomeEmail(
        lead,
        this.calendlyLink,
        trackingId
      );

      if (result.success) {
        console.log('✅ Initial engagement email sent successfully!');
        console.log(`   To: ${lead.email}`);
        console.log(`   Subject: Welcome email with Calendly link`);
        
        // Update lead status
        await supabase
          .from('leads')
          .update({ 
            status: 'engaged',
            last_email_sent: new Date().toISOString(),
            email_count: 1
          })
          .eq('id', lead.id);
          
        console.log('✅ Lead status updated to "engaged"');
        return true;
      } else {
        throw new Error(result.error || 'Failed to send email');
      }
    } catch (error) {
      console.error('❌ Error sending initial engagement:', error.message);
      return false;
    }
  }

  /**
   * Simulate a meeting booking
   */
  async simulateMeetingBooking(lead) {
    try {
      console.log('\n📅 Simulating meeting booking...');
      
      // Create a test meeting 2 hours from now
      const meetingTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
      
      const meetingData = {
        lead_id: lead.id,
        calendly_event_id: `test_event_${Date.now()}`,
        start_time: meetingTime.toISOString(),
        end_time: new Date(meetingTime.getTime() + 30 * 60 * 1000).toISOString(),
        location: 'Zoom Meeting',
        status: 'scheduled',
        meeting_type: 'consultation',
        timezone: 'UTC',
        email_1h_sent: false,
        sms_2h_sent: false,
        created_at: new Date().toISOString()
      };

      const { data: meeting, error } = await supabase
        .from('meetings')
        .insert(meetingData)
        .select()
        .single();

      if (error) {
        throw error;
      }

      console.log('✅ Test meeting created successfully!');
      console.log(`   Meeting ID: ${meeting.id}`);
      console.log(`   Start Time: ${meeting.start_time}`);
      console.log(`   Location: ${meeting.location}`);
      
      // Update lead status
      await supabase
        .from('leads')
        .update({ 
          status: 'scheduled',
          meeting_scheduled_at: new Date().toISOString()
        })
        .eq('id', lead.id);
        
      console.log('✅ Lead status updated to "scheduled"');
      
      return meeting;
    } catch (error) {
      console.error('❌ Error simulating meeting booking:', error.message);
      return null;
    }
  }

  /**
   * Send appointment confirmation email
   */
  async sendAppointmentConfirmation(lead, meeting) {
    const trackingId = generateTrackingId();
    
    try {
      console.log('\n📧 Sending appointment confirmation email...');
      
      const result = await CalendlyEmailService.sendAppointmentReminder(
        lead,
        meeting,
        trackingId
      );

      if (result.success) {
        console.log('✅ Appointment confirmation email sent!');
        console.log(`   To: ${lead.email}`);
        console.log(`   Meeting: ${new Date(meeting.start_time).toLocaleString()}`);
        return true;
      } else {
        throw new Error(result.error || 'Failed to send confirmation');
      }
    } catch (error) {
      console.error('❌ Error sending appointment confirmation:', error.message);
      return false;
    }
  }

  /**
   * Send SMS reminder
   */
  async sendSmsReminder(lead, meeting) {
    const trackingId = generateTrackingId();
    
    try {
      console.log('\n📱 Sending SMS reminder...');
      
      const result = await meetingService.sendSmsReminder(
        meeting,
        '2h',
        trackingId
      );

      if (result.success) {
        console.log('✅ SMS reminder sent successfully!');
        console.log(`   To: ${lead.phone}`);
        console.log(`   Message: 2-hour meeting reminder`);
        
        // Mark SMS as sent
        await supabase
          .from('meetings')
          .update({ 
            sms_2h_sent: true,
            sms_2h_sent_at: new Date().toISOString()
          })
          .eq('id', meeting.id);
          
        return true;
      } else {
        console.log('⚠️ SMS reminder failed (likely due to Twilio config):', result.error);
        return false;
      }
    } catch (error) {
      console.error('❌ Error sending SMS reminder:', error.message);
      return false;
    }
  }

  /**
   * Send follow-up email
   */
  async sendFollowUpEmail(lead) {
    const trackingId = generateTrackingId();
    
    try {
      console.log('\n📧 Sending follow-up email...');
      
      const result = await CalendlyEmailService.sendFollowUpEmail(
        lead,
        this.calendlyLink,
        trackingId
      );

      if (result.success) {
        console.log('✅ Follow-up email sent successfully!');
        console.log(`   To: ${lead.email}`);
        console.log(`   Type: Follow-up with booking reminder`);
        return true;
      } else {
        throw new Error(result.error || 'Failed to send follow-up');
      }
    } catch (error) {
      console.error('❌ Error sending follow-up email:', error.message);
      return false;
    }
  }

  /**
   * Create lead only - NO automated workflow execution
   */
  async createLeadOnly() {
    console.log('🚀 CREATING LEAD WITHOUT AUTOMATED WORKFLOW');
    console.log('=' .repeat(50));
    
    try {
      // Only create the lead - no workflow execution
      const lead = await this.createTestLead();
      
      console.log('\n' + '=' .repeat(50));
      console.log('✅ LEAD CREATED SUCCESSFULLY!');
      console.log('\n📊 SUMMARY:');
      console.log(`✅ Lead Created: ${lead.full_name} (${lead.email})`);
        console.log(`📋 Lead ID: ${lead.id}`);
        console.log(`📧 Email: ${lead.email}`);
        console.log(`📱 Phone: ${lead.phone}`);
        console.log(`📊 Status: ${lead.status}`);
      
      console.log('\n💡 MANUAL WORKFLOW COMMANDS:');
      console.log(`node miracle-workflow.js                    # Run complete workflow`);
      console.log(`node test-miracle-flow.js workflow ${lead.id}  # Run workflow for this lead`);
      console.log(`node test-miracle-flow.js email ${lead.id}     # Send initial email only`);
      console.log(`node test-miracle-flow.js meeting ${lead.id}   # Create meeting only`);
      console.log(`node test-miracle-flow.js sms ${lead.id}       # Send SMS only`);
      
      console.log('\n🔧 SCHEDULED AUTOMATION (when ready):');
      console.log('node schedule-miracle-workflow.js 24h-email  # Daily email reminders');
      console.log('node schedule-miracle-workflow.js 1h-email   # Hourly email reminders');
      console.log('node schedule-miracle-workflow.js 2h-sms     # SMS reminders every 30min');
      
      return {
        success: true,
        lead,
        workflowExecuted: false,
        summary: {
          leadCreated: true,
          workflowTriggered: false,
          manualControlMaintained: true
        }
      };
      
    } catch (error) {
      console.error('\n❌ LEAD CREATION FAILED:', error.message);
      console.log('\n🔍 TROUBLESHOOTING:');
      console.log('1. Check your .env file for correct database credentials');
      console.log('2. Ensure Supabase is running and accessible');
      console.log('3. Verify database schema and tables exist');
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Run specific workflow step for a lead
   */
  async runWorkflowStep(leadId, step) {
    try {
      // Get lead from database
      const { data: lead, error } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (error || !lead) {
        throw new Error(`Lead not found: ${leadId}`);
      }

      console.log(`🔄 Running ${step} for lead: ${lead.full_name} (${lead.email})`);

      switch (step) {
        case 'email':
          return await this.sendInitialEngagement(lead);
        case 'meeting':
          return await this.simulateMeetingBooking(lead);
        case 'sms':
          // Get meeting for SMS
          const { data: meeting } = await supabase
            .from('meetings')
            .select('*')
            .eq('lead_id', leadId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          if (meeting) {
            return await this.sendSmsReminder(lead, meeting);
          } else {
            console.log('⚠️ No meeting found for SMS reminder');
            return false;
          }
        case 'workflow':
          // Run complete workflow for this specific lead
          const emailResult = await this.sendInitialEngagement(lead);
          const meetingResult = await this.simulateMeetingBooking(lead);
          let smsResult = false;
          if (meetingResult) {
            smsResult = await this.sendSmsReminder(lead, meetingResult);
          }
          const followUpResult = await this.sendFollowUpEmail(lead);
          
          console.log('\n📊 WORKFLOW RESULTS:');
          console.log(`📧 Email: ${emailResult ? '✅' : '❌'}`);
          console.log(`📅 Meeting: ${meetingResult ? '✅' : '❌'}`);
          console.log(`📱 SMS: ${smsResult ? '✅' : '❌'}`);
          console.log(`📧 Follow-up: ${followUpResult ? '✅' : '❌'}`);
          
          return { emailResult, meetingResult, smsResult, followUpResult };
        default:
          throw new Error(`Unknown step: ${step}`);
      }
    } catch (error) {
      console.error(`❌ Error running ${step}:`, error.message);
      return false;
    }
  }

  /**
   * Clean up test data
   */
  async cleanupTestData() {
    try {
      console.log('\n🧹 Cleaning up test data...');
      
      // Delete test meetings
      await supabase
        .from('meetings')
        .delete()
        .like('calendly_event_id', 'test_event_%');
      
      // Delete test leads
      await supabase
        .from('leads')
        .delete()
        .eq('email', 'miracle.test@example.com');
      
      console.log('✅ Test data cleaned up successfully!');
    } catch (error) {
      console.error('❌ Error cleaning up test data:', error.message);
    }
  }
}

// Command line interface
const args = process.argv.slice(2);
const tester = new MiraceWorkflowTester();

if (args.includes('--help') || args.includes('-h')) {
  console.log('🧪 Miracle Workflow Tester - Manual Control Mode');
  console.log('\nUsage:');
  console.log('  node test-miracle-flow.js                    # Create lead only (no workflow)');
  console.log('  node test-miracle-flow.js workflow <lead_id> # Run complete workflow for lead');
  console.log('  node test-miracle-flow.js email <lead_id>    # Send initial email only');
  console.log('  node test-miracle-flow.js meeting <lead_id>  # Create meeting only');
  console.log('  node test-miracle-flow.js sms <lead_id>      # Send SMS reminder only');
  console.log('  node test-miracle-flow.js cleanup           # Clean up test data');
  console.log('  node test-miracle-flow.js --help            # Show this help');
  console.log('\nExamples:');
  console.log('  node test-miracle-flow.js                    # Creates lead, shows manual commands');
  console.log('  node test-miracle-flow.js workflow 123       # Runs full workflow for lead ID 123');
  console.log('  node test-miracle-flow.js email 123          # Sends welcome email to lead ID 123');
  process.exit(0);
}

if (args.includes('cleanup')) {
  tester.cleanupTestData().then(() => {
    console.log('Cleanup completed.');
    process.exit(0);
  }).catch(error => {
    console.error('Cleanup failed:', error);
    process.exit(1);
  });
} else if (args.length >= 2 && ['workflow', 'email', 'meeting', 'sms'].includes(args[0])) {
  // Run specific workflow step for a lead
  const step = args[0];
  const leadId = args[1];
  
  tester.runWorkflowStep(leadId, step).then(result => {
    if (result) {
      console.log(`\n✅ ${step} step completed successfully!`);
      process.exit(0);
    } else {
      console.log(`\n❌ ${step} step failed!`);
      process.exit(1);
    }
  }).catch(error => {
    console.error(`${step} step execution failed:`, error);
    process.exit(1);
  });
} else {
  // Create lead only - no automated workflow
  tester.createLeadOnly().then(result => {
    if (result.success) {
      console.log('\n🎯 Lead created successfully! Use manual commands to trigger workflows.');
      process.exit(0);
    } else {
      console.log('\n💥 Lead creation failed!');
      process.exit(1);
    }
  }).catch(error => {
    console.error('Lead creation failed:', error);
    process.exit(1);
  });
}
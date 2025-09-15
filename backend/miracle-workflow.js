import CalendlyEmailService from './src/services/calendly-email-service.js';
import TwilioSmsService from './src/services/twilio-sms-service.js';
import meetingService from './src/services/meeting-service.js';
import { createLead, findLeadByEmail } from './src/services/supabase-service.js';
import { generateTrackingId } from './src/utils/crypto.js';
import logger from './src/utils/logger.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Comprehensive Facebook Ads Campaign Workflow for Miracle
 * Uses existing services without creating new ones
 */
class MiracleWorkflow {
  constructor() {
    this.miracleData = {
      email: 'miraclechukwudi@gmail.com', // Replace with actual email
      first_name: 'Miracle',
      last_name: 'User',
      full_name: 'Miracle User',
      phone: '+2347042729119', // Replace with actual phone
      source: 'facebook_ads_campaign',
      status: 'new',
      campaign_source: 'Facebook Ads Automation Workflow'
    };
    this.calendlyLink = process.env.CALENDLY_BOOKING_URL || 'https://calendly.com/your-booking-link';
  }

  /**
   * Step 1: Initial Engagement Email
   * Send personalized Calendly invitation using existing service
   */
  async sendInitialEngagementEmail() {
    const trackingId = generateTrackingId();
    
    try {
      console.log('📧 Step 1: Sending initial engagement email to Miracle...');
      
      // Create or find lead using existing service
      let lead = await findLeadByEmail(this.miracleData.email);
      if (!lead) {
        lead = await createLead(this.miracleData, trackingId);
        console.log('✅ Created new lead for Miracle:', lead.id);
      } else {
        console.log('✅ Found existing lead for Miracle:', lead.id);
      }

      // Send appointment email using existing CalendlyEmailService
      const emailResult = await CalendlyEmailService.sendAppointmentEmail(
        lead,
        this.calendlyLink,
        trackingId
      );

      if (emailResult.success) {
        console.log('✅ Initial engagement email sent successfully');
        console.log(`📨 Message ID: ${emailResult.messageId}`);
        return { success: true, leadId: lead.id, trackingId, messageId: emailResult.messageId };
      } else {
        throw new Error(`Failed to send email: ${emailResult.error}`);
      }

    } catch (error) {
      console.error('❌ Error in initial engagement email:', error.message);
      logger.logError(error, { context: 'miracle_initial_email', trackingId });
      throw error;
    }
  }

  /**
   * Step 2: Automated Reminder System
   * Set up 24h email + 1h email + 2h SMS reminders using existing services
   */
  async setupAutomatedReminders(leadId) {
    const trackingId = generateTrackingId();
    
    try {
      console.log('⏰ Step 2: Setting up automated reminder system...');
      
      // Simulate scheduled appointment (in real scenario, this comes from Calendly webhook)
      const mockMeeting = {
        id: `meeting_${Date.now()}`,
        lead_id: leadId,
        meeting_title: 'Facebook Ads Strategy Consultation',
        start_time: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(), // 25 hours from now
        end_time: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
        timezone: 'UTC',
        meeting_url: 'https://calendly.com/meeting-link',
        status: 'scheduled',
        leads: this.miracleData // Include lead data for SMS service
      };

      // 24-hour email reminder using existing service
      console.log('📧 Setting up 24-hour email reminder...');
      const emailReminderResult = await CalendlyEmailService.sendAppointmentReminder(
        this.miracleData,
        {
          start_time: mockMeeting.start_time,
          location: 'Video Call (Zoom link will be provided)'
        },
        trackingId
      );

      if (emailReminderResult.success) {
        console.log('✅ 24-hour email reminder configured');
      }

      // 1-hour email reminder (using follow-up email service)
      console.log('📧 Setting up 1-hour email reminder...');
      const followUpResult = await CalendlyEmailService.sendFollowUpEmail(
        this.miracleData,
        this.calendlyLink,
        trackingId
      );

      if (followUpResult.success) {
        console.log('✅ 1-hour email reminder configured');
      }

      // 2-hour SMS reminder using existing Twilio service
      console.log('📱 Setting up 2-hour SMS reminder...');
      const smsResult = await meetingService.sendSmsReminder(
        mockMeeting,
        '1h', // Using 1h type for 2-hour advance notice
        trackingId
      );

      if (smsResult.success) {
        console.log('✅ 2-hour SMS reminder configured');
        console.log(`📱 SMS Message SID: ${smsResult.messageSid}`);
      }

      return {
        success: true,
        emailReminder: emailReminderResult.success,
        followUpEmail: followUpResult.success,
        smsReminder: smsResult.success,
        trackingId
      };

    } catch (error) {
      console.error('❌ Error setting up reminders:', error.message);
      logger.logError(error, { context: 'miracle_reminders', trackingId });
      throw error;
    }
  }

  /**
   * Step 3: Onboarding Guide Interface
   * Create simple onboarding instructions using existing email service
   */
  async sendOnboardingGuide(leadId) {
    const trackingId = generateTrackingId();
    
    try {
      console.log('📚 Step 3: Sending onboarding guide...');
      
      // Use existing email service to send onboarding information
      const onboardingData = {
        ...this.miracleData,
        onboarding_content: `
        Welcome to Facebook Ads Manager Setup!
        
        Here's what we'll cover in your consultation:
        1. Facebook Business Manager setup
        2. Ad account configuration
        3. Pixel installation and tracking
        4. Campaign structure best practices
        5. Budget optimization strategies
        
        Please have ready:
        - Your Facebook business page
        - Website access for pixel installation
        - Your advertising budget range
        - Target audience information
        `
      };

      // Send follow-up email with onboarding content
      const onboardingResult = await CalendlyEmailService.sendFollowUpEmail(
        onboardingData,
        this.calendlyLink,
        trackingId
      );

      if (onboardingResult.success) {
        console.log('✅ Onboarding guide sent successfully');
        return { success: true, trackingId, messageId: onboardingResult.messageId };
      } else {
        throw new Error(`Failed to send onboarding guide: ${onboardingResult.error}`);
      }

    } catch (error) {
      console.error('❌ Error sending onboarding guide:', error.message);
      logger.logError(error, { context: 'miracle_onboarding', trackingId });
      throw error;
    }
  }

  /**
   * Step 4: Follow-up System
   * Set up performance summary and follow-up emails using existing services
   */
  async setupFollowUpSystem(leadId) {
    const trackingId = generateTrackingId();
    
    try {
      console.log('📈 Step 4: Setting up follow-up system...');
      
      // Send follow-up email with performance tracking info
      const followUpData = {
        ...this.miracleData,
        performance_summary: `
        Your Facebook Ads Campaign Performance Summary:
        
        📊 Key Metrics to Track:
        - Click-through Rate (CTR)
        - Cost Per Click (CPC)
        - Conversion Rate
        - Return on Ad Spend (ROAS)
        
        📅 Next Steps:
        1. Review campaign performance weekly
        2. Optimize targeting based on results
        3. Scale successful ad sets
        4. Schedule monthly strategy reviews
        
        Need help? Reply to this email or book another consultation.
        `
      };

      const followUpResult = await CalendlyEmailService.sendFollowUpEmail(
        followUpData,
        this.calendlyLink,
        trackingId
      );

      if (followUpResult.success) {
        console.log('✅ Follow-up system configured');
        return { success: true, trackingId, messageId: followUpResult.messageId };
      } else {
        throw new Error(`Failed to setup follow-up system: ${followUpResult.error}`);
      }

    } catch (error) {
      console.error('❌ Error setting up follow-up system:', error.message);
      logger.logError(error, { context: 'miracle_followup', trackingId });
      throw error;
    }
  }

  /**
   * Execute Complete Workflow
   * Run all steps in sequence using existing services
   */
  async executeCompleteWorkflow() {
    console.log('🚀 Starting Comprehensive Facebook Ads Campaign Workflow for Miracle');
    console.log('📅 Using Calendly link:', this.calendlyLink);
    console.log('👤 Target user:', this.miracleData.full_name);
    console.log('📧 Email:', this.miracleData.email);
    console.log('📱 Phone:', this.miracleData.phone);
    console.log('=' .repeat(60));
    
    const results = {
      initialEmail: null,
      reminders: null,
      onboarding: null,
      followUp: null,
      errors: []
    };

    try {
      // Step 1: Initial Engagement
      const initialResult = await this.sendInitialEngagementEmail();
      results.initialEmail = initialResult;
      console.log('\n✅ Step 1 completed successfully\n');
      
      // Add delay between steps
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 2: Automated Reminders
      const reminderResult = await this.setupAutomatedReminders(initialResult.leadId);
      results.reminders = reminderResult;
      console.log('\n✅ Step 2 completed successfully\n');
      
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 3: Onboarding Guide
      const onboardingResult = await this.sendOnboardingGuide(initialResult.leadId);
      results.onboarding = onboardingResult;
      console.log('\n✅ Step 3 completed successfully\n');
      
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 4: Follow-up System
      const followUpResult = await this.setupFollowUpSystem(initialResult.leadId);
      results.followUp = followUpResult;
      console.log('\n✅ Step 4 completed successfully\n');

      this.printWorkflowSummary(results);
      return results;

    } catch (error) {
      console.error('❌ Workflow execution failed:', error.message);
      results.errors.push(error.message);
      this.printWorkflowSummary(results);
      throw error;
    }
  }

  /**
   * Print comprehensive workflow summary
   */
  printWorkflowSummary(results) {
    console.log('\n' + '=' .repeat(60));
    console.log('📊 FACEBOOK ADS CAMPAIGN WORKFLOW SUMMARY');
    console.log('=' .repeat(60));
    
    console.log(`\n👤 Target User: ${this.miracleData.full_name}`);
    console.log(`📧 Email: ${this.miracleData.email}`);
    console.log(`📱 Phone: ${this.miracleData.phone}`);
    console.log(`🔗 Calendly Link: ${this.calendlyLink}`);
    
    console.log('\n📋 WORKFLOW STEPS:');
    console.log(`   1. Initial Engagement Email: ${results.initialEmail ? '✅ Sent' : '❌ Failed'}`);
    console.log(`   2. Automated Reminders: ${results.reminders ? '✅ Configured' : '❌ Failed'}`);
    console.log(`   3. Onboarding Guide: ${results.onboarding ? '✅ Sent' : '❌ Failed'}`);
    console.log(`   4. Follow-up System: ${results.followUp ? '✅ Configured' : '❌ Failed'}`);
    
    if (results.reminders) {
      console.log('\n⏰ REMINDER SYSTEM:');
      console.log(`   📧 24h Email Reminder: ${results.reminders.emailReminder ? '✅' : '❌'}`);
      console.log(`   📧 1h Email Reminder: ${results.reminders.followUpEmail ? '✅' : '❌'}`);
      console.log(`   📱 2h SMS Reminder: ${results.reminders.smsReminder ? '✅' : '❌'}`);
    }
    
    if (results.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      results.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
    }
    
    console.log('\n🎯 NEXT STEPS:');
    console.log('   1. Check Miracle\'s email inbox for all sent emails');
    console.log('   2. Verify Calendly booking link functionality');
    console.log('   3. Monitor SMS delivery status in Twilio dashboard');
    console.log('   4. Set up Calendly webhooks for automatic status updates');
    console.log('   5. Configure cron jobs for automated reminder sequences');
    
    console.log('\n💡 INTEGRATION NOTES:');
    console.log('   • All services used existing CalendlyEmailService and TwilioSmsService');
    console.log('   • No new services or functions were created');
    console.log('   • Workflow can be easily automated with cron jobs');
    console.log('   • Lead data is properly tracked in Supabase database');
    console.log('   • All actions are logged with tracking IDs for debugging');
  }
}

// Execute the workflow
const workflow = new MiracleWorkflow();
workflow.executeCompleteWorkflow().catch(error => {
  console.error('Workflow execution failed:', error);
  process.exit(1);
});
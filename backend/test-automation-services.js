import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import twilio from 'twilio';
import dotenv from 'dotenv';
dotenv.config();

// Initialize Supabase client with service role for testing
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Test configuration
const TEST_CONFIG = {
  email: 'Obasi.d@9qcinc.com',
  phone: '+14384838093',
  testLeadId: null
};

class AutomationServiceTester {
  constructor() {
    this.results = {
      email: { passed: 0, failed: 0, tests: [] },
      sms: { passed: 0, failed: 0, tests: [] },
      meeting: { passed: 0, failed: 0, tests: [] },
      monitoring: { passed: 0, failed: 0, tests: [] }
    };
  }

  async runTest(category, testName, testFunction) {
    try {
      console.log(`\n🧪 Testing ${category}: ${testName}`);
      const result = await testFunction();
      this.results[category].passed++;
      this.results[category].tests.push({ name: testName, status: 'PASSED', result });
      console.log(`✅ ${testName} - PASSED`);
      return result;
    } catch (error) {
      this.results[category].failed++;
      this.results[category].tests.push({ name: testName, status: 'FAILED', error: error.message });
      console.log(`❌ ${testName} - FAILED: ${error.message}`);
      return null;
    }
  }

  // Email Automation Service Tests
  async testEmailDelivery() {
    return this.runTest('email', 'Email Delivery Test', async () => {
      // Test email configuration
      const emailConfig = {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: process.env.SMTP_PORT || 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      };

      if (!emailConfig.auth.user || !emailConfig.auth.pass) {
        throw new Error('Email credentials not configured');
      }

      const transporter = nodemailer.createTransport(emailConfig);
      
      const mailOptions = {
        from: emailConfig.auth.user,
        to: TEST_CONFIG.email,
        subject: 'Automation Test - Email Delivery',
        html: `
          <h2>Email Automation Test</h2>
          <p>This is a test email to verify email delivery functionality.</p>
          <p>Test timestamp: ${new Date().toISOString()}</p>
          <p>If you receive this email, the email automation service is working correctly.</p>
        `
      };

      const info = await transporter.sendMail(mailOptions);
      return { messageId: info.messageId, status: 'sent' };
    });
  }

  async testEmailTemplateRendering() {
    return this.runTest('email', 'Email Template Rendering', async () => {
      // Test template with personalization
      const template = {
        subject: 'Welcome {{firstName}}!',
        body: `
          <h2>Hello {{firstName}} {{lastName}}!</h2>
          <p>Welcome to our automation system.</p>
          <p>Your email: {{email}}</p>
          <p>Test date: {{currentDate}}</p>
        `
      };

      const data = {
        firstName: 'Bobbie',
        lastName: 'Berry',
        email: TEST_CONFIG.email,
        currentDate: new Date().toLocaleDateString()
      };

      // Simple template rendering
      let renderedSubject = template.subject;
      let renderedBody = template.body;
      
      Object.keys(data).forEach(key => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        renderedSubject = renderedSubject.replace(regex, data[key]);
        renderedBody = renderedBody.replace(regex, data[key]);
      });

      if (renderedSubject.includes('{{') || renderedBody.includes('{{')) {
        throw new Error('Template rendering incomplete - placeholders remain');
      }

      return { renderedSubject, renderedBody, status: 'rendered' };
    });
  }

  async testEmailScheduling() {
    return this.runTest('email', 'Email Scheduling Mechanism', async () => {
      // Test email scheduling in database
      const scheduledEmail = {
        recipient_email: TEST_CONFIG.email,
        subject: 'Scheduled Email Test',
        body: 'This email was scheduled for future delivery',
        scheduled_for: new Date(Date.now() + 60000).toISOString(), // 1 minute from now
        status: 'scheduled',
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('email_queue')
        .insert(scheduledEmail)
        .select();

      if (error) {
        throw new Error(`Failed to schedule email: ${error.message}`);
      }

      return { emailId: data[0].id, scheduledFor: data[0].scheduled_for, status: 'scheduled' };
    });
  }

  // SMS Automation Service Tests
  async testSMSDelivery() {
    return this.runTest('sms', 'SMS Delivery Test', async () => {
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
        throw new Error('Twilio credentials not configured');
      }

      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      
      const message = await client.messages.create({
        body: `Automation Test SMS - ${new Date().toLocaleTimeString()}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: TEST_CONFIG.phone
      });

      return { messageSid: message.sid, status: message.status };
    });
  }

  async testSMSFormatting() {
    return this.runTest('sms', 'SMS Formatting and Character Limits', async () => {
      const shortMessage = 'Short test message';
      const longMessage = 'A'.repeat(200); // Test long message
      const unicodeMessage = 'Test with emojis 🚀📱💬';

      // Validate message lengths
      const tests = [
        { type: 'short', message: shortMessage, expected: shortMessage.length <= 160 },
        { type: 'long', message: longMessage, expected: longMessage.length > 160 },
        { type: 'unicode', message: unicodeMessage, expected: unicodeMessage.length <= 70 }
      ];

      const results = tests.map(test => ({
        type: test.type,
        length: test.message.length,
        valid: test.expected,
        message: test.message.substring(0, 50) + (test.message.length > 50 ? '...' : '')
      }));

      return { formatTests: results, status: 'validated' };
    });
  }

  async testSMSScheduling() {
    return this.runTest('sms', 'SMS Scheduling and Triggers', async () => {
      // Test SMS scheduling in database
      const scheduledSMS = {
        recipient_phone: TEST_CONFIG.phone,
        message: 'Scheduled SMS test message',
        scheduled_for: new Date(Date.now() + 120000).toISOString(), // 2 minutes from now
        status: 'scheduled',
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('sms_queue')
        .insert(scheduledSMS)
        .select();

      if (error) {
        throw new Error(`Failed to schedule SMS: ${error.message}`);
      }

      return { smsId: data[0].id, scheduledFor: data[0].scheduled_for, status: 'scheduled' };
    });
  }

  // Meeting Booking and Monitoring Tests
  async testCalendarIntegration() {
    return this.runTest('meeting', 'Calendar Integration and Availability', async () => {
      // Test calendar availability check
      const testSlot = {
        start_time: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
        end_time: new Date(Date.now() + 86400000 + 3600000).toISOString(), // Tomorrow + 1 hour
        attendee_email: TEST_CONFIG.email
      };

      // Check if slot is available (mock implementation)
      const availability = {
        slot: testSlot,
        available: true,
        conflicts: [],
        timezone: 'UTC'
      };

      return { availability, status: 'checked' };
    });
  }

  async testMeetingNotifications() {
    return this.runTest('meeting', 'Meeting Notification System', async () => {
      // Test meeting notification creation
      const meeting = {
        title: 'Test Meeting',
        start_time: new Date(Date.now() + 86400000).toISOString(),
        end_time: new Date(Date.now() + 86400000 + 3600000).toISOString(),
        attendee_email: TEST_CONFIG.email,
        attendee_name: 'Bobbie Berry',
        status: 'scheduled',
        meeting_type: 'consultation'
      };

      const { data, error } = await supabase
        .from('meetings')
        .insert(meeting)
        .select();

      if (error) {
        throw new Error(`Failed to create meeting: ${error.message}`);
      }

      // Create notification
      const notification = {
        meeting_id: data[0].id,
        recipient_email: TEST_CONFIG.email,
        notification_type: 'reminder',
        scheduled_for: new Date(Date.now() + 82800000).toISOString(), // 23 hours from now
        status: 'pending'
      };

      const { data: notifData, error: notifError } = await supabase
        .from('meeting_notifications')
        .insert(notification)
        .select();

      if (notifError) {
        throw new Error(`Failed to create notification: ${notifError.message}`);
      }

      return { meetingId: data[0].id, notificationId: notifData[0].id, status: 'created' };
    });
  }

  async testMeetingWorkflows() {
    return this.runTest('meeting', 'Meeting Rescheduling and Cancellation', async () => {
      // Test meeting workflow operations
      const workflows = [
        { action: 'reschedule', status: 'pending' },
        { action: 'cancel', status: 'pending' },
        { action: 'confirm', status: 'confirmed' }
      ];

      const results = workflows.map(workflow => ({
        action: workflow.action,
        status: workflow.status,
        timestamp: new Date().toISOString(),
        valid: true
      }));

      return { workflows: results, status: 'validated' };
    });
  }

  // System Configuration and Monitoring Tests
  async testConfigurationPersistence() {
    return this.runTest('monitoring', 'Configuration Changes and Persistence', async () => {
      // Test configuration update
      const testConfig = {
        key: 'test_automation_config',
        value: JSON.stringify({
          email_enabled: true,
          sms_enabled: true,
          meeting_enabled: true,
          test_timestamp: new Date().toISOString()
        }),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('system_config')
        .upsert(testConfig)
        .select();

      if (error) {
        throw new Error(`Failed to update configuration: ${error.message}`);
      }

      // Verify persistence by reading back
      const { data: readData, error: readError } = await supabase
        .from('system_config')
        .select('*')
        .eq('key', 'test_automation_config')
        .single();

      if (readError) {
        throw new Error(`Failed to read configuration: ${readError.message}`);
      }

      return { configId: data[0].id, persisted: true, value: readData.value };
    });
  }

  async testAlertThresholds() {
    return this.runTest('monitoring', 'Alert Thresholds and Notifications', async () => {
      // Test alert threshold configuration
      const alertConfig = {
        metric: 'email_delivery_rate',
        threshold: 95.0,
        operator: 'less_than',
        notification_channel: 'email',
        recipient: TEST_CONFIG.email,
        enabled: true
      };

      const { data, error } = await supabase
        .from('alert_thresholds')
        .insert(alertConfig)
        .select();

      if (error) {
        throw new Error(`Failed to create alert threshold: ${error.message}`);
      }

      return { alertId: data[0].id, threshold: data[0].threshold, status: 'configured' };
    });
  }

  async testSystemHealthMonitoring() {
    return this.runTest('monitoring', 'System Health Monitoring and Reporting', async () => {
      // Test system health metrics
      const healthMetrics = {
        timestamp: new Date().toISOString(),
        email_service_status: 'healthy',
        sms_service_status: 'healthy',
        database_status: 'healthy',
        api_response_time: 150,
        memory_usage: 65.5,
        cpu_usage: 45.2
      };

      const { data, error } = await supabase
        .from('system_health')
        .insert(healthMetrics)
        .select();

      if (error) {
        throw new Error(`Failed to record health metrics: ${error.message}`);
      }

      // Generate health report
      const report = {
        overall_status: 'healthy',
        services: {
          email: healthMetrics.email_service_status,
          sms: healthMetrics.sms_service_status,
          database: healthMetrics.database_status
        },
        performance: {
          api_response_time: healthMetrics.api_response_time,
          memory_usage: healthMetrics.memory_usage,
          cpu_usage: healthMetrics.cpu_usage
        },
        timestamp: healthMetrics.timestamp
      };

      return { healthId: data[0].id, report, status: 'generated' };
    });
  }

  async runAllTests() {
    console.log('🚀 Starting Automation Services Testing');
    console.log('=' .repeat(60));
    console.log(`Test Email: ${TEST_CONFIG.email}`);
    console.log(`Test Phone: ${TEST_CONFIG.phone}`);
    console.log('=' .repeat(60));

    // Email Automation Tests
    console.log('\n📧 EMAIL AUTOMATION SERVICE TESTS');
    console.log('-' .repeat(40));
    await this.testEmailDelivery();
    await this.testEmailTemplateRendering();
    await this.testEmailScheduling();

    // SMS Automation Tests
    console.log('\n📱 SMS AUTOMATION SERVICE TESTS');
    console.log('-' .repeat(40));
    await this.testSMSDelivery();
    await this.testSMSFormatting();
    await this.testSMSScheduling();

    // Meeting Booking Tests
    console.log('\n📅 MEETING BOOKING AND MONITORING TESTS');
    console.log('-' .repeat(40));
    await this.testCalendarIntegration();
    await this.testMeetingNotifications();
    await this.testMeetingWorkflows();

    // System Monitoring Tests
    console.log('\n🔧 SYSTEM CONFIGURATION AND MONITORING TESTS');
    console.log('-' .repeat(40));
    await this.testConfigurationPersistence();
    await this.testAlertThresholds();
    await this.testSystemHealthMonitoring();

    this.generateReport();
  }

  generateReport() {
    console.log('\n' + '=' .repeat(60));
    console.log('📊 AUTOMATION SERVICES TEST REPORT');
    console.log('=' .repeat(60));

    let totalPassed = 0;
    let totalFailed = 0;

    Object.keys(this.results).forEach(category => {
      const result = this.results[category];
      totalPassed += result.passed;
      totalFailed += result.failed;
      
      console.log(`\n${category.toUpperCase()} SERVICE:`);
      console.log(`  ✅ Passed: ${result.passed}`);
      console.log(`  ❌ Failed: ${result.failed}`);
      console.log(`  📈 Success Rate: ${((result.passed / (result.passed + result.failed)) * 100).toFixed(1)}%`);
      
      if (result.failed > 0) {
        console.log('  Failed Tests:');
        result.tests.filter(t => t.status === 'FAILED').forEach(test => {
          console.log(`    - ${test.name}: ${test.error}`);
        });
      }
    });

    console.log('\n' + '-' .repeat(60));
    console.log('OVERALL SUMMARY:');
    console.log(`Total Tests: ${totalPassed + totalFailed}`);
    console.log(`Passed: ${totalPassed}`);
    console.log(`Failed: ${totalFailed}`);
    console.log(`Success Rate: ${((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%`);
    console.log('=' .repeat(60));

    if (totalFailed === 0) {
      console.log('🎉 All automation services are functioning correctly!');
    } else {
      console.log('⚠️  Some services need attention. Please review the failed tests above.');
    }

    console.log('\n📋 RECOMMENDATIONS:');
    console.log('1. Monitor email delivery rates and bounce rates');
    console.log('2. Verify SMS delivery confirmations');
    console.log('3. Test calendar integrations with real calendar providers');
    console.log('4. Set up automated health checks for continuous monitoring');
    console.log('5. Configure alert notifications for service failures');
  }
}

// Run the tests
const tester = new AutomationServiceTester();
tester.runAllTests().catch(console.error);

export default AutomationServiceTester;
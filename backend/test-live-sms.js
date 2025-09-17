import TwilioSmsService from './src/services/twilio-sms-service.js';
import { generateTrackingId } from './src/utils/crypto.js';

/**
 * Live SMS Test - Actually sends test SMS messages
 * WARNING: This will send real SMS messages and incur costs
 */

async function testLiveSms() {
  console.log('📱 LIVE SMS TEST\n');
  console.log('⚠️  WARNING: This will send actual SMS messages and incur Twilio costs!\n');
  
  // Test lead data - CHANGE THIS TO YOUR PHONE NUMBER FOR TESTING
  const testLead = {
    id: 'test-lead-live',
    first_name: 'Test',
    full_name: 'Test User',
    phone: '+2347042729119', // Updated to your phone number
    email: 'test@example.com'
  };
  
  // Test meeting data
  const testMeeting = {
    id: 'test-meeting-live',
    start_time: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
    location: 'NASCO Office, Toronto',
    meeting_url: 'https://calendly.com/meeting/test123'
  };
  
  const trackingId = generateTrackingId();
  
  console.log('📋 Test Configuration:');
  console.log(`   Phone Number: ${testLead.phone}`);
  console.log(`   Meeting Time: ${testMeeting.start_time.toLocaleString()}\n`);
  
  // Phone number has been updated to your number
  console.log('✅ Phone number configured for testing');
  
  console.log('🚀 Starting live SMS tests...\n');
  
  try {
    // Test 1: 24-hour reminder
    console.log('📤 Sending 24-hour reminder SMS...');
    const result24h = await TwilioSmsService.send24HourReminder(testLead, testMeeting, trackingId);
    
    if (result24h.success) {
      console.log('✅ 24-hour reminder sent successfully!');
      console.log(`   Message SID: ${result24h.messageSid}`);
      console.log(`   Status: ${result24h.status}\n`);
    } else {
      console.log('❌ 24-hour reminder failed:');
      console.log(`   Error: ${result24h.error}\n`);
    }
    
    // Wait 2 seconds between messages
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 2: 1-hour reminder
    console.log('📤 Sending 1-hour reminder SMS...');
    const result1h = await TwilioSmsService.send1HourReminder(testLead, testMeeting, trackingId);
    
    if (result1h.success) {
      console.log('✅ 1-hour reminder sent successfully!');
      console.log(`   Message SID: ${result1h.messageSid}`);
      console.log(`   Status: ${result1h.status}\n`);
    } else {
      console.log('❌ 1-hour reminder failed:');
      console.log(`   Error: ${result1h.error}\n`);
    }
    
    // Wait 2 seconds between messages
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 3: General appointment reminder
    console.log('📤 Sending general appointment reminder SMS...');
    const resultGeneral = await TwilioSmsService.sendAppointmentReminder(testLead, testMeeting, trackingId);
    
    if (resultGeneral.success) {
      console.log('✅ General reminder sent successfully!');
      console.log(`   Message SID: ${resultGeneral.messageSid}`);
      console.log(`   Status: ${resultGeneral.status}\n`);
    } else {
      console.log('❌ General reminder failed:');
      console.log(`   Error: ${resultGeneral.error}\n`);
    }
    
    console.log('🎉 Live SMS test completed!');
    console.log('📱 Check your phone for the test messages.\n');
    
    // Show message status check example
    if (result24h.success) {
      console.log('📊 Checking message delivery status...');
      setTimeout(async () => {
        try {
          const status = await TwilioSmsService.getMessageStatus(result24h.messageSid);
          console.log(`   Message delivery status: ${status.status}`);
          console.log(`   Error code: ${status.errorCode || 'None'}`);
          console.log(`   Error message: ${status.errorMessage || 'None'}`);
        } catch (error) {
          console.log(`   Status check failed: ${error.message}`);
        }
      }, 5000);
    }
    
  } catch (error) {
    console.error('❌ Live SMS test failed:', error.message);
    console.error('   Stack:', error.stack);
  }
}

// Show usage instructions
console.log('📱 LIVE SMS TESTING TOOL\n');
console.log('⚠️  IMPORTANT SETUP INSTRUCTIONS:');
console.log('   1. Update the phone number on line 15 to your actual phone number');
console.log('   2. Ensure Twilio credentials are configured in your .env file:');
console.log('      - TWILIO_ACCOUNT_SID');
console.log('      - TWILIO_AUTH_TOKEN');
console.log('      - TWILIO_PHONE_NUMBER');
console.log('   3. This will send real SMS messages and incur Twilio costs\n');
console.log('🚀 To run the test, uncomment the line below and run the script again:\n');
console.log('// testLiveSms().catch(console.error);\n');

// Running the live test
testLiveSms().catch(console.error);
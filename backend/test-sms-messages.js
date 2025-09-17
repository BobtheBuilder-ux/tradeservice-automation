import TwilioSmsService from './src/services/twilio-sms-service.js';
import { generateTrackingId } from './src/utils/crypto.js';

/**
 * Test SMS Messages - Shows the exact content that would be sent
 * This script demonstrates SMS message content without actually sending them
 */

async function testSmsMessages() {
  console.log('🔔 SMS Message Content Test\n');
  console.log('=' .repeat(60));
  
  // Sample lead data
  const sampleLead = {
    id: 'test-lead-123',
    first_name: 'John',
    full_name: 'John Smith',
    phone: '+2347042729119',
    email: 'miraclechukwudi@gmail.com'
  };
  
  // Sample meeting data
  const sampleMeeting = {
    id: 'test-meeting-456',
    start_time: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
    location: 'NASCO Office, Toronto',
    meeting_url: 'https://calendly.com/meeting/abc123'
  };
  
  const trackingId = generateTrackingId();
  
  console.log('📋 Sample Lead Information:');
  console.log(`   Name: ${sampleLead.first_name} ${sampleLead.full_name}`);
  console.log(`   Phone: ${sampleLead.phone}`);
  console.log(`   Email: ${sampleLead.email}\n`);
  
  console.log('📅 Sample Meeting Information:');
  console.log(`   Date: ${sampleMeeting.start_time.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })}`);
  console.log(`   Time: ${sampleMeeting.start_time.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })}`);
  console.log(`   Location: ${sampleMeeting.location}`);
  console.log(`   Meeting URL: ${sampleMeeting.meeting_url}\n`);
  
  console.log('=' .repeat(60));
  console.log('📱 SMS MESSAGE PREVIEWS\n');
  
  // Test 24-hour reminder message
  console.log('🕐 24-HOUR REMINDER MESSAGE:');
  console.log('-'.repeat(40));
  
  const meetingDate24h = new Date(sampleMeeting.start_time);
  const formattedDate24h = meetingDate24h.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });
  const formattedTime24h = meetingDate24h.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  
  const message24h = `Hi ${sampleLead.first_name || sampleLead.full_name || 'there'}! Your appointment with NASCO Canada Trade Services is tomorrow (${formattedDate24h}) at ${formattedTime24h}. Please confirm your attendance or reschedule if needed. ${sampleMeeting.meeting_url ? `Join here: ${sampleMeeting.meeting_url}` : ''}`;
  
  console.log(`"${message24h}"\n`);
  console.log(`Character count: ${message24h.length}`);
  console.log(`SMS segments: ${Math.ceil(message24h.length / 160)}\n`);
  
  // Test 1-hour reminder message
  console.log('⏰ 1-HOUR REMINDER MESSAGE:');
  console.log('-'.repeat(40));
  
  const meetingDate1h = new Date(sampleMeeting.start_time);
  const formattedTime1h = meetingDate1h.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  
  const message1h = `Reminder: Your appointment with NASCO Canada Trade Services starts in 1 hour at ${formattedTime1h}. ${sampleMeeting.meeting_url ? `Join here: ${sampleMeeting.meeting_url}` : ''} See you soon!`;
  
  console.log(`"${message1h}"\n`);
  console.log(`Character count: ${message1h.length}`);
  console.log(`SMS segments: ${Math.ceil(message1h.length / 160)}\n`);
  
  // Test general appointment reminder message
  console.log('📞 GENERAL APPOINTMENT REMINDER MESSAGE:');
  console.log('-'.repeat(40));
  
  const meetingDateGeneral = new Date(sampleMeeting.start_time);
  const formattedDateGeneral = meetingDateGeneral.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const formattedTimeGeneral = meetingDateGeneral.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  
  const messageGeneral = `Hi ${sampleLead.first_name || sampleLead.full_name || 'there'}! This is a reminder about your upcoming appointment on ${formattedDateGeneral} at ${formattedTimeGeneral}. ${sampleMeeting.location ? `Location: ${sampleMeeting.location}` : ''} ${sampleMeeting.meeting_url ? `Join here: ${sampleMeeting.meeting_url}` : ''} - NASCO Canada Trade Services`;
  
  console.log(`"${messageGeneral}"\n`);
  console.log(`Character count: ${messageGeneral.length}`);
  console.log(`SMS segments: ${Math.ceil(messageGeneral.length / 160)}\n`);
  
  console.log('=' .repeat(60));
  console.log('📊 SMS COST ESTIMATION\n');
  
  const totalSegments = Math.ceil(message24h.length / 160) + Math.ceil(message1h.length / 160) + Math.ceil(messageGeneral.length / 160);
  console.log(`Total SMS segments per customer: ${totalSegments}`);
  console.log(`Estimated cost per customer (at $0.0075/segment): $${(totalSegments * 0.0075).toFixed(4)}`);
  console.log(`Estimated monthly cost for 100 customers: $${(totalSegments * 0.0075 * 100).toFixed(2)}\n`);
  
  console.log('=' .repeat(60));
  console.log('✅ SMS MESSAGE CONTENT TEST COMPLETED\n');
  
  console.log('📝 Notes:');
  console.log('   • Messages are personalized with lead name');
  console.log('   • Meeting details are dynamically inserted');
  console.log('   • URLs are included when available');
  console.log('   • Messages are optimized for mobile readability');
  console.log('   • Character counts help estimate SMS costs');
}

// Run the test
testSmsMessages().catch(console.error);
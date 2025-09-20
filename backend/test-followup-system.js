import { db } from './src/config/index.js';
import { leads } from './src/db/schema.js';
import { eq } from 'drizzle-orm';
import MeetingService from './src/services/meeting-service.js';
import ReminderScheduler from './src/services/reminder-scheduler.js';
import { generateTrackingId } from './src/utils/crypto.js';

async function testFollowUpSystem() {
  console.log('🧪 Testing Follow-up Email Duplicate Prevention System');
  console.log('=' .repeat(60));
  
  try {
    // Step 1: Create a test lead
    console.log('\n1. Creating test lead...');
    const testLead = {
      email: 'test-followup-' + Date.now() + '@example.com',
      firstName: 'Test',
      lastName: 'User',
      source: 'test',
      meetingScheduled: false,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() // 2 days ago
    };
    
    const [createdLead] = await db.insert(leads).values(testLead).returning();
    console.log(`✅ Created test lead: ${createdLead.id} (${createdLead.email})`);
    
    // Step 2: Check if lead qualifies for follow-up
    console.log('\n2. Checking leads needing follow-up reminders...');
    const leadsNeedingReminders = await MeetingService.getLeadsNeedingMeetingReminders();
    const ourLead = leadsNeedingReminders.find(lead => lead.id === createdLead.id);
    
    if (ourLead) {
      console.log(`✅ Test lead qualifies for follow-up reminder`);
    } else {
      console.log(`❌ Test lead does not qualify for follow-up reminder`);
      console.log(`Total qualifying leads: ${leadsNeedingReminders.length}`);
    }
    
    // Step 3: Simulate first follow-up email
    console.log('\n3. Simulating first follow-up email send...');
    await MeetingService.updateLeadMeetingStatus(createdLead.id, null, false, generateTrackingId());
    console.log('✅ Marked first follow-up as sent');
    
    // Step 4: Check if lead still qualifies (should not within 24 hours)
    console.log('\n4. Checking if lead still qualifies after first email...');
    const leadsAfterFirst = await MeetingService.getLeadsNeedingMeetingReminders();
    const ourLeadAfterFirst = leadsAfterFirst.find(lead => lead.id === createdLead.id);
    
    if (!ourLeadAfterFirst) {
      console.log('✅ DUPLICATE PREVENTION WORKING: Lead no longer qualifies (within 24 hours)');
    } else {
      console.log('❌ DUPLICATE PREVENTION FAILED: Lead still qualifies');
    }
    
    // Step 5: Simulate time passing (update timestamp to 25 hours ago)
    console.log('\n5. Simulating 25 hours passing...');
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await db.update(leads)
      .set({ lastMeetingReminderSent: twentyFiveHoursAgo })
      .where(eq(leads.id, createdLead.id));
    console.log('✅ Updated timestamp to 25 hours ago');
    
    // Step 6: Check if lead qualifies again (should qualify after 24 hours)
    console.log('\n6. Checking if lead qualifies again after 25 hours...');
    const leadsAfter25Hours = await MeetingService.getLeadsNeedingMeetingReminders();
    const ourLeadAfter25Hours = leadsAfter25Hours.find(lead => lead.id === createdLead.id);
    
    if (ourLeadAfter25Hours) {
      console.log('✅ SYSTEM WORKING: Lead qualifies again after 24+ hours');
    } else {
      console.log('❌ SYSTEM ISSUE: Lead should qualify after 24+ hours');
    }
    
    // Step 7: Clean up test data
    console.log('\n7. Cleaning up test data...');
    await db.delete(leads).where(eq(leads.id, createdLead.id));
    console.log('✅ Test lead deleted');
    
    console.log('\n' + '=' .repeat(60));
    console.log('🎉 Follow-up Email Duplicate Prevention Test Complete!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

testFollowUpSystem();
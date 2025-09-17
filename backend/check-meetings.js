import { db } from './src/config/index.js';
import { meetings, meetingReminders, leads, leadProcessingLogs } from './src/db/schema.js';
import { count, desc } from 'drizzle-orm';

async function checkMeetings() {
  try {
    console.log('Checking meetings table...');
    
    // Count total meetings
    const [meetingCount] = await db.select({ count: count() }).from(meetings);
    console.log(`Total meetings: ${meetingCount.count}`);
    
    // Get recent meetings
    const recentMeetings = await db
      .select({
        id: meetings.id,
        leadId: meetings.leadId,
        calendlyEventId: meetings.calendlyEventId,
        title: meetings.title,
        startTime: meetings.startTime,
        status: meetings.status,
        createdAt: meetings.createdAt
      })
      .from(meetings)
      .orderBy(desc(meetings.createdAt))
      .limit(10);
    
    console.log('Recent meetings:');
    console.table(recentMeetings);
    
    // Count meeting reminders
    const [reminderCount] = await db.select({ count: count() }).from(meetingReminders);
    console.log(`\nTotal meeting reminders: ${reminderCount.count}`);
    
    // Check leads table for Calendly data
    console.log('\nChecking leads with Calendly data...');
    const leadsWithCalendly = await db
      .select({
        id: leads.id,
        email: leads.email,
        firstName: leads.firstName,
        lastName: leads.lastName,
        status: leads.status,
        calendlyEventUri: leads.calendlyEventUri,
        scheduledAt: leads.scheduledAt,
        createdAt: leads.createdAt,
        updatedAt: leads.updatedAt
      })
      .from(leads)
      .orderBy(desc(leads.updatedAt))
      .limit(10);
    
    console.log('Recent leads:');
    console.table(leadsWithCalendly);
    
    // Check meetings table
    console.log('\nChecking meetings table...');
    const meetingsData = await db.select().from(meetings)
      .orderBy(desc(meetings.createdAt))
      .limit(10);
    
    console.log('Recent meetings:');
    console.table(meetingsData);
    
    // Check meeting reminders table
    console.log('\nChecking meeting reminders table...');
    const meetingRemindersData = await db.select().from(meetingReminders)
      .orderBy(desc(meetingReminders.createdAt))
      .limit(10);
    
    console.log('Recent meeting reminders:');
    console.table(meetingRemindersData);
    
    // Check recent processing logs
    console.log('\nChecking recent processing logs...');
    const recentLogs = await db
      .select({
        id: leadProcessingLogs.id,
        leadId: leadProcessingLogs.leadId,
        trackingId: leadProcessingLogs.trackingId,
        eventType: leadProcessingLogs.eventType,
        success: leadProcessingLogs.success,
        errorMessage: leadProcessingLogs.errorMessage,
        createdAt: leadProcessingLogs.createdAt
      })
      .from(leadProcessingLogs)
      .orderBy(desc(leadProcessingLogs.createdAt))
      .limit(10);
    
    console.log('Recent processing logs:');
    console.table(recentLogs);
    
  } catch (error) {
    console.error('Error checking meetings:', error);
  } finally {
    process.exit(0);
  }
}

checkMeetings();
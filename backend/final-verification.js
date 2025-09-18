import { db } from './src/config/index.js';
import { meetings } from './src/db/schema.js';
import { desc } from 'drizzle-orm';

console.log('Final verification: Checking latest meeting attendee data...');

try {
  const [latestMeeting] = await db
    .select({
      id: meetings.id,
      calendlyEventId: meetings.calendlyEventId,
      attendeeEmail: meetings.attendeeEmail,
      attendeeName: meetings.attendeeName,
      attendeePhone: meetings.attendeePhone,
      createdAt: meetings.createdAt
    })
    .from(meetings)
    .orderBy(desc(meetings.createdAt))
    .limit(1);

  if (latestMeeting) {
    console.log('\n✅ Latest meeting attendee data:');
    console.log(`Meeting ID: ${latestMeeting.id}`);
    console.log(`Calendly Event ID: ${latestMeeting.calendlyEventId}`);
    console.log(`Attendee Email: ${latestMeeting.attendeeEmail}`);
    console.log(`Attendee Name: ${latestMeeting.attendeeName}`);
    console.log(`Attendee Phone: ${latestMeeting.attendeePhone}`);
    console.log(`Created At: ${latestMeeting.createdAt}`);
    
    const hasAttendeeData = latestMeeting.attendeeEmail || latestMeeting.attendeeName;
    console.log(`\n${hasAttendeeData ? '✅' : '❌'} Attendee data populated: ${hasAttendeeData ? 'YES' : 'NO'}`);
    
    if (hasAttendeeData) {
      console.log('🎉 SUCCESS: Meeting attendee fields are now properly populated with lead data!');
    }
  } else {
    console.log('❌ No meetings found in database');
  }
} catch (error) {
  console.error('Error checking meeting data:', error);
} finally {
  process.exit(0);
}
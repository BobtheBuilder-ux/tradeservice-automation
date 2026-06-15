export function buildLeadBookingReminderMessage(lead = {}, bookingLink) {
  const firstName = lead.firstName || lead.first_name || lead.fullName || lead.full_name || 'there';
  const serviceText = lead.serviceInterest ? ` about ${lead.serviceInterest}` : ' about your consultation';

  return `Hi ${firstName}, this is Bob following up${serviceText}. If you're ready, the best next step is to book here: ${bookingLink}. Reply STOP to opt out.`;
}

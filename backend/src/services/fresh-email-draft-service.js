const DEFAULT_COMPANY_NAME = '9QC Inc.';
const DEFAULT_SENDER_NAME = 'Bob';

const GOAL_CONFIG = {
  welcome: {
    subject: 'Welcome — here is the next step',
    intro: 'Thanks for reaching out. You are in the right place, and I would be happy to help you move forward.',
    ctaLabel: 'book a short consultation',
  },
  booking_invite: {
    subject: 'Let’s get your consultation booked',
    intro: 'I’m following up because the best next step is to get your consultation on the calendar.',
    ctaLabel: 'book a short consultation',
  },
  booking_reminder: {
    subject: 'Quick next step',
    intro: 'I’m checking back in because it looks like your consultation is not booked yet.',
    ctaLabel: 'choose a time that works for you',
  },
  qualification_request: {
    subject: 'A few quick details before we book',
    intro: 'Before I point you to the best next step, I want to make sure we understand what you need.',
    ctaLabel: 'reply with a few details',
  },
  reactivation: {
    subject: 'Still interested in support?',
    intro: 'I’m reaching out because you previously showed interest in getting support.',
    ctaLabel: 'book a short consultation or reply with an update',
  },
};

const FORBIDDEN_PATTERNS = [
  /guarantee(d|s)?\b/i,
  /no risk\b/i,
  /limited time only\b/i,
  /act now or lose/i,
  /legal advice/i,
  /tax advice/i,
  /financial advice/i,
];

export function normalizeEmailGoal(goal) {
  return GOAL_CONFIG[goal] ? goal : 'booking_invite';
}

export function buildFreshEmailDraft({ lead = {}, goal = 'booking_invite', bookingLink, senderName = DEFAULT_SENDER_NAME, companyName = DEFAULT_COMPANY_NAME } = {}) {
  const emailGoal = normalizeEmailGoal(goal);
  const config = GOAL_CONFIG[emailGoal];
  const firstName = lead.firstName || lead.fullName?.split(' ')?.[0] || '{{first_name}}';
  const serviceLine = lead.serviceInterest
    ? `I saw that you were interested in ${lead.serviceInterest}.`
    : 'I saw that you were interested in getting business support.';
  const cta = bookingLink || '{{booking_link}}';

  const subject = `${config.subject}, ${firstName}`;
  const bodyText = `Hi ${firstName},\n\n${config.intro}\n\n${serviceLine}\n\nThe best next step is to ${config.ctaLabel}. You can do that here:\n${cta}\n\nBest,\n${senderName}\n${companyName}`;
  const bodyHtml = bodyText
    .split('\n\n')
    .map((paragraph) => `<p>${paragraph.replaceAll('\n', '<br />')}</p>`)
    .join('\n');

  return {
    emailGoal,
    subject,
    bodyText,
    bodyHtml,
    cta,
    senderName,
    companyName,
  };
}

export function validateFreshEmailDraft(draft, lead = {}) {
  const errors = [];
  const warnings = [];
  const content = `${draft?.subject || ''}\n${draft?.bodyText || ''}`;

  if (!lead.email) errors.push('Lead has no email address.');
  if (lead.optedOut || lead.unsubscribed) errors.push('Lead has opted out of outreach.');
  if (lead.automationPaused) errors.push('Automation is paused for this lead.');
  if (lead.requiresHumanReview) warnings.push('Lead is marked for human review; draft should be approved before sending.');
  if (lead.meetingScheduled || lead.scheduledAt) warnings.push('Lead already has a meeting scheduled; confirm this email is still needed.');
  if (!draft?.subject) errors.push('Draft subject is required.');
  if (!draft?.bodyText) errors.push('Draft body is required.');
  if (!draft?.cta) warnings.push('Draft is missing a clear call to action.');

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(content)) {
      errors.push('Draft contains pressure, guarantee, or regulated-advice language.');
      break;
    }
  }

  return {
    approvedForQueue: errors.length === 0 && warnings.length === 0,
    requiresApproval: warnings.length > 0,
    errors,
    warnings,
  };
}

export function buildFreshEmailActionPayload({ lead, goal, bookingLink, requestedBy }) {
  const draft = buildFreshEmailDraft({ lead, goal, bookingLink });
  const safety = validateFreshEmailDraft(draft, lead);

  return {
    ...draft,
    safety,
    requestedBy: requestedBy || null,
    generatedAt: new Date().toISOString(),
    source: 'bob_fresh_email_draft',
  };
}

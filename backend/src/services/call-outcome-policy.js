const OUTCOME_PATCHES = {
  booked: {
    leadStatus: 'scheduled',
    leadStage: 'booked',
    schedulingState: 'scheduled',
    requiresHumanReview: false,
    nextContactDelayHours: null,
  },
  no_answer: {
    leadStatus: 'contacted',
    leadStage: 'nurturing',
    schedulingState: 'needs_follow_up',
    requiresHumanReview: false,
    nextContactDelayHours: 24,
  },
  callback_requested: {
    leadStatus: 'contacted',
    leadStage: 'nurturing',
    schedulingState: 'needs_follow_up',
    requiresHumanReview: false,
    nextContactDelayHours: 24,
  },
  wrong_number: {
    leadStatus: 'contacted',
    leadStage: 'escalated',
    schedulingState: 'needs_follow_up',
    requiresHumanReview: true,
    escalationReason: 'wrong_phone_number',
    nextContactDelayHours: null,
  },
  not_interested: {
    leadStatus: 'closed',
    leadStage: 'closed_lost',
    schedulingState: 'not_interested',
    requiresHumanReview: false,
    nextContactDelayHours: null,
  },
  needs_human_follow_up: {
    leadStatus: 'contacted',
    leadStage: 'escalated',
    schedulingState: 'needs_follow_up',
    requiresHumanReview: true,
    escalationReason: 'call_outcome_requires_human_follow_up',
    nextContactDelayHours: null,
  },
};

export const CALL_OUTCOMES = Object.freeze(Object.keys(OUTCOME_PATCHES));

export function isValidCallOutcome(outcome) {
  return CALL_OUTCOMES.includes(outcome);
}

export function buildCallOutcomeLeadPatch(outcome, now = new Date()) {
  const outcomePatch = OUTCOME_PATCHES[outcome];
  if (!outcomePatch) {
    throw new Error(`Unsupported call outcome: ${outcome}`);
  }

  const patch = {
    status: outcomePatch.leadStatus,
    leadStage: outcomePatch.leadStage,
    schedulingState: outcomePatch.schedulingState,
    requiresHumanReview: outcomePatch.requiresHumanReview,
    escalationReason: outcomePatch.escalationReason || null,
    nextContactAt: outcomePatch.nextContactDelayHours
      ? new Date(now.getTime() + outcomePatch.nextContactDelayHours * 60 * 60 * 1000)
      : null,
    updatedAt: now,
  };

  return patch;
}

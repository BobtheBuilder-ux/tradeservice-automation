function hasTerminalOutcome(action = {}) {
  return Boolean(action?.result?.outcome);
}

function wasAnswered(action = {}, callStatus) {
  const providerStatus = action?.result?.providerStatus;
  return callStatus === 'completed' && ['answered', 'in-progress', 'completed'].includes(providerStatus || 'answered');
}

function shouldSendPostCallBookingSms(action = {}, callStatus = '') {
  if (callStatus !== 'completed') return false;
  if (action?.result?.bookingSmsAttempted) return false;
  if (action?.result?.outcome === 'send_booking_link') return false;
  if (hasTerminalOutcome(action) && action?.result?.outcome !== 'incomplete_call') return false;
  return wasAnswered(action, callStatus);
}

function resolveCompletedOutcome(action = {}) {
  if (action?.result?.outcome) return action.result.outcome;
  return 'incomplete_call';
}

function getCallRetryConfig() {
  return {
    retryLimit: Number(process.env.CALL_RETRY_LIMIT || 2),
    retryDelayMinutes: Number(process.env.CALL_RETRY_DELAY_MINUTES || 30),
  };
}

function getCallAttemptCount(action = {}) {
  return Number(action?.result?.callAttemptCount || action?.result?.callRetryCount || 0);
}

function buildTerminalCallActionPatch({
  action = {},
  callSid = null,
  callStatus = '',
  callDuration = null,
  now = new Date(),
  retryLimit,
  retryDelayMinutes,
} = {}) {
  const existingResult = action.result || {};
  const config = getCallRetryConfig();
  const effectiveRetryLimit = Number(retryLimit ?? config.retryLimit);
  const effectiveRetryDelayMinutes = Number(retryDelayMinutes ?? config.retryDelayMinutes);
  const callAttemptCount = getCallAttemptCount(action) + 1;
  const shouldRetry = callAttemptCount < effectiveRetryLimit;
  const scheduledFor = new Date(now.getTime() + effectiveRetryDelayMinutes * 60 * 1000);

  return {
    status: shouldRetry ? 'awaiting_call' : 'completed',
    scheduledFor: shouldRetry ? scheduledFor : null,
    executedAt: shouldRetry ? action.executedAt || null : now,
    result: {
      ...existingResult,
      callSid: callSid || existingResult.callSid || null,
      providerStatus: callStatus,
      callDuration: callDuration || existingResult.callDuration || null,
      callAttemptCount,
      nextRetryAt: shouldRetry ? scheduledFor.toISOString() : null,
      retryLimit: effectiveRetryLimit,
      outcome: shouldRetry ? existingResult.outcome || null : 'needs_human_review',
      retryExhausted: !shouldRetry,
      error: shouldRetry
        ? `Call ended with ${callStatus}; retry scheduled`
        : `Call ended with ${callStatus}; retry limit reached`,
    },
    updatedAt: now,
  };
}

function buildCompletedCallActionPatch({ action = {}, callSid = null, callStatus = 'completed', callDuration = null, smsResult = null } = {}) {
  const existingResult = action.result || {};
  const attemptedSms = Boolean(smsResult);
  return {
    status: 'completed',
    result: {
      ...existingResult,
      callSid: callSid || existingResult.callSid || null,
      providerStatus: callStatus,
      callDuration: callDuration || existingResult.callDuration || null,
      outcome: resolveCompletedOutcome(action),
      bookingSmsAttempted: attemptedSms || existingResult.bookingSmsAttempted || false,
      bookingSmsSent: attemptedSms ? Boolean(smsResult?.success) : existingResult.bookingSmsSent || false,
      bookingSmsMessageSid: smsResult?.messageSid || existingResult.bookingSmsMessageSid || null,
      bookingSmsStatus: smsResult?.status || existingResult.bookingSmsStatus || null,
      bookingSmsError: smsResult?.success === false ? smsResult.error : existingResult.bookingSmsError || null,
    },
    updatedAt: new Date(),
  };
}

export {
  shouldSendPostCallBookingSms,
  buildCompletedCallActionPatch,
  buildTerminalCallActionPatch,
};

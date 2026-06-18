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

export { shouldSendPostCallBookingSms, buildCompletedCallActionPatch };

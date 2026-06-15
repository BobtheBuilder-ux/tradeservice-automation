import assert from 'node:assert/strict';
import test from 'node:test';
import { BobDecisionEngine } from '../src/services/bob-decision-engine.js';

const engine = new BobDecisionEngine();

const baseLead = (overrides = {}) => ({
  id: 'lead-1',
  email: 'lead@example.com',
  firstName: 'Lead',
  fullName: 'Lead Example',
  status: 'new',
  createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
  ...overrides,
});

const baseConversation = (overrides = {}) => ({
  id: 'conversation-1',
  channel: 'email',
  metadata: {},
  conversationStatus: 'active_nurture',
  ...overrides,
});

const decide = (lead, conversation = null) => {
  const context = engine.buildLeadContext(lead, conversation);
  return engine.decideNextAction(context);
};

test('missing lead returns noop', () => {
  const decision = decide(null);

  assert.equal(decision.actionType, 'noop');
  assert.equal(decision.channel, 'system');
});

test('opted-out lead is held and not contacted', () => {
  const decision = decide(baseLead(), baseConversation({ optedOut: true }));

  assert.equal(decision.actionType, 'hold');
  assert.equal(decision.payload.status, 'do_not_contact');
});

test('paused automation is held and not contacted', () => {
  const decision = decide(baseLead({ automationPaused: true }), baseConversation());

  assert.equal(decision.actionType, 'hold');
  assert.equal(decision.payload.status, 'paused');
});

test('lead requiring human review is marked ready for human', () => {
  const decision = decide(baseLead({ requiresHumanReview: true, escalationReason: 'needs manual review' }), baseConversation());

  assert.equal(decision.actionType, 'mark_ready_for_human');
  assert.equal(decision.channel, 'system');
  assert.equal(decision.payload.escalationReason, 'needs manual review');
});

test('scheduled meeting is monitored instead of contacted', () => {
  const decision = decide(baseLead({ meetingScheduled: true }), baseConversation());

  assert.equal(decision.actionType, 'monitor_meeting');
  assert.equal(decision.channel, 'system');
});

test('unassigned lead is assigned before outreach', () => {
  const decision = decide(baseLead(), baseConversation());

  assert.equal(decision.actionType, 'assign_lead');
  assert.equal(decision.channel, 'system');
});

test('assigned unqualified lead without outbound history requests more information', () => {
  const decision = decide(baseLead({ assignedAgentId: 'agent-1', qualificationStatus: 'unqualified' }), baseConversation());

  assert.equal(decision.actionType, 'request_more_info');
  assert.equal(decision.channel, 'email');
  assert.equal(decision.payload.template, 'qualification_request');
});

test('assigned qualified lead without outbound history receives booking invite', () => {
  const decision = decide(baseLead({ assignedAgentId: 'agent-1', qualificationStatus: 'qualified' }), baseConversation());

  assert.equal(decision.actionType, 'send_booking_invite');
  assert.equal(decision.channel, 'email');
  assert.equal(decision.payload.template, 'booking_invite');
});

test('recent outbound contact keeps lead in wait state', () => {
  const decision = decide(
    baseLead({ assignedAgentId: 'agent-1', qualificationStatus: 'qualified' }),
    baseConversation({
      lastOutboundAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      metadata: { outboundCount: 1 },
    })
  );

  assert.equal(decision.actionType, 'wait');
});

test('qualified lead needing follow-up receives booking reminder after response window', () => {
  const decision = decide(
    baseLead({ assignedAgentId: 'agent-1', qualificationStatus: 'qualified', schedulingState: 'needs_follow_up' }),
    baseConversation({
      lastOutboundAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      metadata: { outboundCount: 1 },
    })
  );

  assert.equal(decision.actionType, 'send_booking_reminder');
  assert.equal(decision.payload.template, 'booking_reminder');
});

test('lead with future nextContactAt waits until the contact policy allows outreach', () => {
  const nextContactAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const decision = decide(
    baseLead({ assignedAgentId: 'agent-1', qualificationStatus: 'qualified', nextContactAt }),
    baseConversation()
  );

  assert.equal(decision.actionType, 'wait');
  assert.equal(decision.payload.reasonCode, 'next_contact_not_due');
  assert.equal(decision.scheduledFor.toISOString(), nextContactAt);
});

test('lead at max email attempts is escalated instead of emailed again', () => {
  const decision = decide(
    baseLead({ assignedAgentId: 'agent-1', qualificationStatus: 'qualified', schedulingState: 'needs_follow_up' }),
    baseConversation({
      lastOutboundAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
      metadata: { outboundCount: 4 },
    })
  );

  assert.equal(decision.actionType, 'mark_ready_for_human');
  assert.equal(decision.payload.escalationReason, 'max_email_attempts');
});

test('lead with repeated outreach and phone queues call attempt after 72 hours', () => {
  const decision = decide(
    baseLead({
      assignedAgentId: 'agent-1',
      phone: '+15555550123',
      qualificationStatus: 'qualified',
      schedulingState: 'booking_invited',
      createdAt: new Date(Date.now() - 80 * 60 * 60 * 1000).toISOString(),
    }),
    baseConversation({
      lastOutboundAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      metadata: { outboundCount: 2 },
    })
  );

  assert.equal(decision.actionType, 'queue_call_attempt');
  assert.equal(decision.channel, 'phone');
});

test('lead with repeated outreach and no phone is escalated to human review', () => {
  const decision = decide(
    baseLead({
      assignedAgentId: 'agent-1',
      phone: null,
      qualificationStatus: 'qualified',
      schedulingState: 'booking_invited',
      createdAt: new Date(Date.now() - 80 * 60 * 60 * 1000).toISOString(),
    }),
    baseConversation({
      lastOutboundAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      metadata: { outboundCount: 2 },
    })
  );

  assert.equal(decision.actionType, 'mark_ready_for_human');
  assert.equal(decision.channel, 'system');
  assert.equal(decision.payload.escalationReason, 'needs_phone_or_manual_follow_up');
});

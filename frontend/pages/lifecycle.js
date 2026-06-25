import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  PauseCircle,
  RefreshCw,
  Save,
  Settings,
} from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../lib/auth';
import {
  getTenantLifecycleRules,
  listLeadLifecycleEvents,
  listLeads,
  updateLeadReview,
  updateTenantLifecycleRules,
} from '../lib/insforge-product';

const channelLabels = {
  call: 'Call',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  email: 'Email',
  messenger: 'Messenger',
  system: 'System',
  manual: 'Manual',
};

const stageTones = {
  booked: 'bg-success-soft text-success',
  callback_scheduled: 'bg-info-soft text-info',
  booking_requested: 'bg-info-soft text-info',
  booking_offered: 'bg-info-soft text-info',
  nurture: 'bg-warning-soft text-warning',
  not_interested_now: 'bg-warning-soft text-warning',
  do_not_contact: 'bg-error-soft text-error',
  closed_lost: 'bg-error-soft text-error',
  closed_won: 'bg-success-soft text-success',
  paused: 'bg-warning-soft text-warning',
  human_review: 'bg-warning-soft text-warning',
};

function pretty(value) {
  if (!value) return 'Not set';
  return String(value).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value) {
  if (!value) return 'Not scheduled';
  try {
    return format(new Date(value), 'MMM d, yyyy HH:mm');
  } catch {
    return 'Invalid date';
  }
}

function Badge({ value, tone }) {
  const normalized = value || 'draft';
  return (
    <span className={`ops-badge ${tone || stageTones[normalized] || 'bg-surface-secondary text-text-secondary'}`}>
      {pretty(normalized)}
    </span>
  );
}

function metricValue(rows, predicate) {
  return rows.filter(predicate).length;
}

function buildRuleForm(rules) {
  return {
    maxCallAttempts: rules?.maxCallAttempts || 3,
    channelOrder: rules?.channelOrder?.length ? rules.channelOrder : ['call', 'sms', 'whatsapp', 'email'],
    voicemailAllowed: Boolean(rules?.voicemailAllowed),
    notInterestedNowDelayDays: rules?.nurturePolicy?.notInterestedNowDelayDays || 30,
    checkupCadenceDays: (rules?.nurturePolicy?.checkupCadenceDays || [7, 14, 30]).join(', '),
    maxCheckups: rules?.nurturePolicy?.maxCheckups || 3,
    missingConsent: rules?.humanReviewTriggers?.missingConsent !== false,
    missingChannelSetup: rules?.humanReviewTriggers?.missingChannelSetup !== false,
    ambiguousIntent: rules?.humanReviewTriggers?.ambiguousIntent !== false,
    repeatedFailedAttempts: rules?.humanReviewTriggers?.repeatedFailedAttempts !== false,
    offDutyBehavior: rules?.offDutyCallPolicy?.behavior || 'defer_to_next_business_window',
  };
}

function parseCadence(value) {
  return String(value || '')
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0)
    .slice(0, 6);
}

export default function LifecyclePage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [leads, setLeads] = useState([]);
  const [events, setEvents] = useState([]);
  const [rules, setRules] = useState(null);
  const [ruleForm, setRuleForm] = useState(buildRuleForm(null));
  const [queueFilter, setQueueFilter] = useState('all');

  const fetchLifecycle = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError('');
      const [loadedLeads, loadedEvents, loadedRules] = await Promise.all([
        listLeads(user, 10000),
        listLeadLifecycleEvents(user, { limit: 300 }),
        getTenantLifecycleRules(user),
      ]);
      setLeads(loadedLeads);
      setEvents(loadedEvents);
      setRules(loadedRules);
      setRuleForm(buildRuleForm(loadedRules));
    } catch (err) {
      setError(err.message || 'Failed to load lifecycle data');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (user?.role !== 'admin') {
      router.push('/login');
      return;
    }
    fetchLifecycle();
  }, [authLoading, fetchLifecycle, isAuthenticated, user, router]);

  const latestEventByLeadId = useMemo(() => {
    const map = new Map();
    events.forEach((event) => {
      if (!event.leadId || map.has(event.leadId)) return;
      map.set(event.leadId, event);
    });
    return map;
  }, [events]);

  const lifecycleRows = useMemo(() => leads.map((lead) => {
    const latestEvent = latestEventByLeadId.get(lead.id) || null;
    const stage = lead.doNotContact ? 'do_not_contact'
      : lead.automationPaused ? 'paused'
        : lead.requiresHumanReview ? 'human_review'
          : lead.leadStage || 'new';
    const nextActionType = latestEvent?.nextActionType || lead.nextAction || null;
    const nextActionChannel = latestEvent?.nextActionChannel || lead.preferredContactChannel || null;
    const nextActionAt = latestEvent?.nextActionAt || lead.nextContactAt || null;
    const blockedReason = latestEvent?.blockedReason || (lead.doNotContact ? 'do_not_contact' : null);
    return {
      lead,
      latestEvent,
      stage,
      outcome: latestEvent?.outcome || lead.lastIntent || null,
      nextActionType,
      nextActionChannel,
      nextActionAt,
      reason: latestEvent?.reason || lead.escalationReason || 'No lifecycle reason recorded yet.',
      blockedReason,
    };
  }), [leads, latestEventByLeadId]);

  const filteredRows = useMemo(() => lifecycleRows.filter((row) => {
    if (queueFilter === 'all') return true;
    if (queueFilter === 'human_review') return row.lead.requiresHumanReview;
    if (queueFilter === 'paused') return row.lead.automationPaused;
    if (queueFilter === 'blocked') return Boolean(row.blockedReason || row.lead.doNotContact);
    if (queueFilter === 'callback') return row.stage === 'callback_scheduled' || row.outcome === 'callback_requested';
    if (queueFilter === 'nurture') return row.stage === 'nurture' || row.stage === 'not_interested_now';
    if (queueFilter === 'scheduled') return Boolean(row.nextActionAt);
    return true;
  }), [lifecycleRows, queueFilter]);

  const metrics = [
    { label: 'Tracked leads', value: lifecycleRows.length, tone: 'bg-accent-soft text-accent' },
    { label: 'Scheduled next', value: metricValue(lifecycleRows, (row) => Boolean(row.nextActionAt)), tone: 'bg-info-soft text-info' },
    { label: 'Callbacks', value: metricValue(lifecycleRows, (row) => row.stage === 'callback_scheduled' || row.outcome === 'callback_requested'), tone: 'bg-info-soft text-info' },
    { label: 'Nurture', value: metricValue(lifecycleRows, (row) => row.stage === 'nurture' || row.stage === 'not_interested_now'), tone: 'bg-warning-soft text-warning' },
    { label: 'Human review', value: metricValue(lifecycleRows, (row) => row.lead.requiresHumanReview), tone: 'bg-warning-soft text-warning' },
    { label: 'Blocked', value: metricValue(lifecycleRows, (row) => Boolean(row.blockedReason || row.lead.doNotContact)), tone: 'bg-error-soft text-error' },
  ];

  async function handleAutomationToggle(row) {
    const paused = !row.lead.automationPaused;
    try {
      setSaving(true);
      setError('');
      setNotice('');
      const updated = await updateLeadReview(user, row.lead.id, {
        automationPaused: paused,
        requiresHumanReview: paused ? row.lead.requiresHumanReview : false,
        escalationReason: paused ? 'Admin paused automation from lifecycle page' : '',
      });
      setLeads((current) => current.map((lead) => (lead.id === updated.id ? updated : lead)));
      setNotice(paused ? 'Automation paused for this lead' : 'Automation resumed for this lead');
    } catch (err) {
      setError(err.message || 'Failed to update automation state');
    } finally {
      setSaving(false);
    }
  }

  function moveChannel(channel, direction) {
    setRuleForm((current) => {
      const index = current.channelOrder.indexOf(channel);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.channelOrder.length) return current;
      const channelOrder = [...current.channelOrder];
      channelOrder[index] = current.channelOrder[nextIndex];
      channelOrder[nextIndex] = channel;
      return { ...current, channelOrder };
    });
  }

  function toggleRuleChannel(channel) {
    setRuleForm((current) => {
      const exists = current.channelOrder.includes(channel);
      if (exists && current.channelOrder.length === 1) return current;
      return {
        ...current,
        channelOrder: exists
          ? current.channelOrder.filter((item) => item !== channel)
          : [...current.channelOrder, channel],
      };
    });
  }

  async function handleSaveRules(event) {
    event.preventDefault();
    try {
      setSaving(true);
      setError('');
      setNotice('');
      const cadence = parseCadence(ruleForm.checkupCadenceDays);
      const updated = await updateTenantLifecycleRules(user, {
        maxCallAttempts: ruleForm.maxCallAttempts,
        channelOrder: ruleForm.channelOrder,
        voicemailAllowed: ruleForm.voicemailAllowed,
        nurturePolicy: {
          ...(rules?.nurturePolicy || {}),
          notInterestedNowDelayDays: Number(ruleForm.notInterestedNowDelayDays) || 30,
          checkupCadenceDays: cadence.length ? cadence : [7, 14, 30],
          maxCheckups: Number(ruleForm.maxCheckups) || 3,
        },
        humanReviewTriggers: {
          ...(rules?.humanReviewTriggers || {}),
          missingConsent: ruleForm.missingConsent,
          missingChannelSetup: ruleForm.missingChannelSetup,
          ambiguousIntent: ruleForm.ambiguousIntent,
          repeatedFailedAttempts: ruleForm.repeatedFailedAttempts,
        },
        offDutyCallPolicy: {
          ...(rules?.offDutyCallPolicy || {}),
          behavior: ruleForm.offDutyBehavior,
          respectTenantBusinessHours: true,
        },
      });
      setRules(updated);
      setRuleForm(buildRuleForm(updated));
      setNotice('Lifecycle rules saved');
    } catch (err) {
      setError(err.message || 'Failed to save lifecycle rules');
    } finally {
      setSaving(false);
    }
  }

  if (loading || authLoading) {
    return (
      <main className="min-h-screen bg-background px-4 py-6 text-text-primary sm:px-6">
        <div className="mx-auto max-w-[1440px]">
          <div className="ops-panel p-4 text-sm text-text-secondary">Loading lifecycle...</div>
        </div>
      </main>
    );
  }

  return (
    <>
      <Head>
        <title>Lifecycle - SetMyMeet</title>
      </Head>

      <main className="min-h-screen bg-background px-4 py-6 text-text-primary sm:px-6">
        <div className="mx-auto max-w-[1440px] space-y-6">
          <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-medium text-text-muted">Automation</p>
              <h1 className="text-2xl font-semibold text-text-primary">Lifecycle</h1>
              <p className="mt-1 max-w-3xl text-sm text-text-secondary">
                See what the system will do next, why it chose that step, and which leads are blocked or waiting for review.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="ops-button-secondary" onClick={() => router.push('/admin-dashboard')}>
                <Bot className="h-4 w-4" aria-hidden="true" />
                Dashboard
              </button>
              <button type="button" className="ops-button-secondary" onClick={fetchLifecycle} disabled={saving}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Refresh
              </button>
            </div>
          </header>

          {error ? (
            <div className="ops-panel border-error bg-error-soft px-4 py-3 text-sm font-medium text-error">
              <AlertCircle className="mr-2 inline h-4 w-4" aria-hidden="true" />
              {error}
            </div>
          ) : null}
          {notice ? (
            <div className="ops-panel border-success bg-success-soft px-4 py-3 text-sm font-medium text-success">
              <Check className="mr-2 inline h-4 w-4" aria-hidden="true" />
              {notice}
            </div>
          ) : null}

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {metrics.map((metric) => (
              <div key={metric.label} className="ops-panel p-4">
                <p className="text-xs font-medium text-text-muted">{metric.label}</p>
                <p className={`mt-2 text-2xl font-semibold ${metric.tone}`}>{metric.value}</p>
              </div>
            ))}
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
            <section className="ops-panel overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-border px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-text-primary">Lead lifecycle queue</h2>
                  <p className="mt-1 text-xs text-text-muted">Lead stage, latest outcome, next action, and blocked reason.</p>
                </div>
                <select className="ops-select lg:w-56" value={queueFilter} onChange={(event) => setQueueFilter(event.target.value)}>
                  <option value="all">All lifecycle states</option>
                  <option value="scheduled">Scheduled next action</option>
                  <option value="callback">Callback</option>
                  <option value="nurture">Nurture</option>
                  <option value="human_review">Human review</option>
                  <option value="paused">Paused</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-surface-secondary">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">Lead</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">Lifecycle</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">Next action</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">Reason</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">Control</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-surface">
                    {filteredRows.length ? filteredRows.map((row) => (
                      <tr key={row.lead.id} className="align-top">
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-text-primary">{row.lead.fullName || 'No name'}</div>
                          <div className="mt-1 text-xs text-text-muted">{row.lead.email || row.lead.phone || 'No contact detail'}</div>
                          {row.lead.serviceInterest ? <div className="mt-1 text-xs text-text-secondary">{row.lead.serviceInterest}</div> : null}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Badge value={row.stage} />
                            {row.outcome ? <Badge value={row.outcome} tone="bg-surface-secondary text-text-secondary" /> : null}
                          </div>
                          {row.blockedReason ? <p className="mt-2 text-xs text-error">{pretty(row.blockedReason)}</p> : null}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-text-primary">{pretty(row.nextActionType || 'No action')}</div>
                          <div className="mt-1 text-xs text-text-muted">{channelLabels[row.nextActionChannel] || pretty(row.nextActionChannel)}</div>
                          <div className="mt-1 text-xs text-text-muted">{formatDate(row.nextActionAt)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="max-w-md text-sm leading-5 text-text-secondary">{row.reason}</p>
                          {row.latestEvent?.createdAt ? (
                            <p className="mt-1 text-xs text-text-muted">Updated {formatDate(row.latestEvent.createdAt)}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <button type="button" className="ops-button-secondary h-8 px-2" onClick={() => handleAutomationToggle(row)} disabled={saving || row.lead.doNotContact}>
                            <PauseCircle className="h-4 w-4" aria-hidden="true" />
                            {row.lead.automationPaused ? 'Resume' : 'Pause'}
                          </button>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan="5" className="px-4 py-8 text-center text-sm text-text-muted">
                          No leads match this lifecycle queue.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <aside className="space-y-6">
              <form className="ops-panel" onSubmit={handleSaveRules}>
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Settings className="h-4 w-4 text-text-muted" aria-hidden="true" />
                    <h2 className="text-sm font-semibold text-text-primary">Lifecycle rules</h2>
                  </div>
                  <Badge value="Active" tone="bg-success-soft text-success" />
                </div>

                <div className="space-y-4 p-4">
                  <label className="block">
                    <span className="text-xs font-medium text-text-muted">Max call attempts</span>
                    <input
                      className="ops-input mt-1"
                      type="number"
                      min="1"
                      max="10"
                      value={ruleForm.maxCallAttempts}
                      onChange={(event) => setRuleForm({ ...ruleForm, maxCallAttempts: event.target.value })}
                    />
                  </label>

                  <div>
                    <p className="text-xs font-medium text-text-muted">Channel order</p>
                    <div className="mt-2 space-y-2">
                      {['call', 'sms', 'whatsapp', 'email'].map((channel) => {
                        const enabled = ruleForm.channelOrder.includes(channel);
                        return (
                          <div key={channel} className="flex items-center justify-between rounded-lg border border-border bg-surface-secondary px-3 py-2">
                            <label className="flex items-center gap-2 text-sm text-text-primary">
                              <input type="checkbox" checked={enabled} onChange={() => toggleRuleChannel(channel)} />
                              {channelLabels[channel]}
                            </label>
                            <div className="flex gap-1">
                              <button type="button" className="ops-button-secondary h-7 w-7 px-0" onClick={() => moveChannel(channel, -1)} disabled={!enabled}>
                                <ArrowUp className="h-3 w-3" aria-hidden="true" />
                              </button>
                              <button type="button" className="ops-button-secondary h-7 w-7 px-0" onClick={() => moveChannel(channel, 1)} disabled={!enabled}>
                                <ArrowDown className="h-3 w-3" aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <label className="flex items-center justify-between rounded-lg border border-border bg-surface-secondary px-3 py-2">
                    <span className="text-sm text-text-primary">Voicemail recovery allowed</span>
                    <input type="checkbox" checked={ruleForm.voicemailAllowed} onChange={(event) => setRuleForm({ ...ruleForm, voicemailAllowed: event.target.checked })} />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-xs font-medium text-text-muted">Not-now delay days</span>
                      <input className="ops-input mt-1" type="number" min="1" value={ruleForm.notInterestedNowDelayDays} onChange={(event) => setRuleForm({ ...ruleForm, notInterestedNowDelayDays: event.target.value })} />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-text-muted">Max checkups</span>
                      <input className="ops-input mt-1" type="number" min="1" max="12" value={ruleForm.maxCheckups} onChange={(event) => setRuleForm({ ...ruleForm, maxCheckups: event.target.value })} />
                    </label>
                  </div>

                  <label className="block">
                    <span className="text-xs font-medium text-text-muted">Checkup cadence days</span>
                    <input className="ops-input mt-1" value={ruleForm.checkupCadenceDays} onChange={(event) => setRuleForm({ ...ruleForm, checkupCadenceDays: event.target.value })} />
                  </label>

                  <div>
                    <p className="text-xs font-medium text-text-muted">Human review triggers</p>
                    <div className="mt-2 grid gap-2">
                      {[
                        ['missingConsent', 'Missing consent'],
                        ['missingChannelSetup', 'Missing channel setup'],
                        ['ambiguousIntent', 'Ambiguous intent'],
                        ['repeatedFailedAttempts', 'Repeated failed attempts'],
                      ].map(([key, label]) => (
                        <label key={key} className="flex items-center justify-between rounded-lg border border-border bg-surface-secondary px-3 py-2">
                          <span className="text-sm text-text-primary">{label}</span>
                          <input type="checkbox" checked={ruleForm[key]} onChange={(event) => setRuleForm({ ...ruleForm, [key]: event.target.checked })} />
                        </label>
                      ))}
                    </div>
                  </div>

                  <label className="block">
                    <span className="text-xs font-medium text-text-muted">Off-duty calls</span>
                    <select className="ops-select mt-1" value={ruleForm.offDutyBehavior} onChange={(event) => setRuleForm({ ...ruleForm, offDutyBehavior: event.target.value })}>
                      <option value="defer_to_next_business_window">Defer to next business window</option>
                      <option value="human_review">Require human review</option>
                    </select>
                  </label>
                </div>

                <div className="border-t border-border px-4 py-3">
                  <button type="submit" className="ops-button-primary w-full" disabled={saving}>
                    <Save className="h-4 w-4" aria-hidden="true" />
                    Save lifecycle rules
                  </button>
                </div>
              </form>

              <section className="ops-panel">
                <div className="border-b border-border px-4 py-3">
                  <h2 className="text-sm font-semibold text-text-primary">Recent lifecycle events</h2>
                </div>
                <div className="space-y-3 p-4">
                  {events.slice(0, 8).map((event) => (
                    <div key={event.id} className="rounded-lg border border-border bg-surface-secondary px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge value={event.outcome || event.nextStage || 'event'} />
                        <span className="text-xs text-text-muted">{formatDate(event.createdAt)}</span>
                      </div>
                      <p className="mt-2 text-sm text-text-secondary">{event.reason || event.blockedReason || 'Lifecycle event recorded.'}</p>
                      {event.nextActionType ? (
                        <p className="mt-1 text-xs text-text-muted">
                          Next: {pretty(event.nextActionType)} {event.nextActionAt ? `at ${formatDate(event.nextActionAt)}` : ''}
                        </p>
                      ) : null}
                    </div>
                  ))}
                  {!events.length ? (
                    <div className="rounded-lg border border-border bg-surface-secondary px-3 py-4 text-center text-sm text-text-muted">
                      No lifecycle events have been recorded yet.
                    </div>
                  ) : null}
                </div>
              </section>
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { AlertCircle, CheckCircle2, Mail, MessageSquare, Phone, Play, RefreshCw, ShieldCheck, SkipForward } from 'lucide-react';
import { invokeFunction } from '../lib/insforge-functions';
import { useAuth } from '../lib/auth';
import { getTenantOnboardingRedirect } from '../lib/insforge-product';

const CONFIRMATION = 'RUN LIVE TEST';

function freshEmail() {
  return `live-test-${Date.now()}@example.com`;
}

const initialForm = {
  email: '',
  firstName: 'Live',
  lastName: 'Test',
  phone: '+14384838093',
  serviceInterest: 'Trade service consultation',
  locationSummary: 'Toronto, ON',
  preferredMeetingWindow: 'Any time during this test window',
  includeEmail: true,
  includeSms: true,
  includeCall: true,
  emailConsent: true,
  callConsent: false,
  smsConsent: false,
  confirmationText: '',
};

function formatTime(value) {
  if (!value) return 'N/A';
  try {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'N/A';
  }
}

function statusTone(status) {
  if (status === 'completed') return 'bg-green-100 text-green-800';
  if (status === 'failed') return 'bg-red-100 text-red-800';
  if (status === 'skipped') return 'bg-gray-100 text-gray-700';
  if (status === 'processing' || status === 'calling') return 'bg-indigo-100 text-indigo-800';
  if (status === 'awaiting_call') return 'bg-cyan-100 text-cyan-800';
  return 'bg-blue-100 text-blue-800';
}

export default function LiveAutomationTest() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [ticking, setTicking] = useState(false);
  const [run, setRun] = useState(null);
  const [error, setError] = useState('');
  const [autoTick, setAutoTick] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [skippingActionId, setSkippingActionId] = useState('');

  const status = run?.status;
  const leadId = status?.lead?.id || run?.lead?.id;
  const conversationId = status?.conversation?.id || run?.conversation?.id;
  const liveTestEndsAt = status?.conversation?.metadata?.liveTestEndsAt;
  const runActive = Boolean(leadId && liveTestEndsAt && currentTime < new Date(liveTestEndsAt).getTime());
  const smsConsentRequired = form.includeSms;
  const callConsentRequired = form.includeCall;
  const emailConsentRequired = form.includeEmail;

  const channelSummary = useMemo(() => [
    form.includeEmail ? 'email' : null,
    form.includeSms ? 'SMS' : null,
    form.includeCall ? 'voice call' : null,
  ].filter(Boolean).join(', '), [form]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError('');
  };

  useEffect(() => {
    let cancelled = false;
    async function guardReadiness() {
      if (authLoading) return;
      if (!isAuthenticated) {
        router.replace('/login');
        return;
      }
      const redirect = await getTenantOnboardingRedirect(user);
      if (!cancelled && redirect === '/onboarding') router.replace('/onboarding');
    }
    guardReadiness();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, user, router]);

  const resetForm = () => {
    setForm({ ...initialForm, email: freshEmail() });
    setRun(null);
    setError('');
  };

  const startRun = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data = await invokeFunction('bob-queue-actions', { action: 'live-start', body: { ...form, tenantId: user?.tenantId } });
      setRun(data);
    } catch (err) {
      setError(err.message || 'Failed to start live automation test');
    } finally {
      setLoading(false);
    }
  };

  const processTick = useCallback(async ({ silent = false } = {}) => {
    if (!leadId || !conversationId) return;
    if (!silent) setError('');
    setTicking(true);

    try {
      const data = await invokeFunction('bob-queue-actions', { action: 'tick', body: { tenantId: user?.tenantId, leadId, conversationId, silent } });
      setRun((current) => ({
        ...(current || {}),
        tick: data.tick,
        status: data.status,
      }));
    } catch (err) {
      if (!silent) setError(err.message || 'Failed to process live automation tick');
    } finally {
      setTicking(false);
    }
  }, [conversationId, leadId]);

  useEffect(() => {
    setForm((current) => (current.email ? current : { ...current, email: freshEmail() }));
    setCurrentTime(Date.now());
    const intervalId = setInterval(() => {
      setCurrentTime(Date.now());
    }, 30_000);

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!autoTick || !runActive || !leadId || !conversationId) return undefined;

    const intervalId = setInterval(() => {
      processTick({ silent: true });
    }, 60_000);

    return () => clearInterval(intervalId);
  }, [autoTick, runActive, leadId, conversationId, processTick]);

  const refreshStatus = async () => {
    if (!leadId || !conversationId) return;
    setError('');

    try {
      const data = await invokeFunction('bob-queue-actions', { action: 'live-status', body: { tenantId: user?.tenantId, leadId, conversationId } });
      setRun((current) => ({
        ...(current || {}),
        status: data.status,
      }));
    } catch (err) {
      setError(err.message || 'Failed to refresh live automation status');
    }
  };

  const skipAction = async (actionId) => {
    if (!leadId || !conversationId || !actionId) return;
    setError('');
    setSkippingActionId(actionId);

    try {
      const data = await invokeFunction('bob-queue-actions', { action: 'skip', body: { tenantId: user?.tenantId, leadId, conversationId, actionId } });
      setRun((current) => ({
        ...(current || {}),
        status: data.status,
      }));
    } catch (err) {
      setError(err.message || 'Failed to skip action');
    } finally {
      setSkippingActionId('');
    }
  };

  return (
    <>
      <Head>
        <title>Live Automation Test</title>
      </Head>

      <main className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-950">Live Automation Test</h1>
              <p className="mt-1 text-sm text-gray-600">Create a real lead and run a controlled 15-minute email, SMS, and call sequence.</p>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-red-200 bg-white px-3 py-2 text-sm text-red-700">
              <ShieldCheck className="h-4 w-4" />
              Live providers
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <form onSubmit={startRun} className="card lg:col-span-2">
              <div className="card-header flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Play className="h-5 w-5 text-gray-800" />
                  <h2 className="text-base font-semibold text-gray-950">15-minute run</h2>
                </div>
                <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={resetForm}>
                  <RefreshCw className="h-4 w-4" />
                  Reset
                </button>
              </div>

              <div className="card-body space-y-5">
                <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
                  This can send real email, SMS, and calls. Use your own test email and phone number first.
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-gray-700">Email</span>
                    <input className="form-input" value={form.email} onChange={(event) => updateField('email', event.target.value)} type="email" required />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-gray-700">Phone</span>
                    <input className="form-input" value={form.phone} onChange={(event) => updateField('phone', event.target.value)} inputMode="tel" required={form.includeSms || form.includeCall} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-gray-700">First name</span>
                    <input className="form-input" value={form.firstName} onChange={(event) => updateField('firstName', event.target.value)} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-gray-700">Last name</span>
                    <input className="form-input" value={form.lastName} onChange={(event) => updateField('lastName', event.target.value)} />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Service interest</span>
                  <input className="form-input" value={form.serviceInterest} onChange={(event) => updateField('serviceInterest', event.target.value)} />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-gray-700">Location</span>
                    <input className="form-input" value={form.locationSummary} onChange={(event) => updateField('locationSummary', event.target.value)} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-gray-700">Meeting window</span>
                    <input className="form-input" value={form.preferredMeetingWindow} onChange={(event) => updateField('preferredMeetingWindow', event.target.value)} />
                  </label>
                </div>

                <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                  <p className="mb-3 text-sm font-medium text-gray-800">Channels</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      ['includeEmail', 'Email', Mail],
                      ['includeSms', 'SMS', MessageSquare],
                      ['includeCall', 'Voice call', Phone],
                    ].map(([field, label, Icon]) => (
                      <label key={field} className="flex items-center gap-2 text-sm text-gray-800">
                        <input
                          checked={form[field]}
                          className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                          onChange={(event) => updateField(field, event.target.checked)}
                          type="checkbox"
                        />
                        <Icon className="h-4 w-4 text-gray-600" />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 rounded-md border border-border bg-surface-secondary px-3 py-2 text-sm text-text-secondary">
                  {[
                    ['emailConsent', 'I have consent to send email during the live test.', emailConsentRequired],
                    ['smsConsent', 'I have consent to send SMS to this phone number during the live test.', smsConsentRequired],
                    ['callConsent', 'I have consent to place a voice call during the live test.', callConsentRequired],
                  ].map(([field, label, required]) => (
                    <label key={field} className="flex items-start gap-3">
                      <input
                        checked={form[field]}
                        className="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent"
                        onChange={(event) => updateField(field, event.target.checked)}
                        required={required}
                        type="checkbox"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Confirmation phrase</span>
                  <input
                    className="form-input"
                    value={form.confirmationText}
                    onChange={(event) => updateField('confirmationText', event.target.value)}
                    placeholder={CONFIRMATION}
                    required
                  />
                  <span className="mt-1 block text-xs text-gray-500">Type {CONFIRMATION} to unlock live sending.</span>
                </label>

                <label className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
                  <input
                    checked={autoTick}
                    className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                    onChange={(event) => setAutoTick(event.target.checked)}
                    type="checkbox"
                  />
                  Auto-process due actions once per minute while this page is open.
                </label>

                {error && (
                  <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-700">
                  Planned sequence: {channelSummary || 'none selected'}
                </div>
              </div>

              <div className="flex justify-end border-t border-gray-200 px-6 py-4">
                <button type="submit" className="btn-primary inline-flex items-center gap-2" disabled={loading}>
                  <Play className="h-4 w-4" />
                  {loading ? 'Starting...' : 'Start live run'}
                </button>
              </div>
            </form>

            <section className="lg:col-span-3 space-y-6">
              <div className="card">
                <div className="card-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-gray-950">Run status</h2>
                    <p className="text-sm text-gray-600">{runActive ? '15-minute window is active' : 'No active run window'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={refreshStatus} disabled={!leadId}>
                      <RefreshCw className="h-4 w-4" />
                      Refresh
                    </button>
                    <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={() => processTick()} disabled={!leadId || ticking}>
                      <Play className="h-4 w-4" />
                      {ticking ? 'Processing...' : 'Process due now'}
                    </button>
                  </div>
                </div>

                <div className="card-body space-y-4">
                  {status?.lead ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
                        <div className="text-gray-500">Lead</div>
                        <div className="font-medium text-gray-900">{status.lead.email}</div>
                        <div className="text-gray-600">{status.lead.phone || 'No phone'}</div>
                      </div>
                      <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
                        <div className="text-gray-500">Window</div>
                        <div className="font-medium text-gray-900">Ends {formatTime(liveTestEndsAt)}</div>
                        <div className="text-gray-600">Voice worker: {status.workerStatus?.voiceCallWorker?.enabled ? 'enabled' : 'disabled'}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-600">
                      Start a run to see live actions, messages, and worker status here.
                    </div>
                  )}

                  {run?.tick && (
                    <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                      <div className="mb-1 flex items-center gap-2 font-medium">
                        <CheckCircle2 className="h-4 w-4" />
                        Last tick processed
                      </div>
                      <div>Executor actions: {run.tick.executor?.length || 0}</div>
                      <div>Voice calls started: {run.tick.voice?.started || 0}</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h2 className="text-base font-semibold text-gray-950">Scheduled and completed actions</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">Action</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">Channel</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">Due</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500">Control</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {status?.actions?.length ? status.actions.map((action) => {
                        const canSkip = ['pending', 'deferred', 'awaiting_call'].includes(action.status);
                        return (
                          <tr key={action.id}>
                            <td className="px-4 py-3 text-gray-900">{action.actionType}</td>
                            <td className="px-4 py-3 text-gray-600">{action.channel || 'system'}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusTone(action.status)}`}>
                                {action.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-600">{formatTime(action.scheduledFor)}</td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                className="btn-secondary inline-flex items-center gap-2"
                                disabled={!canSkip || skippingActionId === action.id}
                                onClick={() => skipAction(action.id)}
                              >
                                <SkipForward className="h-4 w-4" />
                                {skippingActionId === action.id ? 'Skipping...' : 'Skip'}
                              </button>
                            </td>
                          </tr>
                        );
                      }) : (
                        <tr>
                          <td colSpan="5" className="px-4 py-8 text-center text-gray-500">No actions yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h2 className="text-base font-semibold text-gray-950">Conversation log</h2>
                </div>
                <div className="card-body">
                  {status?.messages?.length ? (
                    <div className="space-y-3">
                      {status.messages.map((message) => (
                        <div key={message.id} className="rounded-md border border-gray-200 bg-white p-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium text-gray-900">{message.channel} · {message.messageType}</span>
                            <span className="text-xs text-gray-500">{formatTime(message.createdAt || message.sentAt)}</span>
                          </div>
                          {message.subject && <p className="mt-2 font-medium text-gray-800">{message.subject}</p>}
                          <p className="mt-1 whitespace-pre-wrap text-gray-700">{message.bodyText || 'No body text'}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-md border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-600">
                      Messages will appear here as Bob queues email, SMS, and call events.
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}

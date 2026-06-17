import { useEffect, useState } from 'react';
import Head from 'next/head';
import { AlertCircle, CheckCircle2, Database, Play, RefreshCw, ShieldCheck } from 'lucide-react';
import apiClient from '../lib/api';

const initialForm = {
  email: `test-lead-${Date.now()}@example.com`,
  firstName: 'Test',
  lastName: 'Lead',
  phone: '+14384838093',
  source: 'manual_test',
  priority: 'medium',
  assignedAgentId: '',
  qualificationStatus: 'unqualified',
  qualificationScore: '',
  leadStage: 'new_inquiry',
  schedulingState: 'not_started',
  preferredContactChannel: 'email',
  preferredMeetingWindow: 'Weekday afternoon',
  serviceInterest: 'Trade service consultation',
  timeline: 'Next 30 days',
  budgetRange: '$5k-$10k',
  locationSummary: 'Toronto, ON',
  qualificationNotes: 'Created from the lead automation test form.',
  runAutomation: true,
};

const selectOptions = {
  priority: ['low', 'medium', 'high', 'urgent'],
  qualificationStatus: ['unqualified', 'partially_qualified', 'qualified'],
  leadStage: ['new_inquiry', 'awaiting_information', 'nurturing', 'ready_to_book', 'booked', 'escalated'],
  schedulingState: ['not_started', 'needs_follow_up', 'scheduled', 'not_interested'],
  preferredContactChannel: ['email', 'sms', 'phone'],
};

function buildFreshEmail() {
  return `test-lead-${Date.now()}@example.com`;
}

export default function TestLead() {
  const [form, setForm] = useState(initialForm);
  const [agents, setAgents] = useState([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    apiClient
      .get('/test/agents', { silent: true })
      .then((data) => {
        if (active) setAgents(data.agents || []);
      })
      .catch(() => {
        if (active) setAgents([]);
      })
      .finally(() => {
        if (active) setLoadingAgents(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError('');
    setResult(null);
  };

  const resetForNextLead = () => {
    setForm((current) => ({ ...current, email: buildFreshEmail() }));
    setResult(null);
    setError('');
  };

  const submitLead = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const payload = {
        ...form,
        assignedAgentId: form.assignedAgentId || null,
        qualificationScore: form.qualificationScore === '' ? undefined : Number(form.qualificationScore),
      };

      const data = await apiClient.post('/test/lead', payload);
      setResult(data);
    } catch (err) {
      setError(err.message || 'Failed to create lead');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Lead Automation Test</title>
      </Head>

      <main className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-950">Lead Automation Test</h1>
              <p className="mt-1 text-sm text-gray-600">Create a lead row and queue the first Bob action.</p>
            </div>
            <div className="hidden items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 sm:flex">
              <ShieldCheck className="h-4 w-4" />
              Test mode
            </div>
          </div>

          <form onSubmit={submitLead} className="card">
            <div className="card-header flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-gray-800" />
                <h2 className="text-base font-semibold text-gray-950">Lead details</h2>
              </div>
              <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={resetForNextLead}>
                <RefreshCw className="h-4 w-4" />
                New email
              </button>
            </div>

            <div className="card-body space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Email</span>
                  <input className="form-input" value={form.email} onChange={(event) => updateField('email', event.target.value)} type="email" required />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Phone</span>
                  <input className="form-input" value={form.phone} onChange={(event) => updateField('phone', event.target.value)} inputMode="tel" />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">First name</span>
                  <input className="form-input" value={form.firstName} onChange={(event) => updateField('firstName', event.target.value)} />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Last name</span>
                  <input className="form-input" value={form.lastName} onChange={(event) => updateField('lastName', event.target.value)} />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Source</span>
                  <input className="form-input" value={form.source} onChange={(event) => updateField('source', event.target.value)} />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Priority</span>
                  <select className="form-select" value={form.priority} onChange={(event) => updateField('priority', event.target.value)}>
                    {selectOptions.priority.map((option) => (
                      <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Assigned agent</span>
                  <select className="form-select" value={form.assignedAgentId} onChange={(event) => updateField('assignedAgentId', event.target.value)}>
                    <option value="">{loadingAgents ? 'Loading agents...' : 'Unassigned'}</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>{agent.fullName || agent.email}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Qualification</span>
                  <select className="form-select" value={form.qualificationStatus} onChange={(event) => updateField('qualificationStatus', event.target.value)}>
                    {selectOptions.qualificationStatus.map((option) => (
                      <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Score</span>
                  <input className="form-input" value={form.qualificationScore} onChange={(event) => updateField('qualificationScore', event.target.value)} type="number" min="0" max="100" />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Stage</span>
                  <select className="form-select" value={form.leadStage} onChange={(event) => updateField('leadStage', event.target.value)}>
                    {selectOptions.leadStage.map((option) => (
                      <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Scheduling</span>
                  <select className="form-select" value={form.schedulingState} onChange={(event) => updateField('schedulingState', event.target.value)}>
                    {selectOptions.schedulingState.map((option) => (
                      <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Channel</span>
                  <select className="form-select" value={form.preferredContactChannel} onChange={(event) => updateField('preferredContactChannel', event.target.value)}>
                    {selectOptions.preferredContactChannel.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Service interest</span>
                  <input className="form-input" value={form.serviceInterest} onChange={(event) => updateField('serviceInterest', event.target.value)} />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Timeline</span>
                  <input className="form-input" value={form.timeline} onChange={(event) => updateField('timeline', event.target.value)} />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Budget range</span>
                  <input className="form-input" value={form.budgetRange} onChange={(event) => updateField('budgetRange', event.target.value)} />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Preferred meeting window</span>
                  <input className="form-input" value={form.preferredMeetingWindow} onChange={(event) => updateField('preferredMeetingWindow', event.target.value)} />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Location</span>
                  <input className="form-input" value={form.locationSummary} onChange={(event) => updateField('locationSummary', event.target.value)} />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Notes</span>
                  <input className="form-input" value={form.qualificationNotes} onChange={(event) => updateField('qualificationNotes', event.target.value)} />
                </label>
              </div>

              <label className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
                <input
                  checked={form.runAutomation}
                  className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                  onChange={(event) => updateField('runAutomation', event.target.checked)}
                  type="checkbox"
                />
                Queue first Bob action after insert
              </label>

              {error && (
                <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
                  <span>{error}</span>
                </div>
              )}

              {result && (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                  <div className="mb-2 flex items-center gap-2 font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    Lead created
                  </div>
                  <dl className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <dt className="text-green-700">Lead ID</dt>
                      <dd className="break-all font-mono text-xs">{result.lead?.id}</dd>
                    </div>
                    <div>
                      <dt className="text-green-700">Email</dt>
                      <dd>{result.lead?.email}</dd>
                    </div>
                    <div>
                      <dt className="text-green-700">Bob action</dt>
                      <dd>{result.automation?.actionType || 'not queued'}</dd>
                    </div>
                    <div>
                      <dt className="text-green-700">Action ID</dt>
                      <dd className="break-all font-mono text-xs">{result.automation?.actionId || '-'}</dd>
                    </div>
                  </dl>
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-gray-200 px-6 py-4">
              <button type="submit" className="btn-primary inline-flex items-center gap-2" disabled={loading}>
                <Play className="h-4 w-4" />
                {loading ? 'Creating lead...' : 'Create test lead'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </>
  );
}

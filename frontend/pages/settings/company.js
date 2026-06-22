import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  Archive,
  Bot,
  Building2,
  Calendar,
  Check,
  Mail,
  Phone,
  Plus,
  Save,
  Settings,
  RefreshCw,
  TestTube2,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import {
  archiveTenantAgent,
  createTenantPhoneNumber,
  createTenantAgent,
  getTenantSettingsSummary,
  releaseTenantPhoneNumber,
  setPrimaryTenantPhoneNumber,
  upsertTenantBookingIntegration,
  upsertTenantEmailIdentity,
} from '../../lib/insforge-product';
import {
  provisionElevenLabsAgent,
  testElevenLabsAgent,
  listElevenLabsVoices,
  getCalendlyConnectUrl,
  listCalendlyEventTypes,
} from '../../lib/insforge-functions';

const emptyAgentForm = {
  displayName: '',
  voiceId: '',
  voiceProfile: 'any',
  personality: 'professional',
  customPersonalityNotes: '',
  status: 'testing',
};

const voiceProfiles = [
  { key: 'any', label: 'Any available voice', match: () => true },
  { key: 'male', label: 'Male voice', match: (voice) => voice.gender?.toLowerCase() === 'male' },
  { key: 'female', label: 'Female voice', match: (voice) => voice.gender?.toLowerCase() === 'female' },
  { key: 'neutral', label: 'Neutral voice', match: (voice) => voice.gender?.toLowerCase() === 'neutral' },
  { key: 'british_male', label: 'Englishman / British male', match: (voice) => voice.gender?.toLowerCase() === 'male' && /british|english|uk/i.test(voice.accent || '') },
  { key: 'british_female', label: 'British woman', match: (voice) => voice.gender?.toLowerCase() === 'female' && /british|english|uk/i.test(voice.accent || '') },
  { key: 'spanish_female', label: 'Spanish woman', match: (voice) => voice.gender?.toLowerCase() === 'female' && /spanish|spain|latin/i.test(`${voice.accent || ''} ${voice.name || ''} ${voice.description || ''}`) },
  { key: 'american_male', label: 'American man', match: (voice) => voice.gender?.toLowerCase() === 'male' && /american|us/i.test(voice.accent || '') },
  { key: 'american_female', label: 'American woman', match: (voice) => voice.gender?.toLowerCase() === 'female' && /american|us/i.test(voice.accent || '') },
];

const personalityPresets = [
  { key: 'professional', label: 'Professional', prompt: 'Sound polished, calm, concise, and trustworthy. Keep the conversation focused and practical.' },
  { key: 'friendly', label: 'Friendly', prompt: 'Sound warm, approachable, patient, and clear. Make the lead feel comfortable without being too casual.' },
  { key: 'funny', label: 'Lightly funny', prompt: 'Use light tasteful humor where appropriate, but never joke about sensitive services, pricing, or consent.' },
  { key: 'direct', label: 'Direct', prompt: 'Be brief, confident, and action-oriented. Avoid fluff and get to qualification or booking quickly.' },
  { key: 'luxury', label: 'Luxury concierge', prompt: 'Sound refined, attentive, composed, and premium. Make the lead feel personally looked after.' },
  { key: 'sales_closer', label: 'Sales closer', prompt: 'Sound confident and persuasive while staying honest. Ask clear next-step questions and guide toward booking.' },
  { key: 'receptionist', label: 'Receptionist', prompt: 'Sound like a helpful front desk receptionist: organized, friendly, clear, and service-focused.' },
];

const emptyEmailForm = {
  fromName: '',
  fromEmail: '',
  replyToEmail: '',
  provider: 'platform',
};

const emptyPhoneForm = {
  phoneNumber: '',
  providerPhoneNumberId: '',
  voiceEnabled: true,
  smsEnabled: true,
  whatsappStatus: 'not_configured',
  status: 'active',
  isPrimary: true,
};

const emptyBookingForm = {
  provider: 'manual',
  bookingUrl: '',
  meetingLink: '',
  eventTypeId: '',
  defaultMeetingType: 'phone',
};

const statusTone = {
  live: 'bg-success-soft text-success',
  active: 'bg-success-soft text-success',
  connected: 'bg-success-soft text-success',
  testing: 'bg-info-soft text-info',
  draft: 'bg-surface-secondary text-text-secondary',
  paused: 'bg-warning-soft text-warning',
  pending: 'bg-info-soft text-info',
  not_configured: 'bg-surface-secondary text-text-secondary',
  unverified: 'bg-warning-soft text-warning',
  disconnected: 'bg-surface-secondary text-text-secondary',
  needs_attention: 'bg-warning-soft text-warning',
  archived: 'bg-error-soft text-error',
  released: 'bg-surface-secondary text-text-secondary',
  suspended: 'bg-error-soft text-error',
  failed: 'bg-error-soft text-error',
};

function pretty(value) {
  if (!value) return 'Not set';
  return String(value).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function StatusBadge({ value }) {
  const normalized = value || 'draft';
  return <span className={`ops-badge ${statusTone[normalized] || statusTone.draft}`}>{pretty(normalized)}</span>;
}

function Panel({ icon: Icon, title, badge, children, footer }) {
  return (
    <section className="ops-panel">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
          <h2 className="truncate text-sm font-semibold text-text-primary">{title}</h2>
        </div>
        {badge}
      </div>
      <div className="space-y-4 p-4">{children}</div>
      {footer ? <div className="border-t border-border px-4 py-3">{footer}</div> : null}
    </section>
  );
}

export default function CompanySettingsPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [agentProviderBusy, setAgentProviderBusy] = useState(null);
  const [voiceOptions, setVoiceOptions] = useState([]);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [agentSetupResult, setAgentSetupResult] = useState(null);
  const [summary, setSummary] = useState({
    tenant: null,
    agents: [],
    phoneNumbers: [],
    primaryPhoneNumber: null,
    emailIdentity: null,
    bookingIntegration: null,
  });
  const [agentForm, setAgentForm] = useState(emptyAgentForm);
  const [phoneForm, setPhoneForm] = useState(emptyPhoneForm);
  const [emailForm, setEmailForm] = useState(emptyEmailForm);
  const [bookingForm, setBookingForm] = useState(emptyBookingForm);
  const [calendlyEventTypes, setCalendlyEventTypes] = useState([]);

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
    fetchSettings();
  }, [authLoading, isAuthenticated, user, router]);

  async function fetchSettings() {
    try {
      setLoading(true);
      setError(null);
      const data = await getTenantSettingsSummary(user);
      setSummary({
        tenant: data.tenant || null,
        agents: data.agents || [],
        phoneNumbers: data.phoneNumbers || [],
        primaryPhoneNumber: data.primaryPhoneNumber || null,
        emailIdentity: data.emailIdentity || null,
        bookingIntegration: data.bookingIntegration || null,
      });
      if (data.emailIdentity) {
        setEmailForm({
          fromName: data.emailIdentity.fromName || '',
          fromEmail: data.emailIdentity.fromEmail || '',
          replyToEmail: data.emailIdentity.replyToEmail || '',
          provider: data.emailIdentity.provider || 'platform',
        });
      }
      if (data.bookingIntegration) {
        setBookingForm({
          provider: data.bookingIntegration.provider || 'manual',
          bookingUrl: data.bookingIntegration.bookingUrl || '',
          meetingLink: data.bookingIntegration.metadata?.meetingLink || '',
          eventTypeId: data.bookingIntegration.eventTypeId || '',
          defaultMeetingType: data.bookingIntegration.defaultMeetingType || 'phone',
        });
      }
      fetchVoiceOptions();
    } catch (err) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  async function fetchVoiceOptions() {
    try {
      setVoiceLoading(true);
      const result = await listElevenLabsVoices(user);
      setVoiceOptions(result.voices || []);
    } catch (err) {
      console.warn('Failed to load ElevenLabs voices:', err);
      setVoiceOptions([]);
    } finally {
      setVoiceLoading(false);
    }
  }

  async function handleCreateAgent(event) {
    event.preventDefault();
    try {
      setSaving('agent');
      setError(null);
      setNotice(null);
      const selectedVoice = voiceOptions.find((voice) => voice.voiceId === agentForm.voiceId);
      const selectedVoiceProfile = voiceProfiles.find((profile) => profile.key === agentForm.voiceProfile) || voiceProfiles[0];
      const selectedPersonality = personalityPresets.find((preset) => preset.key === agentForm.personality) || personalityPresets[0];
      await createTenantAgent(user, {
        ...agentForm,
        voiceProfile: {
          key: selectedVoiceProfile.key,
          label: selectedVoiceProfile.label,
          selectedVoiceName: selectedVoice?.name || null,
          selectedVoiceLabels: selectedVoice?.labels || null,
        },
        personality: {
          key: selectedPersonality.key,
          label: selectedPersonality.label,
          prompt: selectedPersonality.prompt,
        },
      });
      setAgentForm(emptyAgentForm);
      setNotice('AI agent saved');
      await fetchSettings();
    } catch (err) {
      setError(err.message || 'Failed to save AI agent');
    } finally {
      setSaving(null);
    }
  }

  async function handleArchiveAgent(agentId) {
    try {
      setSaving(agentId);
      setError(null);
      setNotice(null);
      await archiveTenantAgent(user, agentId);
      setNotice('AI agent archived');
      await fetchSettings();
    } catch (err) {
      setError(err.message || 'Failed to archive AI agent');
    } finally {
      setSaving(null);
    }
  }

  async function handleProvisionAgent(agentId) {
    try {
      setAgentProviderBusy(agentId);
      setError(null);
      setNotice(null);
      setAgentSetupResult(null);
      const result = await provisionElevenLabsAgent(user, agentId);
      setNotice(result.failedKnowledge?.length
        ? `AI agent synced with ${result.failedKnowledge.length} knowledge source warning(s)`
        : 'AI agent synced to ElevenLabs');
      await fetchSettings();
    } catch (err) {
      setError(err.message || 'Failed to sync AI agent to ElevenLabs');
    } finally {
      setAgentProviderBusy(null);
    }
  }

  async function handleTestAgentSetup(agentId) {
    try {
      setAgentProviderBusy(agentId);
      setError(null);
      setNotice(null);
      const result = await testElevenLabsAgent(user, agentId);
      setAgentSetupResult(result.setup || null);
      setNotice('AI agent setup checked');
    } catch (err) {
      setError(err.message || 'Failed to test AI agent setup');
    } finally {
      setAgentProviderBusy(null);
    }
  }

  async function handleCreatePhoneNumber(event) {
    event.preventDefault();
    try {
      setSaving('phone');
      setError(null);
      setNotice(null);
      await createTenantPhoneNumber(user, phoneForm);
      setPhoneForm(emptyPhoneForm);
      setNotice('Phone number assigned');
      await fetchSettings();
    } catch (err) {
      setError(err.message || 'Failed to assign phone number');
    } finally {
      setSaving(null);
    }
  }

  async function handleSetPrimaryPhoneNumber(phoneNumberId) {
    try {
      setSaving(phoneNumberId);
      setError(null);
      setNotice(null);
      await setPrimaryTenantPhoneNumber(user, phoneNumberId);
      setNotice('Primary phone number updated');
      await fetchSettings();
    } catch (err) {
      setError(err.message || 'Failed to update primary phone number');
    } finally {
      setSaving(null);
    }
  }

  async function handleReleasePhoneNumber(phoneNumberId) {
    try {
      setSaving(phoneNumberId);
      setError(null);
      setNotice(null);
      await releaseTenantPhoneNumber(user, phoneNumberId);
      setNotice('Phone number released');
      await fetchSettings();
    } catch (err) {
      setError(err.message || 'Failed to release phone number');
    } finally {
      setSaving(null);
    }
  }

  async function handleSaveEmail(event) {
    event.preventDefault();
    try {
      setSaving('email');
      setError(null);
      setNotice(null);
      await upsertTenantEmailIdentity(user, emailForm);
      setNotice('Sender identity saved');
      await fetchSettings();
    } catch (err) {
      setError(err.message || 'Failed to save sender identity');
    } finally {
      setSaving(null);
    }
  }

  async function handleSaveBooking(event) {
    event.preventDefault();
    try {
      setSaving('booking');
      setError(null);
      setNotice(null);
      await upsertTenantBookingIntegration(user, bookingForm);
      setNotice('Booking settings saved');
      await fetchSettings();
    } catch (err) {
      setError(err.message || 'Failed to save booking settings');
    } finally {
      setSaving(null);
    }
  }

  async function handleCalendlyConnect() {
    try {
      setSaving('calendly-connect');
      setError(null);
      const result = await getCalendlyConnectUrl();
      window.location.assign(result.authorizeUrl);
    } catch (err) {
      setError(err.message || 'Unable to start Calendly connection');
    } finally {
      setSaving(null);
    }
  }

  async function handleLoadCalendlyEventTypes() {
    try {
      setSaving('calendly-events');
      setError(null);
      const result = await listCalendlyEventTypes();
      setCalendlyEventTypes(result.eventTypes || []);
      setNotice('Calendly event types loaded');
    } catch (err) {
      setError(err.message || 'Unable to load Calendly event types');
    } finally {
      setSaving(null);
    }
  }

  const activeAgents = useMemo(
    () => summary.agents.filter((agent) => agent.status !== 'archived'),
    [summary.agents]
  );
  const activePhoneNumbers = useMemo(
    () => summary.phoneNumbers.filter((phoneNumber) => phoneNumber.status !== 'released'),
    [summary.phoneNumbers]
  );
  const filteredVoiceOptions = useMemo(() => {
    const profile = voiceProfiles.find((item) => item.key === agentForm.voiceProfile) || voiceProfiles[0];
    const matches = voiceOptions.filter(profile.match);
    return matches.length ? matches : voiceOptions;
  }, [agentForm.voiceProfile, voiceOptions]);

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-background p-6 text-text-primary">
        <div className="mx-auto max-w-7xl">
          <div className="ops-panel p-4 text-sm text-text-secondary">Loading settings...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Company Settings - Bob Automation</title>
      </Head>

      <main className="min-h-screen bg-background px-4 py-6 text-text-primary sm:px-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium text-text-muted">Settings</p>
              <h1 className="text-2xl font-semibold text-text-primary">{summary.tenant?.name || 'Company'} Identity</h1>
            </div>
            <button type="button" className="ops-button-secondary" onClick={() => router.push('/admin-dashboard')}>
              <Settings className="h-4 w-4" aria-hidden="true" />
              Dashboard
            </button>
          </header>

          {error ? (
            <div className="ops-panel border-error bg-error-soft px-4 py-3 text-sm font-medium text-error">{error}</div>
          ) : null}
          {notice ? (
            <div className="ops-panel border-success bg-success-soft px-4 py-3 text-sm font-medium text-success">
              <Check className="mr-2 inline h-4 w-4" aria-hidden="true" />
              {notice}
            </div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]">
            <div className="space-y-6">
              <Panel
                icon={Building2}
                title="Company"
                badge={<StatusBadge value={summary.tenant?.status || 'active'} />}
              >
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-medium text-text-muted">Company</p>
                    <p className="mt-1 text-sm font-semibold text-text-primary">{summary.tenant?.name || 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-text-muted">Slug</p>
                    <p className="mt-1 text-sm text-text-primary">{summary.tenant?.slug || 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-text-muted">Timezone</p>
                    <p className="mt-1 text-sm text-text-primary">{summary.tenant?.defaultTimezone || 'Not set'}</p>
                  </div>
                </div>
              </Panel>

              <Panel
                icon={Phone}
                title="Phone Numbers"
                badge={<StatusBadge value={summary.primaryPhoneNumber?.status || 'pending'} />}
              >
                {activePhoneNumbers.length ? (
                  <div className="overflow-hidden rounded-lg border border-border">
                    <table className="min-w-full divide-y divide-border">
                      <thead className="bg-surface-secondary">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-text-muted">Number</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-text-muted">Provider</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-text-muted">Capabilities</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-text-muted">WhatsApp</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-text-muted">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border bg-surface">
                        {activePhoneNumbers.map((phoneNumber) => (
                          <tr key={phoneNumber.id}>
                            <td className="px-3 py-3">
                              <div className="text-sm font-medium text-text-primary">{phoneNumber.phoneNumber}</div>
                              {phoneNumber.isPrimary ? (
                                <div className="mt-1 text-xs text-text-muted">Primary sender</div>
                              ) : null}
                            </td>
                            <td className="px-3 py-3 text-sm text-text-secondary">{pretty(phoneNumber.provider)}</td>
                            <td className="px-3 py-3">
                              <div className="flex flex-wrap gap-1">
                                {phoneNumber.voiceEnabled ? <span className="ops-badge bg-info-soft text-info">Voice</span> : null}
                                {phoneNumber.smsEnabled ? <span className="ops-badge bg-accent-soft text-accent">SMS</span> : null}
                                {!phoneNumber.voiceEnabled && !phoneNumber.smsEnabled ? (
                                  <span className="ops-badge bg-surface-secondary text-text-secondary">None</span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-3"><StatusBadge value={phoneNumber.whatsappStatus} /></td>
                            <td className="px-3 py-3 text-right">
                              <div className="flex justify-end gap-2">
                                {!phoneNumber.isPrimary || phoneNumber.status !== 'active' ? (
                                  <button
                                    type="button"
                                    className="ops-button-secondary h-8 px-2"
                                    onClick={() => handleSetPrimaryPhoneNumber(phoneNumber.id)}
                                    disabled={saving === phoneNumber.id}
                                  >
                                    Make primary
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className="ops-button-secondary h-8 px-2"
                                  onClick={() => handleReleasePhoneNumber(phoneNumber.id)}
                                  disabled={saving === phoneNumber.id}
                                >
                                  Release
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-lg border border-border bg-surface-secondary px-3 py-4 text-sm text-text-secondary">
                    No phone number assigned yet. Add the tenant's Twilio number to enable tenant routing.
                  </div>
                )}
              </Panel>

              <Panel icon={Bot} title="AI Agents" badge={<span className="ops-badge bg-info-soft text-info">{activeAgents.length}</span>}>
                {agentSetupResult ? (
                  <div className="rounded-lg border border-border bg-surface-secondary px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-text-primary">
                          {agentSetupResult.agent?.displayName || 'AI agent'} setup
                        </p>
                        <p className="mt-1 text-xs text-text-muted">
                          {agentSetupResult.agent?.hasProviderAgent ? 'ElevenLabs agent is linked' : 'ElevenLabs agent has not been provisioned yet'}
                        </p>
                      </div>
                      <StatusBadge value={agentSetupResult.configured ? 'connected' : 'needs_attention'} />
                    </div>
                    <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                      <div className="rounded-lg border border-border bg-surface px-2 py-2">
                        <p className="font-medium text-text-muted">Phone</p>
                        <p className="mt-1 text-text-primary">{agentSetupResult.readiness?.hasPhoneNumber ? 'Configured' : 'Needs setup'}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-surface px-2 py-2">
                        <p className="font-medium text-text-muted">Booking</p>
                        <p className="mt-1 text-text-primary">{agentSetupResult.readiness?.hasBookingPath ? 'Configured' : 'Needs setup'}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-surface px-2 py-2">
                        <p className="font-medium text-text-muted">Knowledge</p>
                        <p className="mt-1 text-text-primary">
                          {agentSetupResult.readiness?.readyKnowledgeDocuments || 0} ready / {agentSetupResult.readiness?.uploadedKnowledgeDocuments || 0} uploaded
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-surface-secondary">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-text-muted">Name</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-text-muted">Voice</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-text-muted">Status</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-text-muted">ElevenLabs</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-text-muted">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-surface">
                      {summary.agents.map((agent) => (
                        <tr key={agent.id}>
                          <td className="px-3 py-3">
                            <div className="text-sm font-medium text-text-primary">{agent.displayName}</div>
                            {agent.templateKey === 'bob-default' ? (
                              <div className="mt-1 text-xs text-text-muted">Legacy default template</div>
                            ) : null}
                          </td>
                          <td className="px-3 py-3">
                            <div className="text-sm text-text-secondary">{agent.metadata?.voiceProfile?.selectedVoiceName || agent.metadata?.voiceProfile?.label || agent.voiceId || 'Provider default'}</div>
                            <div className="mt-1 text-xs text-text-muted">{agent.metadata?.personality?.label || 'Professional'}</div>
                          </td>
                          <td className="px-3 py-3"><StatusBadge value={agent.status} /></td>
                          <td className="px-3 py-3">
                            {agent.elevenlabsAgentId ? (
                              <div>
                                <span className="ops-badge bg-success-soft text-success">Synced</span>
                                <p className="mt-1 max-w-40 truncate text-xs text-text-muted">{agent.elevenlabsAgentId}</p>
                              </div>
                            ) : (
                              <span className="ops-badge bg-warning-soft text-warning">Needs sync</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {agent.status !== 'archived' ? (
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  className="ops-button-secondary h-8 px-2"
                                  onClick={() => handleTestAgentSetup(agent.id)}
                                  disabled={agentProviderBusy === agent.id}
                                  title="Test AI agent setup"
                                >
                                  <TestTube2 className="h-4 w-4" aria-hidden="true" />
                                  Test
                                </button>
                                <button
                                  type="button"
                                  className="ops-button-secondary h-8 px-2"
                                  onClick={() => handleProvisionAgent(agent.id)}
                                  disabled={agentProviderBusy === agent.id}
                                  title="Sync AI agent to ElevenLabs"
                                >
                                  <RefreshCw className={`h-4 w-4 ${agentProviderBusy === agent.id ? 'animate-spin' : ''}`} aria-hidden="true" />
                                  Sync
                                </button>
                              <button
                                type="button"
                                className="ops-button-secondary h-8 px-2"
                                onClick={() => handleArchiveAgent(agent.id)}
                                disabled={saving === agent.id || agentProviderBusy === agent.id}
                                title="Archive AI agent"
                              >
                                <Archive className="h-4 w-4" aria-hidden="true" />
                              </button>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>

            <div className="space-y-6">
              <Panel icon={Phone} title="Assign Phone Number">
                <form className="space-y-3" onSubmit={handleCreatePhoneNumber}>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex h-9 items-center rounded-lg border border-border bg-surface-secondary px-3 text-sm font-medium text-text-secondary">
                      Twilio
                    </div>
                    <select
                      className="ops-select"
                      value={phoneForm.status}
                      onChange={(event) => setPhoneForm({ ...phoneForm, status: event.target.value })}
                    >
                      <option value="active">Active</option>
                      <option value="pending">Pending</option>
                      <option value="suspended">Suspended</option>
                    </select>
                  </div>
                  <input
                    className="ops-input"
                    placeholder="+15551234567"
                    value={phoneForm.phoneNumber}
                    onChange={(event) => setPhoneForm({ ...phoneForm, phoneNumber: event.target.value })}
                  />
                  <input
                    className="ops-input"
                    placeholder="Twilio phone number SID"
                    value={phoneForm.providerPhoneNumberId}
                    onChange={(event) => setPhoneForm({ ...phoneForm, providerPhoneNumberId: event.target.value })}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-text-secondary">
                      <input
                        type="checkbox"
                        checked={phoneForm.voiceEnabled}
                        onChange={(event) => setPhoneForm({ ...phoneForm, voiceEnabled: event.target.checked })}
                      />
                      Voice
                    </label>
                    <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-text-secondary">
                      <input
                        type="checkbox"
                        checked={phoneForm.smsEnabled}
                        onChange={(event) => setPhoneForm({ ...phoneForm, smsEnabled: event.target.checked })}
                      />
                      SMS
                    </label>
                  </div>
                  <select
                    className="ops-select"
                    value={phoneForm.whatsappStatus}
                    onChange={(event) => setPhoneForm({ ...phoneForm, whatsappStatus: event.target.value })}
                  >
                    <option value="not_configured">WhatsApp not configured</option>
                    <option value="pending">WhatsApp pending</option>
                    <option value="active">WhatsApp active</option>
                    <option value="suspended">WhatsApp suspended</option>
                  </select>
                  <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-text-secondary">
                    <input
                      type="checkbox"
                      checked={phoneForm.isPrimary}
                      onChange={(event) => setPhoneForm({ ...phoneForm, isPrimary: event.target.checked })}
                    />
                    Use as primary sender
                  </label>
                  <button type="submit" className="ops-button-primary w-full" disabled={saving === 'phone'}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Assign Number
                  </button>
                </form>
              </Panel>

              <Panel icon={Plus} title="New AI Agent">
                <form className="space-y-3" onSubmit={handleCreateAgent}>
                  <input
                    className="ops-input"
                    placeholder="Agent name"
                    value={agentForm.displayName}
                    onChange={(event) => setAgentForm({ ...agentForm, displayName: event.target.value })}
                  />
                  <select
                    className="ops-select"
                    value={agentForm.voiceProfile}
                    onChange={(event) => setAgentForm({ ...agentForm, voiceProfile: event.target.value, voiceId: '' })}
                  >
                    {voiceProfiles.map((profile) => (
                      <option key={profile.key} value={profile.key}>{profile.label}</option>
                    ))}
                  </select>
                  <select
                    className="ops-select"
                    value={agentForm.voiceId}
                    onChange={(event) => setAgentForm({ ...agentForm, voiceId: event.target.value })}
                  >
                    <option value="">{voiceLoading ? 'Loading ElevenLabs voices…' : 'Use provider default voice'}</option>
                    {filteredVoiceOptions.map((voice) => (
                      <option key={voice.voiceId} value={voice.voiceId}>
                        {voice.name}
                        {voice.gender || voice.accent ? ` — ${[voice.gender, voice.accent].filter(Boolean).join(', ')}` : ''}
                      </option>
                    ))}
                  </select>
                  <select
                    className="ops-select"
                    value={agentForm.personality}
                    onChange={(event) => setAgentForm({ ...agentForm, personality: event.target.value })}
                  >
                    {personalityPresets.map((preset) => (
                      <option key={preset.key} value={preset.key}>{preset.label}</option>
                    ))}
                  </select>
                  <textarea
                    className="ops-input min-h-20 py-2"
                    placeholder="Optional personality notes, e.g. calm, witty, luxury, no slang"
                    value={agentForm.customPersonalityNotes}
                    onChange={(event) => setAgentForm({ ...agentForm, customPersonalityNotes: event.target.value })}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-border bg-surface-secondary px-3 py-2 text-xs text-text-muted">
                      Template version is managed automatically.
                    </div>
                    <select
                      className="ops-select"
                      value={agentForm.status}
                      onChange={(event) => setAgentForm({ ...agentForm, status: event.target.value })}
                    >
                      <option value="testing">Testing</option>
                      <option value="live">Live</option>
                    </select>
                  </div>
                  <button type="submit" className="ops-button-primary w-full" disabled={saving === 'agent'}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add Agent
                  </button>
                </form>
              </Panel>

              <Panel
                icon={Mail}
                title="Sender Identity"
                badge={<StatusBadge value={summary.emailIdentity?.verifiedStatus || 'unverified'} />}
              >
                <div className="rounded-lg border border-border bg-surface-secondary px-3 py-2 text-xs text-text-secondary">
                  {summary.emailIdentity?.verifiedStatus === 'verified'
                    ? 'Automated emails use this verified tenant sender.'
                    : 'Automated emails use the platform sender until this identity is verified.'}
                </div>
                <form className="space-y-3" onSubmit={handleSaveEmail}>
                  <input
                    className="ops-input"
                    placeholder="From name"
                    value={emailForm.fromName}
                    onChange={(event) => setEmailForm({ ...emailForm, fromName: event.target.value })}
                  />
                  <input
                    className="ops-input"
                    placeholder="From email"
                    value={emailForm.fromEmail}
                    onChange={(event) => setEmailForm({ ...emailForm, fromEmail: event.target.value })}
                  />
                  <input
                    className="ops-input"
                    placeholder="Reply-to email"
                    value={emailForm.replyToEmail}
                    onChange={(event) => setEmailForm({ ...emailForm, replyToEmail: event.target.value })}
                  />
                  <button type="submit" className="ops-button-primary w-full" disabled={saving === 'email'}>
                    <Save className="h-4 w-4" aria-hidden="true" />
                    {saving === 'email' ? 'Saving…' : 'Save Sender'}
                  </button>
                </form>
              </Panel>

              <Panel
                icon={Calendar}
                title="Booking"
                badge={<StatusBadge value={summary.bookingIntegration?.status || 'disconnected'} />}
              >
                <form className="space-y-3" onSubmit={handleSaveBooking}>
                  <select
                    className="ops-select"
                    value={bookingForm.provider}
                    onChange={(event) => setBookingForm({ ...bookingForm, provider: event.target.value })}
                  >
                    <option value="manual">Manual</option>
                    <option value="calendly">Calendly</option>
                    <option value="google_calendar">Google Calendar</option>
                    <option value="zoom">Zoom</option>
                  </select>
                  <input
                    className="ops-input"
                    placeholder="Booking URL"
                    value={bookingForm.bookingUrl}
                    onChange={(event) => setBookingForm({ ...bookingForm, bookingUrl: event.target.value })}
                  />
                  <input
                    className="ops-input"
                    placeholder="Meeting link after booking (Zoom, Google Meet, or Teams)"
                    value={bookingForm.meetingLink}
                    onChange={(event) => setBookingForm({ ...bookingForm, meetingLink: event.target.value })}
                  />
                  <input
                    className="ops-input"
                    placeholder="Event type ID"
                    value={bookingForm.eventTypeId}
                    onChange={(event) => setBookingForm({ ...bookingForm, eventTypeId: event.target.value })}
                  />
                  {bookingForm.provider === 'calendly' ? (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="ops-button-secondary" onClick={handleCalendlyConnect} disabled={saving === 'calendly-connect'}>
                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                        {saving === 'calendly-connect' ? 'Connecting…' : 'Connect Calendly'}
                      </button>
                      <button type="button" className="ops-button-secondary" onClick={handleLoadCalendlyEventTypes} disabled={saving === 'calendly-events'}>
                        {saving === 'calendly-events' ? 'Loading…' : 'Load event types'}
                      </button>
                    </div>
                  ) : null}
                  {calendlyEventTypes.length ? (
                    <select className="ops-select" value={bookingForm.eventTypeId} onChange={(event) => setBookingForm({ ...bookingForm, eventTypeId: event.target.value })}>
                      <option value="">Select a connected Calendly event type</option>
                      {calendlyEventTypes.map((eventType) => <option key={eventType.id} value={eventType.id}>{eventType.name}{eventType.duration ? ` (${eventType.duration} min)` : ''}</option>)}
                    </select>
                  ) : null}
                  <select
                    className="ops-select"
                    value={bookingForm.defaultMeetingType}
                    onChange={(event) => setBookingForm({ ...bookingForm, defaultMeetingType: event.target.value })}
                  >
                    <option value="phone">Phone</option>
                    <option value="zoom">Zoom</option>
                    <option value="google_meet">Google Meet</option>
                    <option value="in_person">In person</option>
                  </select>
                  <button type="submit" className="ops-button-primary w-full" disabled={saving === 'booking'}>
                    <Save className="h-4 w-4" aria-hidden="true" />
                    Save Booking
                  </button>
                </form>
              </Panel>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

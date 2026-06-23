import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  BookOpen,
  Bot,
  Building2,
  Calendar,
  Check,
  ChevronRight,
  Mail,
  Phone,
  Upload,
  Users,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import {
  ONBOARDING_STEPS,
  completeTenantOnboarding,
  createTenantAgent,
  createTenantKnowledgeDocument,
  createTenantPhoneNumber,
  getCurrentPlatformAdminProfile,
  getTenantOnboardingState,
  importLeadsFromCsv,
  listBusinessNiches,
  saveTenantOnboardingStep,
  updateTenantAgent,
  updateTenantCompanyProfile,
  uploadTenantKnowledgeFile,
  upsertTenantBookingIntegration,
  upsertTenantEmailIdentity,
} from '../lib/insforge-product';
import {
  getCalendlyConnectUrl,
  listCalendlyEventTypes,
  listElevenLabsVoices,
  provisionElevenLabsAgent,
} from '../lib/insforge-functions';

const STEP_META = {
  company: { label: 'Company', icon: Building2, required: true },
  agent: { label: 'AI Agent', icon: Bot, required: true },
  phone: { label: 'Phone', icon: Phone, required: false },
  email: { label: 'Email', icon: Mail, required: false },
  booking: { label: 'Booking', icon: Calendar, required: true },
  knowledge: { label: 'Knowledge', icon: BookOpen, required: false },
  leads: { label: 'Leads', icon: Users, required: true },
  review: { label: 'Review', icon: Check, required: true },
};

const defaultCompanyForm = {
  name: '',
  industry: '',
  businessNiche: '',
  defaultTimezone: 'America/Toronto',
};

const defaultAgentForm = {
  id: '',
  displayName: '',
  voiceId: '',
  voiceProfile: 'any',
  status: 'live',
  personality: 'professional',
  customPersonalityNotes: '',
};

const voiceProfiles = [
  { key: 'any', label: 'Any available voice', match: () => true },
  { key: 'male', label: 'Male voice', match: (voice) => voice.gender?.toLowerCase() === 'male' },
  { key: 'female', label: 'Female voice', match: (voice) => voice.gender?.toLowerCase() === 'female' },
  { key: 'neutral', label: 'Neutral voice', match: (voice) => voice.gender?.toLowerCase() === 'neutral' },
  { key: 'british_male', label: 'British male accent', match: (voice) => voice.gender?.toLowerCase() === 'male' && /british|english|uk/i.test(voice.accent || '') },
  { key: 'british_female', label: 'British female accent', match: (voice) => voice.gender?.toLowerCase() === 'female' && /british|english|uk/i.test(voice.accent || '') },
  { key: 'american_male', label: 'American male accent', match: (voice) => voice.gender?.toLowerCase() === 'male' && /american|us/i.test(voice.accent || '') },
  { key: 'american_female', label: 'American female accent', match: (voice) => voice.gender?.toLowerCase() === 'female' && /american|us/i.test(voice.accent || '') },
  { key: 'spanish_female', label: 'Spanish female voice', match: (voice) => voice.gender?.toLowerCase() === 'female' && /spanish|spain|latin/i.test(`${voice.accent || ''} ${voice.name || ''} ${voice.description || ''}`) },
];

const personalityPresets = [
  { key: 'professional', label: 'Professional', prompt: 'Sound polished, calm, concise, and trustworthy. Keep the conversation focused and practical.' },
  { key: 'friendly', label: 'Friendly', prompt: 'Sound warm, approachable, patient, and clear. Make the lead feel comfortable without being too casual.' },
  { key: 'direct', label: 'Direct', prompt: 'Be brief, confident, and action-oriented. Avoid fluff and get to qualification or booking quickly.' },
  { key: 'sales_closer', label: 'Sales closer', prompt: 'Sound confident and persuasive while staying honest. Ask clear next-step questions and guide toward booking.' },
  { key: 'receptionist', label: 'Receptionist', prompt: 'Sound like a helpful front desk receptionist: organized, friendly, clear, and service-focused.' },
];

const defaultPhoneForm = {
  phoneNumber: '',
  providerPhoneNumberId: '',
  voiceEnabled: true,
  smsEnabled: true,
  whatsappStatus: 'active',
};

const defaultEmailForm = {
  fromName: '',
  fromEmail: '',
  replyToEmail: '',
};

const defaultBookingForm = {
  provider: 'calendly',
  bookingUrl: '',
  meetingLink: '',
  eventTypeId: '',
  defaultMeetingType: 'phone',
};

const defaultKnowledgeForm = {
  sourceType: 'text',
  title: '',
  sourceUrl: '',
  bodyText: '',
};

function nextStep(step) {
  const index = ONBOARDING_STEPS.indexOf(step);
  return ONBOARDING_STEPS[Math.min(index + 1, ONBOARDING_STEPS.length - 1)] || 'review';
}

function StatusBadge({ value, tone = 'neutral' }) {
  const tones = {
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    error: 'bg-error-soft text-error',
    info: 'bg-info-soft text-info',
    neutral: 'bg-surface-secondary text-text-secondary',
  };
  return <span className={`ops-badge ${tones[tone] || tones.neutral}`}>{value}</span>;
}

function Field({ label, children, optional }) {
  return (
    <label className="block space-y-1">
      <span className="flex items-center gap-2 text-xs font-medium text-text-muted">
        {label}
        {optional ? <span className="text-text-faint">Optional</span> : null}
      </span>
      {children}
    </label>
  );
}

function StepShell({ title, icon: Icon, children, actions }) {
  return (
    <section className="ops-panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          <h2 className="truncate text-sm font-semibold text-text-primary">{title}</h2>
        </div>
      </div>
      <div className="space-y-4 p-4">{children}</div>
      <div className="flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-end">
        {actions}
      </div>
    </section>
  );
}

async function readFileText(file) {
  if (!file) return '';
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeStep, setActiveStep] = useState('company');
  const [state, setState] = useState(null);
  const [onboardingUser, setOnboardingUser] = useState(null);
  const [niches, setNiches] = useState([]);
  const [voiceOptions, setVoiceOptions] = useState([]);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [voiceSearch, setVoiceSearch] = useState('');
  const [calendlyEventTypes, setCalendlyEventTypes] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [companyForm, setCompanyForm] = useState(defaultCompanyForm);
  const [agentForm, setAgentForm] = useState(defaultAgentForm);
  const [phoneForm, setPhoneForm] = useState(defaultPhoneForm);
  const [emailForm, setEmailForm] = useState(defaultEmailForm);
  const [bookingForm, setBookingForm] = useState(defaultBookingForm);
  const [knowledgeForm, setKnowledgeForm] = useState(defaultKnowledgeForm);
  const [knowledgeFile, setKnowledgeFile] = useState(null);
  const [csvText, setCsvText] = useState('');
  const [csvFile, setCsvFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const targetTenantId = typeof router.query.tenantId === 'string' ? router.query.tenantId : '';
  const assistedMode = router.query.mode === 'super_admin_assisted' && Boolean(targetTenantId);
  const tenantUser = onboardingUser || user;

  useEffect(() => {
    if (authLoading || !router.isReady) return;
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    if (user?.role !== 'admin') {
      router.replace('/login');
      return;
    }

    async function prepareOnboarding() {
      if (assistedMode) {
        try {
          const profile = await getCurrentPlatformAdminProfile();
          if (!profile?.isPlatformAdmin) {
            router.replace('/admin-dashboard');
            return;
          }
          const nextUser = {
            ...user,
            tenantId: targetTenantId,
            tenant: {
              ...(user?.tenant || {}),
              id: targetTenantId,
            },
            actorMode: 'super_admin_assisted',
          };
          setOnboardingUser(nextUser);
          await loadOnboarding(nextUser);
        } catch (err) {
          setError(err.message || 'Failed to open assisted onboarding');
          setLoading(false);
        }
        return;
      }

      setOnboardingUser(user);
      await loadOnboarding(user);
    }

    prepareOnboarding();
  }, [authLoading, isAuthenticated, user, router, router.isReady, assistedMode, targetTenantId]);

  useEffect(() => {
    if (!user || typeof window === 'undefined') return undefined;

    async function handleCalendlyCompleted(payload = {}) {
      if (payload.provider !== 'calendly' || payload.target !== 'onboarding') return;
      if (payload.status === 'error') {
        setError(payload.error || 'Calendly connection was not completed');
        return;
      }
      setError('');
      setNotice('Calendly connected.');
      setActiveStep('booking');
      await loadOnboarding(tenantUser);
      const result = await listCalendlyEventTypes().catch(() => ({ eventTypes: [] }));
      setCalendlyEventTypes(result.eventTypes || []);
    }

    function handleStorage(event) {
      if (event.key !== 'bob:integration-connected' || !event.newValue) return;
      try {
        handleCalendlyCompleted(JSON.parse(event.newValue));
      } catch {
        setError('Calendly connection status could not be read');
      }
    }

    let channel = null;
    if ('BroadcastChannel' in window) {
      channel = new BroadcastChannel('bob-integrations');
      channel.onmessage = (event) => handleCalendlyCompleted(event.data || {});
    }
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('storage', handleStorage);
      if (channel) channel.close();
    };
  }, [user, tenantUser]);

  async function loadOnboarding(activeUser = tenantUser) {
    if (!activeUser) return;
    try {
      setLoading(true);
      setError('');
      const [nextState, nicheRows] = await Promise.all([
        getTenantOnboardingState(activeUser),
        listBusinessNiches().catch(() => []),
      ]);
      setState(nextState);
      setNiches((nicheRows || []).filter((niche) => niche.status !== 'archived'));
      hydrateForms(nextState);
      setActiveStep(nextState.progress?.currentStep || 'company');
      fetchVoiceOptions(activeUser);
    } catch (err) {
      setError(err.message || 'Failed to load onboarding');
    } finally {
      setLoading(false);
    }
  }

  async function fetchVoiceOptions(activeUser = tenantUser) {
    try {
      setVoiceLoading(true);
      setVoiceError('');
      const result = await listElevenLabsVoices(activeUser);
      setVoiceOptions(result.voices || []);
      if (!(result.voices || []).length) {
        setVoiceError('No ElevenLabs voices were returned by the provider.');
      }
    } catch (err) {
      console.warn('Failed to load ElevenLabs voices:', err);
      setVoiceOptions([]);
      setVoiceError(err.message || 'Failed to load ElevenLabs voices.');
    } finally {
      setVoiceLoading(false);
    }
  }

  function hydrateForms(nextState) {
    const summary = nextState.summary || {};
    const tenant = summary.tenant || {};
    const firstAgent = (summary.agents || []).find((agent) => agent.status !== 'archived') || null;
    const phone = summary.primaryPhoneNumber || (summary.phoneNumbers || [])[0] || null;
    const email = summary.emailIdentity || null;
    const booking = summary.bookingIntegration || null;

    setCompanyForm({
      name: tenant.name || '',
      industry: tenant.industry || '',
      businessNiche: tenant.businessNiche || '',
      defaultTimezone: tenant.defaultTimezone || 'America/Toronto',
    });
    setAgentForm({
      id: firstAgent?.id || '',
      displayName: firstAgent?.displayName || '',
      voiceId: firstAgent?.voiceId || '',
      voiceProfile: firstAgent?.metadata?.voiceProfile?.key || firstAgent?.metadata?.voiceProfile || 'any',
      status: 'live',
      personality: firstAgent?.metadata?.personality?.key || firstAgent?.metadata?.personality || 'professional',
      customPersonalityNotes: firstAgent?.metadata?.customPersonalityNotes || '',
    });
    setPhoneForm({
      phoneNumber: phone?.phoneNumber || '',
      providerPhoneNumberId: phone?.providerPhoneNumberId || '',
      voiceEnabled: phone?.voiceEnabled ?? true,
      smsEnabled: phone?.smsEnabled ?? true,
      whatsappStatus: phone?.whatsappStatus || 'active',
    });
    setEmailForm({
      fromName: email?.fromName || '',
      fromEmail: email?.fromEmail || '',
      replyToEmail: email?.replyToEmail || '',
    });
    setBookingForm({
      provider: booking?.provider || 'calendly',
      bookingUrl: booking?.bookingUrl || '',
      meetingLink: booking?.metadata?.meetingLink || '',
      eventTypeId: booking?.eventTypeId || '',
      defaultMeetingType: booking?.defaultMeetingType || 'phone',
    });
  }

  const readinessByKey = useMemo(() => {
    const rows = state?.readiness?.checks || [];
    return new Map(rows.map((row) => [row.key, row]));
  }, [state]);

  const completedSteps = new Set(state?.progress?.completedSteps || []);
  const progressPercent = state?.readiness?.score || 0;
  const filteredVoiceOptions = useMemo(() => {
    const profile = voiceProfiles.find((item) => item.key === agentForm.voiceProfile) || voiceProfiles[0];
    const matches = voiceOptions.filter(profile.match);
    const profileMatches = matches.length ? matches : voiceOptions;
    const search = voiceSearch.trim().toLowerCase();
    if (!search) return profileMatches;
    return profileMatches.filter((voice) => [
      voice.name,
      voice.gender,
      voice.accent,
      voice.age,
      voice.useCase,
      voice.category,
      voice.description,
    ].filter(Boolean).join(' ').toLowerCase().includes(search));
  }, [agentForm.voiceProfile, voiceOptions, voiceSearch]);
  const selectedVoice = useMemo(
    () => voiceOptions.find((voice) => voice.voiceId === agentForm.voiceId) || null,
    [agentForm.voiceId, voiceOptions]
  );

  async function reloadAfterSave(step, next = nextStep(step), message = 'Setup saved.') {
    await saveTenantOnboardingStep(tenantUser, step, { nextStep: next, answers: {} });
    const nextState = await getTenantOnboardingState(tenantUser);
    setState(nextState);
    setActiveStep(next);
    setNotice(message);
  }

  async function runSave(step, callback) {
    try {
      setSaving(true);
      setError('');
      setNotice('');
      await callback();
    } catch (err) {
      setError(err.message || 'Failed to save setup');
    } finally {
      setSaving(false);
    }
  }

  function saveCompany() {
    return runSave('company', async () => {
      await updateTenantCompanyProfile(tenantUser, companyForm);
      await reloadAfterSave('company');
    });
  }

  function saveAgent() {
    return runSave('agent', async () => {
      const selectedVoice = voiceOptions.find((voice) => voice.voiceId === agentForm.voiceId);
      const selectedVoiceProfile = voiceProfiles.find((profile) => profile.key === agentForm.voiceProfile) || voiceProfiles[0];
      const selectedPersonality = personalityPresets.find((preset) => preset.key === agentForm.personality) || personalityPresets[0];
      const voiceProfile = {
        key: selectedVoiceProfile.key,
        label: selectedVoiceProfile.label,
        selectedVoiceName: selectedVoice?.name || null,
        selectedVoiceLabels: selectedVoice?.labels || null,
        selectedVoicePreviewUrl: selectedVoice?.previewUrl || null,
        selectedVoiceCategory: selectedVoice?.category || null,
        selectedVoiceUseCase: selectedVoice?.useCase || null,
      };
      const personality = {
        key: selectedPersonality.key,
        label: selectedPersonality.label,
        prompt: selectedPersonality.prompt,
      };
      let savedAgent;
      if (agentForm.id) {
        savedAgent = await updateTenantAgent(tenantUser, agentForm.id, {
          displayName: agentForm.displayName,
          voiceId: agentForm.voiceId,
          status: 'live',
          voiceProfile,
          personality,
          customPersonalityNotes: agentForm.customPersonalityNotes,
          existingMetadata: state?.summary?.agents?.find((agent) => agent.id === agentForm.id)?.metadata || {},
        });
      } else {
        savedAgent = await createTenantAgent(tenantUser, {
          displayName: agentForm.displayName,
          voiceId: agentForm.voiceId,
          status: 'live',
          voiceProfile,
          personality,
          customPersonalityNotes: agentForm.customPersonalityNotes,
        });
      }
      const result = await provisionElevenLabsAgent(tenantUser, savedAgent?.id || agentForm.id);
      if (!result?.elevenlabsAgentId) {
        throw new Error('AI agent sync did not return an agent ID. Please try again.');
      }
      await reloadAfterSave('agent', nextStep('agent'), 'AI agent synced and ready.');
    });
  }

  function savePhone() {
    return runSave('phone', async () => {
      if (!phoneForm.phoneNumber?.trim()) {
        await reloadAfterSave('phone', nextStep('phone'), 'Phone setup skipped.');
        return;
      }
      if (!state?.summary?.primaryPhoneNumber?.id) {
        await createTenantPhoneNumber(tenantUser, {
          ...phoneForm,
          voiceEnabled: true,
          smsEnabled: true,
          whatsappStatus: 'active',
          isPrimary: true,
          status: 'active',
        });
      }
      await reloadAfterSave('phone');
    });
  }

  function saveEmail(skip = false) {
    return runSave('email', async () => {
      if (!skip && (emailForm.fromEmail || emailForm.fromName || emailForm.replyToEmail)) {
        await upsertTenantEmailIdentity(tenantUser, {
          ...emailForm,
          provider: 'platform',
        });
      }
      await reloadAfterSave('email');
    });
  }

  function saveBooking() {
    return runSave('booking', async () => {
      await upsertTenantBookingIntegration(tenantUser, { ...bookingForm, provider: 'calendly' });
      await reloadAfterSave('booking');
    });
  }

  function connectCalendly() {
    return runSave('booking', async () => {
      const popup = window.open('/integration-callback?platform=calendly&target=onboarding&status=processing', '_blank', 'width=720,height=780');
      if (!popup) throw new Error('Allow pop-ups to connect Calendly in a separate page');
      const result = await getCalendlyConnectUrl({
        returnTo: '/integration-callback?platform=calendly&target=onboarding',
      });
      try { popup.opener = null; } catch {}
      popup.location.href = result.authorizeUrl;
      popup.focus();
      setNotice('Calendly opened in a separate page. Return here after approving the connection.');
    });
  }

  function loadCalendlyEventTypes() {
    return runSave('booking', async () => {
      const result = await listCalendlyEventTypes();
      setCalendlyEventTypes(result.eventTypes || []);
      setNotice('Calendly event types loaded.');
    });
  }

  function saveKnowledge(skip = false) {
    return runSave('knowledge', async () => {
      if (!skip) {
        if (knowledgeForm.sourceType === 'file') {
          await uploadTenantKnowledgeFile(tenantUser, knowledgeFile, { title: knowledgeForm.title });
        } else {
          await createTenantKnowledgeDocument(tenantUser, knowledgeForm);
        }
        setKnowledgeForm(defaultKnowledgeForm);
        setKnowledgeFile(null);
      }
      await reloadAfterSave('knowledge');
    });
  }

  function saveLeads(skip = false) {
    return runSave('leads', async () => {
      if (!skip) {
        const fileText = await readFileText(csvFile);
        const sourceText = fileText || csvText;
        const result = await importLeadsFromCsv(tenantUser, {
          csvText: sourceText,
          fileName: csvFile?.name || 'onboarding-leads.csv',
        });
        setImportResult(result);
        setCsvText('');
        setCsvFile(null);
      }
      await reloadAfterSave('leads');
    });
  }

  function finishOnboarding() {
    return runSave('review', async () => {
      await completeTenantOnboarding(tenantUser);
      setNotice('Onboarding complete.');
      router.replace(assistedMode ? '/tenant-setup' : '/admin-dashboard');
    });
  }

  if (authLoading || loading) {
    return (
      <>
        <Head>
          <title>Onboarding | Bob Automation</title>
        </Head>
        <main className="flex min-h-screen items-center justify-center bg-background text-sm text-text-muted">
          Loading onboarding...
        </main>
      </>
    );
  }

  const StepIcon = STEP_META[activeStep]?.icon || Building2;

  return (
    <>
      <Head>
        <title>Onboarding | Bob Automation</title>
      </Head>
      <main className="min-h-screen bg-background px-4 py-6 text-text-primary sm:px-6">
        <div className="mx-auto max-w-[1440px] space-y-6">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-text-primary">Tenant Onboarding</h1>
              <p className="mt-1 text-sm text-text-secondary">
                {state?.summary?.tenant?.name || 'Complete required setup before live outreach.'}
              </p>
              {assistedMode ? (
                <p className="mt-1 text-xs text-text-muted">
                  Super admin assisted setup by {user?.email || user?.name || 'platform admin'}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge
                value={state?.progress?.isComplete ? 'Complete' : 'In progress'}
                tone={state?.progress?.isComplete ? 'success' : 'info'}
              />
              <button type="button" className="ops-button-secondary" onClick={() => router.push(assistedMode ? '/tenant-setup' : '/admin-dashboard')}>
                {assistedMode ? 'Tenant Setup' : 'Dashboard'}
              </button>
            </div>
          </header>

          {error ? <div className="ops-panel border-error bg-error-soft px-4 py-3 text-sm font-medium text-error">{error}</div> : null}
          {notice ? <div className="ops-panel border-success bg-success-soft px-4 py-3 text-sm font-medium text-success">{notice}</div> : null}

          <section className="ops-panel p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-text-primary">Setup readiness</p>
                <p className="mt-1 text-xs text-text-muted">
                  {state?.readiness?.isReady ? 'Required setup is ready for a test run.' : `${state?.readiness?.blockers?.length || 0} required item${state?.readiness?.blockers?.length === 1 ? '' : 's'} left.`}
                </p>
              </div>
              <p className="text-2xl font-semibold text-text-primary">{progressPercent}%</p>
            </div>
            <div className="mt-4 h-2 rounded-full bg-surface-tertiary">
              <div className="h-2 rounded-full bg-accent" style={{ width: `${progressPercent}%` }} />
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
            <aside className="ops-panel p-3">
              <nav className="space-y-1">
                {ONBOARDING_STEPS.map((step) => {
                  const meta = STEP_META[step];
                  const Icon = meta.icon;
                  const check = readinessByKey.get(step);
                  const active = step === activeStep;
                  const done = completedSteps.has(step) || check?.complete || (step === 'review' && state?.progress?.isComplete);
                  return (
                    <button
                      key={step}
                      type="button"
                      onClick={() => setActiveStep(step)}
                      disabled={saving}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium ${
                        active ? 'bg-accent text-accent-foreground' : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{meta.label}</span>
                      </span>
                      {done ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />}
                    </button>
                  );
                })}
              </nav>
            </aside>

            <div className="space-y-6">
              {activeStep === 'company' ? (
                <StepShell
                  title="Company Profile"
                  icon={StepIcon}
                  actions={<button type="button" className="ops-button-primary" disabled={saving} onClick={saveCompany}>Save and Continue</button>}
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Company name">
                      <input className="ops-input" value={companyForm.name} onChange={(event) => setCompanyForm({ ...companyForm, name: event.target.value })} />
                    </Field>
                    <Field label="Timezone">
                      <input className="ops-input" value={companyForm.defaultTimezone} onChange={(event) => setCompanyForm({ ...companyForm, defaultTimezone: event.target.value })} />
                    </Field>
                    <Field label="Industry" optional>
                      <input className="ops-input" value={companyForm.industry} onChange={(event) => setCompanyForm({ ...companyForm, industry: event.target.value })} />
                    </Field>
                    <Field label="Business niche" optional>
                      <select className="ops-select" value={companyForm.businessNiche} onChange={(event) => setCompanyForm({ ...companyForm, businessNiche: event.target.value })}>
                        <option value="">No niche selected</option>
                        {niches.map((niche) => <option key={niche.key} value={niche.key}>{niche.name}</option>)}
                      </select>
                    </Field>
                  </div>
                </StepShell>
              ) : null}

              {activeStep === 'agent' ? (
                <StepShell
                  title="AI Agent"
                  icon={StepIcon}
                  actions={<button type="button" className="ops-button-primary" disabled={saving} onClick={saveAgent}>{saving ? 'Syncing...' : 'Save and Sync'}</button>}
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Agent name">
                      <input className="ops-input" value={agentForm.displayName} onChange={(event) => setAgentForm({ ...agentForm, displayName: event.target.value })} placeholder="Karen" />
                    </Field>
                    <Field label="Type of voice or accent">
                      <select className="ops-select" value={agentForm.voiceProfile} onChange={(event) => setAgentForm({ ...agentForm, voiceProfile: event.target.value, voiceId: '' })}>
                        {voiceProfiles.map((profile) => (
                          <option key={profile.key} value={profile.key}>{profile.label}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Search voices" optional>
                      <div className="space-y-2 rounded-lg border border-border bg-surface-secondary p-3">
                        <div className="flex items-center justify-between gap-2 text-xs text-text-muted">
                          <span>{voiceLoading ? 'Loading ElevenLabs voices...' : `${voiceOptions.length} ElevenLabs voices loaded`}</span>
                          {filteredVoiceOptions.length !== voiceOptions.length ? <span>{filteredVoiceOptions.length} shown</span> : null}
                        </div>
                        <input
                          className="ops-input"
                          value={voiceSearch}
                          onChange={(event) => setVoiceSearch(event.target.value)}
                          placeholder="Search by name, accent, gender, or use case"
                        />
                      </div>
                    </Field>
                    <Field label="ElevenLabs voice" optional>
                      <select className="ops-select" value={agentForm.voiceId} onChange={(event) => setAgentForm({ ...agentForm, voiceId: event.target.value })}>
                        <option value="">{voiceLoading ? 'Loading voices...' : voiceOptions.length ? 'Use provider default voice' : 'No voices loaded'}</option>
                        {filteredVoiceOptions.map((voice) => (
                          <option key={voice.voiceId} value={voice.voiceId}>
                            {voice.name}
                            {voice.gender || voice.accent ? ` - ${[voice.gender, voice.accent].filter(Boolean).join(', ')}` : ''}
                            {voice.useCase ? ` - ${voice.useCase}` : ''}
                          </option>
                        ))}
                      </select>
                      {selectedVoice ? (
                        <div className="rounded-lg border border-border bg-surface-secondary px-3 py-2 text-xs text-text-secondary">
                          <div className="font-medium text-text-primary">{selectedVoice.name}</div>
                          <div className="mt-1">
                            {[selectedVoice.gender, selectedVoice.accent, selectedVoice.age, selectedVoice.useCase, selectedVoice.category].filter(Boolean).join(' · ') || 'Voice details unavailable'}
                          </div>
                          {selectedVoice.previewUrl ? (
                            <a className="mt-2 inline-flex text-accent hover:text-accent-hover" href={selectedVoice.previewUrl} target="_blank" rel="noreferrer">
                              Preview voice
                            </a>
                          ) : null}
                        </div>
                      ) : null}
                      {voiceError ? <p className="text-xs text-warning">{voiceError}</p> : null}
                    </Field>
                    <Field label="Personality">
                      <select className="ops-select" value={agentForm.personality} onChange={(event) => setAgentForm({ ...agentForm, personality: event.target.value })}>
                        {personalityPresets.map((preset) => (
                          <option key={preset.key} value={preset.key}>{preset.label}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <Field label="Extra personality notes" optional>
                    <textarea
                      className="min-h-24 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                      value={agentForm.customPersonalityNotes}
                      onChange={(event) => setAgentForm({ ...agentForm, customPersonalityNotes: event.target.value })}
                      placeholder="Example: calm, confident, warm, no slang, luxury tone"
                    />
                  </Field>
                </StepShell>
              ) : null}

              {activeStep === 'phone' ? (
                <StepShell
                  title="Phone Number"
                  icon={StepIcon}
                  actions={<button type="button" className="ops-button-primary" disabled={saving || Boolean(state?.summary?.primaryPhoneNumber?.id)} onClick={savePhone}>{phoneForm.phoneNumber?.trim() ? 'Save and Continue' : 'Continue'}</button>}
                >
                  {state?.summary?.primaryPhoneNumber?.id ? (
                    <div className="rounded-lg border border-border bg-surface-secondary px-4 py-3 text-sm text-text-secondary">
                      Phone number saved: <span className="font-medium text-text-primary">{state.summary.primaryPhoneNumber.phoneNumber}</span>
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Phone number" optional>
                        <input className="ops-input" value={phoneForm.phoneNumber} onChange={(event) => setPhoneForm({ ...phoneForm, phoneNumber: event.target.value })} placeholder="+15551234567" />
                      </Field>
                      <Field label="Provider phone ID" optional>
                        <input className="ops-input" value={phoneForm.providerPhoneNumberId} onChange={(event) => setPhoneForm({ ...phoneForm, providerPhoneNumberId: event.target.value })} />
                      </Field>
                    </div>
                  )}
                </StepShell>
              ) : null}

              {activeStep === 'email' ? (
                <StepShell
                  title="Sender Identity"
                  icon={StepIcon}
                  actions={(
                    <>
                      <button type="button" className="ops-button-secondary" disabled={saving} onClick={() => saveEmail(true)}>Skip for Now</button>
                      <button type="button" className="ops-button-primary" disabled={saving} onClick={() => saveEmail(false)}>Save and Continue</button>
                    </>
                  )}
                >
                  <div className="grid gap-4 md:grid-cols-3">
                    <Field label="From name" optional>
                      <input className="ops-input" value={emailForm.fromName} onChange={(event) => setEmailForm({ ...emailForm, fromName: event.target.value })} />
                    </Field>
                    <Field label="From email" optional>
                      <input className="ops-input" type="email" value={emailForm.fromEmail} onChange={(event) => setEmailForm({ ...emailForm, fromEmail: event.target.value })} />
                    </Field>
                    <Field label="Reply-to email" optional>
                      <input className="ops-input" type="email" value={emailForm.replyToEmail} onChange={(event) => setEmailForm({ ...emailForm, replyToEmail: event.target.value })} />
                    </Field>
                  </div>
                </StepShell>
              ) : null}

              {activeStep === 'booking' ? (
                <StepShell
                  title="Booking Integration"
                  icon={StepIcon}
                  actions={<button type="button" className="ops-button-primary" disabled={saving} onClick={saveBooking}>Save and Continue</button>}
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Meeting type">
                      <select className="ops-select" value={bookingForm.defaultMeetingType} onChange={(event) => setBookingForm({ ...bookingForm, defaultMeetingType: event.target.value })}>
                        <option value="phone">Phone</option>
                        <option value="zoom">Zoom</option>
                        <option value="google_meet">Google Meet</option>
                        <option value="in_person">In person</option>
                      </select>
                    </Field>
                    <Field label="Calendly booking URL">
                      <input className="ops-input" value={bookingForm.bookingUrl} onChange={(event) => setBookingForm({ ...bookingForm, bookingUrl: event.target.value })} placeholder="https://calendly.com/..." />
                    </Field>
                    <Field label="Meeting link" optional>
                      <input className="ops-input" value={bookingForm.meetingLink} onChange={(event) => setBookingForm({ ...bookingForm, meetingLink: event.target.value })} placeholder="https://zoom.us/..." />
                    </Field>
                    <Field label="Calendly event type" optional>
                      <input className="ops-input" value={bookingForm.eventTypeId} onChange={(event) => setBookingForm({ ...bookingForm, eventTypeId: event.target.value })} />
                    </Field>
                    {calendlyEventTypes.length ? (
                      <Field label="Connected event type" optional>
                        <select className="ops-select" value={bookingForm.eventTypeId} onChange={(event) => setBookingForm({ ...bookingForm, eventTypeId: event.target.value })}>
                          <option value="">Select a connected Calendly event type</option>
                          {calendlyEventTypes.map((eventType) => (
                            <option key={eventType.id} value={eventType.id}>{eventType.name}{eventType.duration ? ` (${eventType.duration} min)` : ''}</option>
                          ))}
                        </select>
                      </Field>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="ops-button-secondary" disabled={saving} onClick={connectCalendly}>Connect Calendly</button>
                    <button type="button" className="ops-button-secondary" disabled={saving} onClick={loadCalendlyEventTypes}>Load Event Types</button>
                  </div>
                </StepShell>
              ) : null}

              {activeStep === 'knowledge' ? (
                <StepShell
                  title="Knowledge Base"
                  icon={StepIcon}
                  actions={(
                    <>
                      <button type="button" className="ops-button-secondary" disabled={saving} onClick={() => saveKnowledge(true)}>Skip for Now</button>
                      <button type="button" className="ops-button-primary" disabled={saving} onClick={() => saveKnowledge(false)}>Save and Continue</button>
                    </>
                  )}
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Knowledge source">
                      <select className="ops-select" value={knowledgeForm.sourceType} onChange={(event) => setKnowledgeForm({ ...knowledgeForm, sourceType: event.target.value })}>
                        <option value="text">Type text</option>
                        <option value="url">Add URL</option>
                        <option value="file">Upload file</option>
                      </select>
                    </Field>
                    <Field label="Title">
                      <input className="ops-input" value={knowledgeForm.title} onChange={(event) => setKnowledgeForm({ ...knowledgeForm, title: event.target.value })} />
                    </Field>
                    {knowledgeForm.sourceType === 'url' ? (
                      <Field label="Source URL">
                        <input className="ops-input" value={knowledgeForm.sourceUrl} onChange={(event) => setKnowledgeForm({ ...knowledgeForm, sourceUrl: event.target.value })} />
                      </Field>
                    ) : null}
                    {knowledgeForm.sourceType === 'file' ? (
                      <Field label="Knowledge file">
                        <input className="ops-input py-1.5" type="file" onChange={(event) => setKnowledgeFile(event.target.files?.[0] || null)} />
                      </Field>
                    ) : null}
                  </div>
                  {knowledgeForm.sourceType === 'text' ? (
                    <Field label="Knowledge text">
                      <textarea className="min-h-32 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-accent" value={knowledgeForm.bodyText} onChange={(event) => setKnowledgeForm({ ...knowledgeForm, bodyText: event.target.value })} />
                    </Field>
                  ) : null}
                  <p className="text-xs text-text-muted">{state?.knowledgeDocuments?.length || 0} tenant knowledge source{state?.knowledgeDocuments?.length === 1 ? '' : 's'} saved.</p>
                </StepShell>
              ) : null}

              {activeStep === 'leads' ? (
                <StepShell
                  title="Lead Import"
                  icon={StepIcon}
                  actions={(
                    <>
                      <button type="button" className="ops-button-secondary" disabled={saving} onClick={() => saveLeads(true)}>Save Later</button>
                      <button type="button" className="ops-button-primary" disabled={saving} onClick={() => saveLeads(false)}>
                        <Upload className="h-4 w-4" />
                        Import and Continue
                      </button>
                    </>
                  )}
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="CSV file" optional>
                      <input className="ops-input py-1.5" type="file" accept=".csv,text/csv" onChange={(event) => setCsvFile(event.target.files?.[0] || null)} />
                    </Field>
                    <div className="rounded-lg border border-border bg-surface-secondary px-4 py-3 text-sm text-text-secondary">
                      {state?.leads?.length || 0} lead{state?.leads?.length === 1 ? '' : 's'} currently saved.
                    </div>
                  </div>
                  <Field label="Paste CSV" optional>
                    <textarea className="min-h-36 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-accent" value={csvText} onChange={(event) => setCsvText(event.target.value)} placeholder="Name,Phone,Email,Call Consent,SMS Consent" />
                  </Field>
                  {importResult ? <p className="text-xs text-success">Imported {importResult.inserted?.length || 0} lead rows.</p> : null}
                </StepShell>
              ) : null}

              {activeStep === 'review' ? (
                <StepShell
                  title="Readiness Review"
                  icon={StepIcon}
                  actions={<button type="button" className="ops-button-primary" disabled={saving || !state?.readiness?.isReady} onClick={finishOnboarding}>Complete Onboarding</button>}
                >
                  <div className="grid gap-3">
                    {(state?.readiness?.checks || []).map((check) => (
                      <div key={check.key} className="flex flex-col gap-2 rounded-lg border border-border bg-surface-secondary px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-medium text-text-primary">{check.label}</p>
                          <p className="mt-1 text-xs text-text-muted">{check.detail}</p>
                        </div>
                        <StatusBadge
                          value={check.complete ? 'Ready' : check.required ? 'Required' : 'Optional'}
                          tone={check.complete ? 'success' : check.required ? 'warning' : 'neutral'}
                        />
                      </div>
                    ))}
                  </div>
                  {!state?.readiness?.isReady ? (
                    <div className="rounded-lg border border-warning bg-warning-soft px-4 py-3 text-sm text-warning">
                      Complete required items before live outreach can start.
                    </div>
                  ) : null}
                </StepShell>
              ) : null}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

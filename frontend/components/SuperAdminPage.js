import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { format } from 'date-fns';
import {
  Activity,
  AlertCircle,
  BarChart3,
  BookOpen,
  Bot,
  Briefcase,
  Building2,
  Clock,
  HeartPulse,
  Layers,
  Lock,
  Plus,
  Save,
  ShieldCheck,
  UploadCloud,
  UserCog,
} from 'lucide-react';
import SuperAdminShell from './SuperAdminShell';
import {
  createAssistedTenant,
  createPlatformKnowledgeDocument,
  getSuperAdminDashboardData,
  uploadPlatformKnowledgeFile,
  updateSuperAdminTenantProfile,
  upsertBusinessNiche,
  upsertTenantKnowledgeAssignment,
} from '../lib/insforge-product';
import { useAuth } from '../lib/auth';

const PAGE_META = {
  overview: {
    title: 'Overview',
    description: 'Platform-wide tenant activity, AI usage, alerts, and operational readiness.',
  },
  tenants: {
    title: 'Tenants',
    description: 'Tenant status, setup readiness, business niche, usage, and operational alerts.',
  },
  'tenant-setup': {
    title: 'Tenant Setup',
    description: 'Create tenants and track assisted setup without entering tenant-private workspaces.',
  },
  'knowledge-library': {
    title: 'Knowledge Library',
    description: 'Manage global and niche playbooks only. Tenant-private knowledge base content is not shown.',
  },
  'provider-health': {
    title: 'Provider Health',
    description: 'Monitor Twilio, ElevenLabs, booking, email, and webhook provider readiness.',
  },
  'usage-billing': {
    title: 'Usage & Billing',
    description: 'Compare tenant usage, limits, activity volume, and billing readiness.',
  },
  'audit-logs': {
    title: 'Audit Logs',
    description: 'Review platform admin actions, setup events, provider alerts, and queue outcomes.',
  },
  security: {
    title: 'Security',
    description: 'Manage platform admin visibility, tenant isolation checks, consent, and alert posture.',
  },
};

function formatDate(value) {
  if (!value) return 'N/A';
  try {
    return format(new Date(value), 'MMM d, yyyy HH:mm');
  } catch {
    return 'N/A';
  }
}

function StatusBadge({ value, tone = 'neutral' }) {
  const tones = {
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    error: 'bg-error-soft text-error',
    info: 'bg-info-soft text-info',
    accent: 'bg-accent-soft text-accent',
    neutral: 'bg-surface-secondary text-text-secondary',
  };
  return (
    <span className={`ops-badge ${tones[tone] || tones.neutral}`}>
      {String(value || 'Unknown').replace(/_/g, ' ')}
    </span>
  );
}

function statusTone(status) {
  if (['active', 'live', 'ready', 'connected', 'complete', 'sent', 'delivered'].includes(status)) return 'success';
  if (['onboarding', 'pending', 'uploaded', 'processing', 'in_progress'].includes(status)) return 'info';
  if (['needs_setup', 'needs_attention', 'paused', 'draft'].includes(status)) return 'warning';
  if (['failed', 'disabled', 'suspended', 'archived', 'error'].includes(status)) return 'error';
  return 'neutral';
}

function MetricCard({ label, value, detail, icon: Icon, tone = 'accent' }) {
  const toneClasses = {
    accent: 'bg-accent-soft text-accent',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    info: 'bg-info-soft text-info',
    error: 'bg-error-soft text-error',
  };
  return (
    <div className="ops-panel p-4">
      <div className="flex items-center gap-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${toneClasses[tone] || toneClasses.accent}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-text-muted">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{value}</p>
          {detail && <p className="mt-1 truncate text-xs text-text-muted">{detail}</p>}
        </div>
      </div>
    </div>
  );
}

function Panel({ title, icon: Icon, action, children }) {
  return (
    <section className="ops-panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-accent" />}
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function EmptyState({ children }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface-secondary px-4 py-8 text-center text-sm text-text-muted">
      {children}
    </div>
  );
}

function ProgressBar({ value }) {
  return (
    <div className="h-2 w-full rounded-full bg-surface-tertiary">
      <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} />
    </div>
  );
}

function titleFromFileName(fileName = '') {
  const baseName = String(fileName || '')
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return baseName || '';
}

function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function firstActive(rows = []) {
  return rows.find((row) => row.isPrimary && ['active', 'connected'].includes(row.status))
    || rows.find((row) => ['active', 'connected'].includes(row.status))
    || rows[0]
    || null;
}

function FieldValue({ label, value }) {
  const displayValue = value === null || value === undefined || value === '' ? 'N/A' : value;
  return (
    <div className="rounded-lg border border-border bg-surface-secondary px-3 py-2">
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-text-primary">{displayValue}</p>
    </div>
  );
}

function SimpleTable({ columns, rows, emptyText }) {
  if (!rows.length) return <EmptyState>{emptyText}</EmptyState>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-surface-secondary text-xs text-text-muted">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="px-4 py-3 text-left font-medium">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-surface">
          {rows.map((row, index) => (
            <tr key={row.id || row.key || index}>
              {columns.map((column) => (
                <td key={column.key} className="px-4 py-3 align-top text-text-secondary">
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Overview({ data }) {
  const topAgent = data.agentsWithUsage[0];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard label="Tenants" value={data.counts.tenants} detail={`${data.counts.activeTenants} active`} icon={Building2} />
        <MetricCard label="AI Agents Created" value={data.counts.aiAgents} detail={`${data.counts.liveAgents} live`} icon={Bot} tone="success" />
        <MetricCard label="Most Used Agent" value={topAgent?.displayName || 'None'} detail={topAgent ? `${topAgent.usageCount} actions · ${topAgent.tenantName}` : 'No activity yet'} icon={BarChart3} tone="info" />
        <MetricCard label="Open Alerts" value={data.counts.openAlerts} detail="Provider and queue attention" icon={AlertCircle} tone={data.counts.openAlerts ? 'warning' : 'success'} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel title="Tenant Usage Leaders" icon={Activity}>
          <SimpleTable
            emptyText="No tenant usage has been recorded yet."
            rows={data.usageByTenant.slice(0, 6)}
            columns={[
              { key: 'tenantName', label: 'Tenant', render: (row) => <span className="font-medium text-text-primary">{row.tenantName}</span> },
              { key: 'agents', label: 'Agents' },
              { key: 'calls', label: 'Calls' },
              { key: 'messages', label: 'Messages' },
              { key: 'openAlerts', label: 'Alerts', render: (row) => <StatusBadge value={row.openAlerts} tone={row.openAlerts ? 'warning' : 'success'} /> },
            ]}
          />
        </Panel>
        <Panel title="AI Agent Usage" icon={Bot}>
          <SimpleTable
            emptyText="No AI agent usage is available yet."
            rows={data.agentsWithUsage.slice(0, 6)}
            columns={[
              { key: 'displayName', label: 'Agent', render: (row) => <span className="font-medium text-text-primary">{row.displayName}</span> },
              { key: 'tenantName', label: 'Tenant' },
              { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} tone={statusTone(row.status)} /> },
              { key: 'usageCount', label: 'Actions' },
              { key: 'meetingCount', label: 'Bookings' },
            ]}
          />
        </Panel>
      </div>

      <Panel title="Provider Health Snapshot" icon={HeartPulse}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {data.providerHealth.map((provider) => (
            <div key={provider.provider} className="rounded-lg border border-border bg-surface-secondary p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-text-primary">{provider.provider}</p>
                <StatusBadge value={provider.status} tone={statusTone(provider.status)} />
              </div>
              <p className="mt-2 text-xs text-text-muted">{provider.healthy} healthy · {provider.attention} attention</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Tenants({ data, reload, user }) {
  const router = useRouter();
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [editForm, setEditForm] = useState({
    name: '',
    industry: '',
    businessNiche: '',
    defaultTimezone: '',
    city: '',
    country: '',
    status: 'onboarding',
  });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data.tenantReadiness.length) return;
    const selectedStillExists = data.tenantReadiness.some((tenant) => tenant.id === selectedTenantId);
    if (!selectedTenantId || !selectedStillExists) {
      setSelectedTenantId(data.tenantReadiness[0].id);
    }
  }, [data.tenantReadiness, selectedTenantId]);

  const selectedTenant = data.tenantReadiness.find((tenant) => tenant.id === selectedTenantId) || data.tenantReadiness[0] || null;

  useEffect(() => {
    if (!selectedTenant) return;
    setEditForm({
      name: selectedTenant.name || '',
      industry: selectedTenant.industry || '',
      businessNiche: selectedTenant.businessNiche || '',
      defaultTimezone: selectedTenant.defaultTimezone || 'America/Toronto',
      city: selectedTenant.city || '',
      country: selectedTenant.country || '',
      status: selectedTenant.status || 'onboarding',
    });
    setMessage('');
  }, [selectedTenant]);

  const details = useMemo(() => {
    if (!selectedTenant) return null;
    const tenantId = selectedTenant.id;
    const agents = data.tenantAgents.filter((agent) => agent.tenantId === tenantId && agent.status !== 'archived');
    const phoneNumbers = data.phoneNumbers.filter((phone) => phone.tenantId === tenantId);
    const emailIdentities = data.emailIdentities.filter((identity) => identity.tenantId === tenantId);
    const bookingIntegrations = data.bookingIntegrations.filter((booking) => booking.tenantId === tenantId);
    const usage = data.usageByTenant.find((row) => row.tenantId === tenantId) || {};
    const setupSession = data.setupSessions.find((session) => session.tenantId === tenantId && session.status !== 'complete')
      || data.setupSessions.find((session) => session.tenantId === tenantId);
    return {
      agents,
      primaryAgent: agents.find((agent) => agent.status === 'live') || agents[0] || null,
      primaryPhone: firstActive(phoneNumbers),
      emailIdentity: firstActive(emailIdentities),
      bookingIntegration: firstActive(bookingIntegrations),
      ownerClaim: data.tenantOwnerClaims.find((claim) => claim.tenantId === tenantId) || null,
      tenantUsers: data.tenantUsers.filter((tenantUser) => tenantUser.tenantId === tenantId),
      alerts: data.operationalAlerts.filter((alert) => alert.tenantId === tenantId && alert.status !== 'resolved'),
      usage,
      setupSession,
    };
  }, [data, selectedTenant]);

  const handleSave = async (event) => {
    event.preventDefault();
    if (!selectedTenant) return;
    setBusy(true);
    setMessage('');
    try {
      await updateSuperAdminTenantProfile(user, selectedTenant.id, {
        ...editForm,
        existingMetadata: selectedTenant.metadata || {},
      });
      setMessage('Tenant details saved.');
      await reload();
    } catch (error) {
      setMessage(error.message || 'Failed to save tenant details.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Panel title="Tenant Operations" icon={Building2}>
        <SimpleTable
          emptyText="No tenants exist yet."
          rows={data.tenantReadiness}
          columns={[
            { key: 'name', label: 'Tenant', render: (row) => <div><p className="font-medium text-text-primary">{row.name}</p><p className="text-xs text-text-muted">{row.slug}</p></div> },
            { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} tone={statusTone(row.status)} /> },
            { key: 'businessNiche', label: 'Niche', render: (row) => row.businessNiche || 'None' },
            { key: 'readinessScore', label: 'Readiness', render: (row) => <div className="min-w-32"><ProgressBar value={row.readinessScore} /><p className="mt-1 text-xs text-text-muted">{row.readinessScore}%</p></div> },
            { key: 'setupStep', label: 'Setup Step' },
            { key: 'createdAt', label: 'Created', render: (row) => formatDate(row.createdAt) },
            {
              key: 'action',
              label: 'Action',
              render: (row) => (
                <button
                  type="button"
                  className={row.id === selectedTenant?.id ? 'ops-button-primary h-8 px-3 text-xs' : 'ops-button-secondary h-8 px-3 text-xs'}
                  onClick={() => setSelectedTenantId(row.id)}
                >
                  View
                </button>
              ),
            },
          ]}
        />
      </Panel>

      {selectedTenant && details && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <section className="ops-panel overflow-hidden xl:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-text-primary">{selectedTenant.name}</h2>
                <p className="mt-1 text-xs text-text-muted">{selectedTenant.slug} · Created {formatDate(selectedTenant.createdAt)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge value={selectedTenant.status} tone={statusTone(selectedTenant.status)} />
                <button
                  type="button"
                  className="ops-button-secondary h-8 px-3 text-xs"
                  onClick={() => router.push(`/onboarding?mode=super_admin_assisted&tenantId=${encodeURIComponent(selectedTenant.id)}`)}
                >
                  Open setup
                </button>
              </div>
            </div>
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <FieldValue label="Owner claim" value={details.ownerClaim ? `${details.ownerClaim.email} · ${details.ownerClaim.status}` : 'No claim'} />
                <FieldValue label="Tenant users" value={details.tenantUsers.length} />
                <FieldValue label="Active alerts" value={details.alerts.length} />
                <FieldValue label="Primary AI agent" value={details.primaryAgent?.displayName} />
                <FieldValue label="Phone identity" value={details.primaryPhone?.phoneNumber} />
                <FieldValue label="Sender email" value={details.emailIdentity?.fromEmail} />
                <FieldValue label="Booking" value={details.bookingIntegration?.bookingUrl || details.bookingIntegration?.eventTypeId} />
                <FieldValue label="Usage" value={`${details.usage.calls || 0} calls · ${details.usage.messages || 0} messages · ${details.usage.emails || 0} emails`} />
                <FieldValue label="Setup session" value={details.setupSession ? `${details.setupSession.currentStep} · ${details.setupSession.status}` : 'Not started'} />
              </div>

              <div className="rounded-lg border border-border bg-surface-secondary p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text-primary">Readiness</p>
                    <p className="mt-1 text-xs text-text-muted">
                      Agent {selectedTenant.hasAgent ? 'ready' : 'missing'} · Phone {selectedTenant.hasPhone ? 'ready' : 'missing'} · Email {selectedTenant.hasEmail ? 'ready' : 'missing'} · Booking {selectedTenant.hasBooking ? 'ready' : 'missing'}
                    </p>
                  </div>
                  <div className="w-32">
                    <ProgressBar value={selectedTenant.readinessScore} />
                    <p className="mt-1 text-right text-xs text-text-muted">{selectedTenant.readinessScore}%</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-accent" />
                  <h3 className="text-sm font-semibold text-text-primary">AI Agents</h3>
                </div>
                <SimpleTable
                  emptyText="No AI agents have been created for this tenant."
                  rows={details.agents}
                  columns={[
                    { key: 'displayName', label: 'Agent', render: (row) => <span className="font-medium text-text-primary">{row.displayName}</span> },
                    { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} tone={statusTone(row.status)} /> },
                    { key: 'emailAddress', label: 'Email', render: (row) => row.emailAddress || 'N/A' },
                    { key: 'elevenlabsAgentId', label: 'ElevenLabs', render: (row) => row.elevenlabsAgentId ? 'Synced' : 'Not synced' },
                  ]}
                />
              </div>
            </div>
          </section>

          <Panel title="Edit Tenant" icon={UserCog}>
            <form onSubmit={handleSave} className="space-y-3">
              {message && <div className="rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-text-secondary">{message}</div>}
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-text-secondary">Company name</span>
                <input className="ops-input" value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-text-secondary">Status</span>
                <select className="ops-select" value={editForm.status} onChange={(event) => setEditForm((current) => ({ ...current, status: event.target.value }))}>
                  <option value="onboarding">Onboarding</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-text-secondary">Industry</span>
                <input className="ops-input" value={editForm.industry} onChange={(event) => setEditForm((current) => ({ ...current, industry: event.target.value }))} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-text-secondary">Business niche</span>
                <select className="ops-select" value={editForm.businessNiche} onChange={(event) => setEditForm((current) => ({ ...current, businessNiche: event.target.value }))}>
                  <option value="">No niche selected</option>
                  {data.businessNiches.filter((niche) => niche.status === 'active').map((niche) => (
                    <option key={niche.key} value={niche.key}>{niche.name}</option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-text-secondary">City</span>
                  <input className="ops-input" value={editForm.city} onChange={(event) => setEditForm((current) => ({ ...current, city: event.target.value }))} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-text-secondary">Country</span>
                  <input className="ops-input" value={editForm.country} onChange={(event) => setEditForm((current) => ({ ...current, country: event.target.value }))} />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-text-secondary">Default timezone</span>
                <input className="ops-input" value={editForm.defaultTimezone} onChange={(event) => setEditForm((current) => ({ ...current, defaultTimezone: event.target.value }))} />
              </label>
              <button type="submit" className="ops-button-primary" disabled={busy}>
                <Save className="h-4 w-4" />
                <span>{busy ? 'Saving...' : 'Save tenant'}</span>
              </button>
            </form>
          </Panel>
        </div>
      )}
    </div>
  );
}

function TenantSetup({ data, reload, user }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', ownerEmail: '', industry: '', businessNiche: '', defaultTimezone: 'America/Toronto' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.ownerEmail.trim()) {
      setMessage('Owner email is required to create a claimable tenant account.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const result = await createAssistedTenant(user, form);
      setMessage(`Assisted setup started for ${result.tenant.name}. ${form.ownerEmail.trim()} can claim this account on login.`);
      setForm({ name: '', ownerEmail: '', industry: '', businessNiche: '', defaultTimezone: 'America/Toronto' });
      await reload();
      router.push(`/onboarding?mode=super_admin_assisted&tenantId=${encodeURIComponent(result.tenant.id)}`);
    } catch (error) {
      setMessage(error.message || 'Failed to create tenant');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <Panel title="Create Tenant" icon={UserCog}>
        <form onSubmit={handleSubmit} className="space-y-3">
          {message && <div className="rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-text-secondary">{message}</div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-text-secondary">Company name</span>
              <input className="ops-input" required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-text-secondary">Owner email</span>
              <input className="ops-input" required type="email" value={form.ownerEmail} onChange={(event) => setForm((current) => ({ ...current, ownerEmail: event.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-text-secondary">Industry</span>
              <input className="ops-input" value={form.industry} onChange={(event) => setForm((current) => ({ ...current, industry: event.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-text-secondary">Business niche</span>
              <select className="ops-select" value={form.businessNiche} onChange={(event) => setForm((current) => ({ ...current, businessNiche: event.target.value }))}>
                <option value="">No niche selected</option>
                {data.businessNiches.filter((niche) => niche.status === 'active').map((niche) => (
                  <option key={niche.key} value={niche.key}>{niche.name}</option>
                ))}
              </select>
            </label>
          </div>
          <button type="submit" className="ops-button-primary" disabled={busy}>
            <Plus className="h-4 w-4" />
            <span>Start Assisted Setup</span>
          </button>
        </form>
      </Panel>
      <Panel title="Active Setup Sessions" icon={Clock}>
        <SimpleTable
          emptyText="No assisted setup sessions yet."
          rows={data.setupSessions}
          columns={[
            { key: 'tenantId', label: 'Tenant', render: (row) => data.tenants.find((tenant) => tenant.id === row.tenantId)?.name || 'Tenant' },
            { key: 'currentStep', label: 'Step' },
            { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} tone={statusTone(row.status)} /> },
            { key: 'updatedAt', label: 'Updated', render: (row) => formatDate(row.updatedAt) },
          ]}
        />
      </Panel>
    </div>
  );
}

function KnowledgeLibrary({ data, reload, user }) {
  const [nicheForm, setNicheForm] = useState({ name: '', key: '', description: '', defaultPlaybookNotes: '' });
  const [docForm, setDocForm] = useState({ scope: 'global', nicheKey: '', title: '', sourceType: 'text', sourceUrl: '', bodyText: '' });
  const [docFiles, setDocFiles] = useState([]);
  const [assignmentForm, setAssignmentForm] = useState({ tenantId: '', platformKnowledgeDocumentId: '', assignmentSource: 'super_admin_override' });
  const [message, setMessage] = useState('');
  const [busyAction, setBusyAction] = useState('');

  const saveNiche = async (event) => {
    event.preventDefault();
    await upsertBusinessNiche(user, nicheForm);
    setNicheForm({ name: '', key: '', description: '', defaultPlaybookNotes: '' });
    setMessage('Niche saved.');
    await reload();
  };

  const saveDocument = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusyAction('document');
    try {
      if (docForm.sourceType === 'file') {
        if (!docFiles.length) throw new Error('Choose at least one file to upload');
        await Promise.all(docFiles.map((file) => uploadPlatformKnowledgeFile(user, file, {
          ...docForm,
          title: docFiles.length === 1 ? docForm.title : titleFromFileName(file.name),
        })));
      } else {
        await createPlatformKnowledgeDocument(user, docForm);
      }
      setDocForm({ scope: 'global', nicheKey: '', title: '', sourceType: 'text', sourceUrl: '', bodyText: '' });
      setDocFiles([]);
      formElement.reset();
      setMessage(docForm.sourceType === 'file'
        ? `${docFiles.length} shared ${pluralize(docFiles.length, 'document')} uploaded.`
        : 'Shared knowledge document saved.');
      await reload();
    } catch (error) {
      setMessage(error.message || 'Failed to save shared knowledge document.');
    } finally {
      setBusyAction('');
    }
  };

  const handleDocumentFileChange = (event) => {
    const nextFiles = Array.from(event.target.files || []);
    setDocFiles(nextFiles);
    if (!nextFiles.length) return;
    setDocForm((current) => ({
      ...current,
      title: current.title?.trim() || (nextFiles.length > 1 ? current.title : titleFromFileName(nextFiles[0].name)),
    }));
  };

  const saveAssignment = async (event) => {
    event.preventDefault();
    await upsertTenantKnowledgeAssignment(user, assignmentForm);
    setAssignmentForm({ tenantId: '', platformKnowledgeDocumentId: '', assignmentSource: 'super_admin_override' });
    setMessage('Shared knowledge assigned.');
    await reload();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-warning bg-warning-soft px-4 py-3 text-sm text-warning">
        Tenant-private knowledge base content is intentionally hidden from super admin. This page manages only global and niche playbooks.
      </div>
      {message && <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-secondary">{message}</div>}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Panel title="Business Niche" icon={Briefcase}>
          <form onSubmit={saveNiche} className="space-y-3">
            <input className="ops-input" placeholder="Niche name" value={nicheForm.name} onChange={(event) => setNicheForm((current) => ({ ...current, name: event.target.value }))} />
            <input className="ops-input" placeholder="niche-key" value={nicheForm.key} onChange={(event) => setNicheForm((current) => ({ ...current, key: event.target.value }))} />
            <textarea className="ops-input h-20 py-2" placeholder="Default playbook notes" value={nicheForm.defaultPlaybookNotes} onChange={(event) => setNicheForm((current) => ({ ...current, defaultPlaybookNotes: event.target.value }))} />
            <button type="submit" className="ops-button-primary">Save Niche</button>
          </form>
        </Panel>
        <Panel title="Global / Niche Document" icon={UploadCloud}>
          <form onSubmit={saveDocument} className="space-y-3">
            <select className="ops-select" value={docForm.scope} onChange={(event) => setDocForm((current) => ({ ...current, scope: event.target.value, nicheKey: event.target.value === 'global' ? '' : current.nicheKey }))}>
              <option value="global">Global</option>
              <option value="niche">Niche</option>
            </select>
            <select className="ops-select" value={docForm.nicheKey} disabled={docForm.scope === 'global'} onChange={(event) => setDocForm((current) => ({ ...current, nicheKey: event.target.value }))}>
              <option value="">Select niche</option>
              {data.businessNiches.map((niche) => <option key={niche.key} value={niche.key}>{niche.name}</option>)}
            </select>
            <input className="ops-input" placeholder="Document title" value={docForm.title} onChange={(event) => setDocForm((current) => ({ ...current, title: event.target.value }))} />
            <select className="ops-select" value={docForm.sourceType} onChange={(event) => setDocForm((current) => ({ ...current, sourceType: event.target.value, sourceUrl: '', bodyText: '' }))}>
              <option value="text">Text</option>
              <option value="url">URL</option>
              <option value="file">File upload</option>
            </select>
            {docForm.sourceType === 'url' && (
              <input className="ops-input" placeholder="https://example.com/playbook" value={docForm.sourceUrl} onChange={(event) => setDocForm((current) => ({ ...current, sourceUrl: event.target.value }))} />
            )}
            {docForm.sourceType === 'file' && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-text-secondary">Upload document</span>
                <input
                  className="ops-input py-2"
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.txt,.md,.csv,application/pdf,text/plain,text/markdown,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleDocumentFileChange}
                />
                {docFiles.length > 0 && (
                  <span className="mt-1 block text-xs text-text-muted">
                    {docFiles.length === 1 ? docFiles[0].name : `${docFiles.length} files selected`}
                  </span>
                )}
              </label>
            )}
            {docForm.sourceType === 'text' && (
              <textarea className="ops-input h-24 py-2" placeholder="Document text" value={docForm.bodyText} onChange={(event) => setDocForm((current) => ({ ...current, bodyText: event.target.value }))} />
            )}
            <button type="submit" className="ops-button-primary" disabled={busyAction === 'document'}>
              <UploadCloud className="h-4 w-4" />
              <span>{busyAction === 'document' ? 'Saving...' : 'Add Document'}</span>
            </button>
          </form>
        </Panel>
        <Panel title="Assign Shared Knowledge" icon={Layers}>
          <form onSubmit={saveAssignment} className="space-y-3">
            <select className="ops-select" value={assignmentForm.tenantId} onChange={(event) => setAssignmentForm((current) => ({ ...current, tenantId: event.target.value }))}>
              <option value="">Select tenant</option>
              {data.tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
            </select>
            <select className="ops-select" value={assignmentForm.platformKnowledgeDocumentId} onChange={(event) => setAssignmentForm((current) => ({ ...current, platformKnowledgeDocumentId: event.target.value }))}>
              <option value="">Select shared document</option>
              {data.platformKnowledgeDocuments.filter((document) => document.status !== 'archived').map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}
            </select>
            <button type="submit" className="ops-button-primary">Assign</button>
          </form>
        </Panel>
      </div>
      <Panel title="Platform Knowledge Documents" icon={BookOpen}>
        <SimpleTable
          emptyText="No global or niche knowledge documents yet."
          rows={data.platformKnowledgeDocuments}
          columns={[
            { key: 'title', label: 'Title', render: (row) => <span className="font-medium text-text-primary">{row.title}</span> },
            { key: 'scope', label: 'Scope', render: (row) => <StatusBadge value={row.scope} tone={row.scope === 'global' ? 'accent' : 'warning'} /> },
            { key: 'nicheKey', label: 'Niche', render: (row) => row.nicheKey || 'All' },
            { key: 'sourceType', label: 'Source', render: (row) => <div><p className="capitalize text-text-secondary">{row.sourceType}</p><p className="max-w-48 truncate text-xs text-text-muted">{row.metadata?.originalFileName || row.sourceUrl || row.storageKey || 'Inline text'}</p></div> },
            { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} tone={statusTone(row.status)} /> },
            { key: 'version', label: 'Version', render: (row) => `v${row.version || 1}` },
          ]}
        />
      </Panel>
    </div>
  );
}

function ProviderHealth({ data }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {data.providerHealth.map((provider) => (
        <Panel key={provider.provider} title={provider.provider} icon={HeartPulse}>
          <div className="space-y-4">
            <StatusBadge value={provider.status} tone={statusTone(provider.status)} />
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-surface-secondary p-3">
                <p className="text-xs text-text-muted">Healthy</p>
                <p className="mt-1 text-2xl font-semibold text-text-primary">{provider.healthy}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface-secondary p-3">
                <p className="text-xs text-text-muted">Attention</p>
                <p className="mt-1 text-2xl font-semibold text-text-primary">{provider.attention}</p>
              </div>
            </div>
          </div>
        </Panel>
      ))}
    </div>
  );
}

function UsageBilling({ data }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard label="Usage Events" value={data.usageEvents.length} icon={Activity} />
        <MetricCard label="Calls" value={data.voiceSessions.length} icon={Bot} tone="info" />
        <MetricCard label="Messages" value={data.messages.length} icon={BarChart3} tone="success" />
        <MetricCard label="Emails" value={data.emails.length} icon={BookOpen} tone="warning" />
      </div>
      <Panel title="Usage by Tenant" icon={Activity}>
        <SimpleTable
          emptyText="No usage is available yet."
          rows={data.usageByTenant}
          columns={[
            { key: 'tenantName', label: 'Tenant', render: (row) => <span className="font-medium text-text-primary">{row.tenantName}</span> },
            { key: 'usageEvents', label: 'Usage Events' },
            { key: 'calls', label: 'Calls' },
            { key: 'messages', label: 'Messages' },
            { key: 'emails', label: 'Emails' },
            { key: 'meetings', label: 'Bookings' },
          ]}
        />
      </Panel>
    </div>
  );
}

function AuditLogs({ data }) {
  const rows = data.auditLogs.length ? data.auditLogs : data.operationalAlerts;
  return (
    <Panel title="Platform Audit and Alerts" icon={ShieldCheck}>
      <SimpleTable
        emptyText="No audit logs or platform alerts are available yet."
        rows={rows}
        columns={[
          { key: 'event', label: 'Event', render: (row) => <span className="font-medium text-text-primary">{row.action || row.eventType || row.alertType || row.title || 'Platform event'}</span> },
          { key: 'tenantId', label: 'Tenant', render: (row) => data.tenants.find((tenant) => tenant.id === row.tenantId)?.name || 'Platform' },
          { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status || row.severity || 'info'} tone={statusTone(row.status || row.severity)} /> },
          { key: 'createdAt', label: 'Created', render: (row) => formatDate(row.createdAt) },
        ]}
      />
    </Panel>
  );
}

function Security({ data }) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <Panel title="Platform Admins" icon={Lock}>
        <SimpleTable
          emptyText="No platform admins are configured."
          rows={data.platformAdmins}
          columns={[
            { key: 'userId', label: 'User ID', render: (row) => <span className="font-medium text-text-primary">{row.userId}</span> },
            { key: 'role', label: 'Role', render: (row) => <StatusBadge value={row.role} tone="accent" /> },
            { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} tone={statusTone(row.status)} /> },
            { key: 'createdAt', label: 'Created', render: (row) => formatDate(row.createdAt) },
          ]}
        />
      </Panel>
      <Panel title="Isolation and Compliance" icon={ShieldCheck}>
        <div className="space-y-3">
          {[
            ['Tenant-private knowledge hidden', true],
            ['Platform admin table active', data.platformAdmins.some((admin) => admin.status === 'active')],
            ['Open operational alerts', data.counts.openAlerts === 0],
            ['Shared knowledge separated', true],
          ].map(([label, ok]) => (
            <div key={label} className="flex items-center justify-between rounded-lg border border-border bg-surface-secondary px-3 py-2">
              <span className="text-sm text-text-secondary">{label}</span>
              <StatusBadge value={ok ? 'OK' : 'Needs review'} tone={ok ? 'success' : 'warning'} />
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export default function SuperAdminPage({ page }) {
  const meta = PAGE_META[page] || PAGE_META.overview;
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (authLoading || !isAuthenticated) return;

    setLoading(true);
    setError('');
    try {
      setData(await getSuperAdminDashboardData());
    } catch (nextError) {
      console.error('Super admin dashboard data failed:', nextError);
      setError(nextError.message || 'Failed to load platform data');
    } finally {
      setLoading(false);
    }
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    reload();
  }, [reload]);

  const content = useMemo(() => {
    if (!data) return null;
    if (page === 'tenants') return <Tenants data={data} reload={reload} user={user} />;
    if (page === 'tenant-setup') return <TenantSetup data={data} reload={reload} user={user} />;
    if (page === 'knowledge-library') return <KnowledgeLibrary data={data} reload={reload} user={user} />;
    if (page === 'provider-health') return <ProviderHealth data={data} />;
    if (page === 'usage-billing') return <UsageBilling data={data} />;
    if (page === 'audit-logs') return <AuditLogs data={data} />;
    if (page === 'security') return <Security data={data} />;
    return <Overview data={data} />;
  }, [data, page, reload, user]);

  return (
    <>
      <Head>
        <title>{meta.title} - Super Admin</title>
      </Head>
      <SuperAdminShell title={meta.title} description={meta.description}>
        {error && (
          <div className="mb-6 rounded-lg border border-error bg-error-soft px-4 py-3 text-sm text-error">
            {error}
          </div>
        )}
        {loading ? (
          <div className="ops-panel p-8 text-center text-sm text-text-muted">Loading platform activity...</div>
        ) : content}
      </SuperAdminShell>
    </>
  );
}

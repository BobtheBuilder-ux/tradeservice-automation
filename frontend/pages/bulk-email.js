import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Bot,
  CalendarDays,
  CheckCircle2,
  FileText,
  Loader2,
  Mail,
  MessageSquare,
  Pause,
  Play,
  RotateCcw,
  Send,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import {
  listBulkEmailCampaigns,
  listBulkEmailFailedRecipients,
} from '../lib/insforge-product';
import {
  createBulkEmailCampaign,
  tickBulkEmailCampaign,
  pauseBulkEmailCampaign,
  resumeBulkEmailCampaign,
  cancelBulkEmailCampaign,
} from '../lib/insforge-functions';

const dashboardNav = [
  { label: 'Overview Dashboard', href: '/admin-dashboard', icon: BarChart3 },
  { label: 'Leads', href: '/admin-dashboard?tab=leads', icon: Users },
  { label: 'Appointments', href: '/admin-dashboard?tab=campaigns', icon: CalendarDays },
  { label: 'AI Agent', href: '/admin-dashboard?tab=bob', icon: Bot },
  { label: 'Bulk Email', href: '/bulk-email', icon: Mail },
  { label: 'Feedback', href: '/admin-dashboard?tab=feedback', icon: MessageSquare },
];

const mergeTags = [
  { label: 'Lead name', value: '{lead_name}' },
  { label: 'Sender name', value: '{sender_name}' },
];

const templates = [
  {
    id: 'consultation',
    name: 'Consultation invite',
    badge: 'Booking',
    subject: 'Quick consultation for {lead_name}',
    content: 'Thanks for showing interest. I wanted to follow up and help you choose the next best step.\n\nWe can review your request, answer questions, and confirm whether a consultation makes sense.',
    ctaLabel: 'Book a consultation',
    headerNote: 'A personal note from {sender_name}',
    signoff: 'Best,',
    signatureName: '{sender_name}',
  },
  {
    id: 'followup',
    name: 'Warm follow-up',
    badge: 'Followup',
    subject: 'Following up, {lead_name}',
    content: 'I wanted to check in while your request is still fresh.\n\nIf you are still interested, we can help you compare options and move forward when the timing is right.',
    ctaLabel: 'Reply with a good time',
    headerNote: 'A personal note from {sender_name}',
    signoff: 'Talk soon,',
    signatureName: '{sender_name}',
  },
  {
    id: 'reminder',
    name: 'Gentle reminder',
    badge: 'Nurture',
    subject: 'Still interested, {lead_name}?',
    content: 'Just a quick reminder that we are available if you still want help with this.\n\nNo pressure. Reply when convenient and we can pick up from where you left off.',
    ctaLabel: 'Continue the conversation',
    headerNote: 'A personal note from {sender_name}',
    signoff: 'Thanks,',
    signatureName: '{sender_name}',
  },
];

const statusTones = {
  completed: 'bg-success-soft text-success',
  sending: 'bg-info-soft text-info',
  queued: 'bg-info-soft text-info',
  paused: 'bg-warning-soft text-warning',
  failed: 'bg-error-soft text-error',
};

function applyToken(value, token) {
  return `${value || ''}${token}`;
}

function normalizeCsvHeader(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function parseCsvLine(row) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < row.length; index += 1) {
    const char = row[index];
    const nextChar = row[index + 1];
    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

function findHeaderIndex(headers, aliases) {
  return headers.findIndex((header) => aliases.includes(header));
}

function hasLeadNameToken(form) {
  return [
    form.subject,
    form.content,
    form.ctaLabel,
    form.headerNote,
    form.signoff,
    form.signatureName,
  ].some((value) => String(value || '').includes('{lead_name}'));
}

function compactName(...parts) {
  return parts.map((part) => String(part || '').trim()).filter(Boolean).join(' ');
}

function emptyFormFromTemplate(template = templates[0]) {
  return {
    name: '',
    subject: template.subject,
    templateId: template.id,
    content: template.content,
    ctaLabel: template.ctaLabel,
    headerNote: template.headerNote,
    ctaUrl: '',
    signoff: template.signoff,
    signatureName: template.signatureName,
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function applyPreviewTokens(value) {
  return String(value || '')
    .replace(/{lead_name}/g, 'Avery')
    .replace(/{leadName}/g, 'Avery')
    .replace(/{name}/g, 'Avery')
    .replace(/{sender_name}/g, 'SetMyMeet')
    .replace(/{sender_email}/g, 'hello@setmymeet.ca')
    .replace(/{company_name}/g, 'SetMyMeet');
}

function buildPlainText(form) {
  const parts = [
    `Hi {lead_name},`,
    form.content,
    form.ctaUrl ? `${form.ctaLabel}: ${form.ctaUrl}` : form.ctaLabel,
    `${form.signoff}\n${form.signatureName || '{sender_name}'}`,
  ];
  return parts.filter(Boolean).join('\n\n');
}

function buildEmailHtml(form) {
  const contentHtml = String(form.content || '')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 16px;color:#4b5565;font-size:15px;line-height:24px;">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const cta = form.ctaUrl
    ? `<a href="${escapeHtml(form.ctaUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;padding:12px 18px;font-size:14px;font-weight:700;">${escapeHtml(form.ctaLabel)}</a>`
    : `<span style="display:inline-block;background:#dbeafe;color:#1d4ed8;border-radius:999px;padding:8px 12px;font-size:13px;font-weight:700;">${escapeHtml(form.ctaLabel)}</span>`;

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f6f7fb;padding:24px;font-family:Inter,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e3e8ef;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="background:#121926;padding:26px 30px;">
          <div style="color:#ffffff;font-size:20px;font-weight:800;line-height:26px;">${escapeHtml(form.subject)}</div>
          ${form.headerNote ? `<div style="color:#cdd5df;font-size:13px;line-height:20px;margin-top:6px;">${escapeHtml(form.headerNote)}</div>` : ''}
        </td>
      </tr>
      <tr>
        <td style="padding:30px;">
          <p style="margin:0 0 18px;color:#121926;font-size:16px;line-height:24px;font-weight:700;">Hi {lead_name},</p>
          ${contentHtml}
          <div style="margin:0 0 26px;">${cta}</div>
          <p style="margin:0;color:#4b5565;font-size:15px;line-height:24px;">${escapeHtml(form.signoff)}<br><strong style="color:#121926;">${escapeHtml(form.signatureName || '{sender_name}')}</strong></p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function reusableTemplateFromCampaign(campaign) {
  const saved = campaign?.metadata?.bulkEmailTemplate;
  if (saved && typeof saved === 'object') {
    return {
      name: campaign.name ? `${campaign.name} resend` : '',
      subject: saved.subject || campaign.subject || '',
      templateId: saved.templateId || templates[0].id,
      content: saved.content || '',
      ctaLabel: saved.ctaLabel || '',
      headerNote: saved.headerNote || '',
      ctaUrl: saved.ctaUrl || '',
      signoff: saved.signoff || '',
      signatureName: saved.signatureName || '{sender_name}',
    };
  }

  const parts = String(campaign?.bodyText || '')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const withoutGreeting = parts[0]?.toLowerCase().startsWith('hi ') ? parts.slice(1) : parts;
  const signatureBlock = withoutGreeting[withoutGreeting.length - 1] || '';
  const signatureLines = signatureBlock.split('\n').map((line) => line.trim()).filter(Boolean);
  const signoff = signatureLines.length > 1 ? signatureLines.slice(0, -1).join(' ') : templates[0].signoff;
  const signatureName = signatureLines.length > 1 ? signatureLines[signatureLines.length - 1] : campaign?.fromName || '{sender_name}';
  const ctaPart = withoutGreeting.length > 1 ? withoutGreeting[withoutGreeting.length - 2] : '';
  const ctaMatch = ctaPart?.match(/^(.+?):\s*(https?:\/\/\S+)$/);
  const headerNoteMatch = String(campaign?.bodyHtml || '').match(/margin-top:6px;">([^<]+)<\/div>/);
  const contentEnd = Math.max(
    withoutGreeting.length - (signatureLines.length ? 1 : 0) - (ctaPart ? 1 : 0),
    0
  );

  return {
    name: campaign?.name ? `${campaign.name} resend` : '',
    subject: campaign?.subject || templates[0].subject,
    templateId: templates[0].id,
    content: withoutGreeting.slice(0, contentEnd).join('\n\n') || campaign?.bodyText || templates[0].content,
    ctaLabel: ctaMatch?.[1] || ctaPart || templates[0].ctaLabel,
    headerNote: headerNoteMatch?.[1] || '',
    ctaUrl: ctaMatch?.[2] || '',
    signoff,
    signatureName,
  };
}

function Sidebar({ router }) {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-border bg-surface px-4 py-5 lg:flex lg:flex-col">
      <div className="mb-8 flex items-center gap-3 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <CalendarDays className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-text-primary">SetMyMeet</p>
          <p className="text-xs text-text-muted">Operations</p>
        </div>
      </div>
      <nav className="space-y-1">
        {dashboardNav.map((item) => {
          const Icon = item.icon;
          const active = item.href === '/bulk-email';
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => router.push(item.href)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-accent text-accent-foreground'
                  : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

export default function BulkEmailPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [failedRecipients, setFailedRecipients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [csvFile, setCsvFile] = useState(null);
  const [csvPreview, setCsvPreview] = useState([]);
  const [recipientsCount, setRecipientsCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [csvError, setCsvError] = useState('');
  const [cancelTarget, setCancelTarget] = useState(null);
  const tickIntervalRef = useRef(null);
  const [form, setForm] = useState(() => emptyFormFromTemplate());
  const [reusedCampaignId, setReusedCampaignId] = useState('');

  const activeCampaign = campaigns.find((campaign) => ['queued', 'sending'].includes(campaign.status));
  const hasActiveCampaign = Boolean(activeCampaign);
  const selectedTemplate = templates.find((template) => template.id === form.templateId) || templates[0];
  const reusableCampaigns = useMemo(
    () => campaigns.filter((campaign) => campaign.status === 'completed' || Number(campaign.sentCount || 0) > 0),
    [campaigns]
  );
  const bodyText = useMemo(() => buildPlainText(form), [form]);
  const bodyHtml = useMemo(() => buildEmailHtml(form), [form]);
  const previewHtml = useMemo(() => applyPreviewTokens(bodyHtml), [bodyHtml]);
  const sendingCount = campaigns.filter((campaign) => ['queued', 'sending'].includes(campaign.status)).length;
  const totalRecipients = campaigns.reduce((sum, campaign) => sum + Number(campaign.recipientCount || 0), 0);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const list = await listBulkEmailCampaigns(user);
      setCampaigns(list);
    } catch (err) {
      console.error('Failed to load campaigns:', err);
      setError('Could not load bulk email campaigns');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const triggerTick = useCallback(async (campaignId) => {
    try {
      await tickBulkEmailCampaign(campaignId);
      const list = await listBulkEmailCampaigns(user);
      setCampaigns(list);
    } catch (err) {
      console.error('Error ticking campaign:', err);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (user && user.role !== 'admin') {
      router.push('/login');
      return;
    }
    loadData();
  }, [authLoading, isAuthenticated, loadData, router, user]);

  useEffect(() => {
    if (['queued', 'sending'].includes(activeCampaign?.status)) {
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
      triggerTick(activeCampaign.id);
      tickIntervalRef.current = setInterval(() => triggerTick(activeCampaign.id), 5000);
    } else if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }

    return () => {
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    };
  }, [activeCampaign?.id, activeCampaign?.status, triggerTick]);

  const parseCsv = (text) => {
    setCsvError('');
    const rows = text.split('\n').map((row) => row.trim()).filter(Boolean);
    if (rows.length < 2) {
      setCsvError('CSV must include a header and at least one recipient.');
      return [];
    }
    const rawHeaders = parseCsvLine(rows[0]);
    const headers = rawHeaders.map(normalizeCsvHeader);
    const emailIndex = headers.indexOf('email');
    const nameIndex = findHeaderIndex(headers, [
      'name',
      'lead name',
      'lead full name',
      'full name',
      'fullname',
      'contact name',
      'customer name',
      'client name',
      'recipient name',
    ]);
    const firstNameIndex = findHeaderIndex(headers, ['first name', 'firstname', 'first']);
    const lastNameIndex = findHeaderIndex(headers, ['last name', 'lastname', 'last', 'surname']);
    if (emailIndex === -1) {
      setCsvError('CSV must contain an email column.');
      return [];
    }
    const parsed = rows.slice(1).map((row) => {
      const cols = parseCsvLine(row);
      const customFields = Object.fromEntries(
        headers.map((header, index) => [header.replace(/\s+/g, '_'), cols[index] || ''])
      );
      const leadName = compactName(
        nameIndex !== -1 ? cols[nameIndex] : '',
        nameIndex === -1 && firstNameIndex !== -1 ? cols[firstNameIndex] : '',
        nameIndex === -1 && lastNameIndex !== -1 ? cols[lastNameIndex] : ''
      );
      return {
        email: cols[emailIndex],
        name: leadName,
        customFields,
      };
    }).filter((recipient) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email || ''));
    if (hasLeadNameToken(form) && parsed.some((recipient) => !recipient.name)) {
      setCsvError('Each recipient must have a lead name column because this campaign uses {lead_name}. Accepted headers include name, lead name, full name, first name, and last name.');
      return [];
    }
    if (!parsed.length) setCsvError('No valid email addresses found.');
    return parsed;
  };

  const handleCsvChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    try {
      const parsed = parseCsv(await file.text());
      setCsvPreview(parsed.slice(0, 5));
      setRecipientsCount(parsed.length);
    } catch {
      setCsvError('Failed to read CSV file.');
    }
  };

  const handleTemplateChange = (templateId) => {
    const template = templates.find((item) => item.id === templateId) || templates[0];
    setForm((current) => ({
      ...current,
      templateId,
      subject: template.subject,
      content: template.content,
      ctaLabel: template.ctaLabel,
      headerNote: template.headerNote,
      signoff: template.signoff,
      signatureName: template.signatureName,
    }));
    setReusedCampaignId('');
  };

  const loadReusableCampaign = (campaign) => {
    if (!campaign || hasActiveCampaign || submitting) return;
    setForm(reusableTemplateFromCampaign(campaign));
    setReusedCampaignId(campaign.id);
    setCsvFile(null);
    setCsvPreview([]);
    setRecipientsCount(0);
    setCsvError('');
    setNotice(`Loaded "${campaign.name}" as a reusable campaign. Upload a new CSV batch to send it again.`);
    setError(null);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    if (hasActiveCampaign) return;
    if (!form.name || !form.subject || !form.content || !form.ctaLabel || !form.signatureName) {
      setError('Complete the campaign and template fields.');
      return;
    }
    if (!csvFile || recipientsCount === 0) {
      setError('Upload a valid recipient CSV.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setNotice('');
      const recipients = parseCsv(await csvFile.text());
      const result = await createBulkEmailCampaign(user, {
        name: form.name,
        subject: form.subject,
        bodyText,
        bodyHtml,
        metadata: {
          reusedFromCampaignId: reusedCampaignId || null,
          bulkEmailTemplate: {
            subject: form.subject,
            templateId: form.templateId,
            content: form.content,
            ctaLabel: form.ctaLabel,
            headerNote: form.headerNote,
            ctaUrl: form.ctaUrl,
            signoff: form.signoff,
            signatureName: form.signatureName,
          },
        },
        recipients,
      });
      if (result?.campaign?.id) {
        await tickBulkEmailCampaign(result.campaign.id);
      }
      setForm(emptyFormFromTemplate());
      setReusedCampaignId('');
      setCsvFile(null);
      setCsvPreview([]);
      setRecipientsCount(0);
      setNotice('Campaign started. Bulk email sending begins immediately.');
      await loadData();
    } catch (err) {
      setError(err?.message || 'Failed to create bulk campaign');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePause = async (campaignId) => {
    try {
      await pauseBulkEmailCampaign(campaignId);
      await loadData();
    } catch {
      setError('Failed to pause campaign');
    }
  };

  const handleResume = async (campaignId) => {
    try {
      await resumeBulkEmailCampaign(campaignId);
      await loadData();
    } catch (err) {
      setError(err?.message || 'Failed to resume campaign');
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    try {
      await cancelBulkEmailCampaign(cancelTarget.id);
      setCancelTarget(null);
      await loadData();
    } catch {
      setError('Failed to cancel campaign');
    }
  };

  const handleSelectCampaign = async (campaign) => {
    setSelectedCampaign(campaign);
    try {
      setFailedRecipients(await listBulkEmailFailedRecipients(user, campaign.id));
    } catch (err) {
      console.error('Failed to load recipients:', err);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-text-secondary">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <Head>
        <title>Bulk Email | SetMyMeet</title>
      </Head>
      <div className="flex min-h-screen">
        <Sidebar router={router} />
        <main className="min-w-0 flex-1">
          <header className="border-b border-border bg-surface">
            <div className="flex min-h-20 flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <button type="button" className="ops-button-secondary h-8 px-2 lg:hidden" onClick={() => router.push('/admin-dashboard')}>
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <h1 className="text-2xl font-semibold text-text-primary">Bulk Email</h1>
                </div>
                <p className="mt-1 text-sm text-text-muted">Create rate-limited outreach campaigns with branded delivery templates.</p>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:flex">
                {[
                  ['Campaigns', campaigns.length],
                  ['Sending', sendingCount],
                  ['Recipients', totalRecipients],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-border bg-surface-secondary px-3 py-2">
                    <p className="text-xs text-text-muted">{label}</p>
                    <p className="text-lg font-semibold text-text-primary">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </header>

          <div className="space-y-6 p-4 sm:p-6">
            {error ? (
              <div className="ops-panel border-error bg-error-soft px-4 py-3 text-sm font-medium text-error">
                <AlertCircle className="mr-2 inline h-4 w-4" />
                {error}
              </div>
            ) : null}
            {notice ? (
              <div className="ops-panel border-success bg-success-soft px-4 py-3 text-sm font-medium text-success">
                <CheckCircle2 className="mr-2 inline h-4 w-4" />
                {notice}
              </div>
            ) : null}

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
              <form className={`ops-panel p-4 ${hasActiveCampaign ? 'opacity-75' : ''}`} onSubmit={handleCreate}>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-text-primary">Campaign Builder</h2>
                    <p className="mt-1 text-sm text-text-muted">One active campaign can send at a time.</p>
                  </div>
                  <span className="ops-badge bg-accent-soft text-accent">{selectedTemplate.badge}</span>
                </div>

                {hasActiveCampaign ? (
                  <div className="mb-4 rounded-lg border border-info bg-info-soft px-3 py-2 text-sm text-info">
                    Active campaign: <span className="font-semibold">{activeCampaign.name}</span>
                  </div>
                ) : null}

                <div className="grid gap-4 lg:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase text-text-secondary">Campaign</span>
                    <input
                      className="ops-input"
                      value={form.name}
                      disabled={hasActiveCampaign || submitting}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                      placeholder="July consultation invite"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase text-text-secondary">Template</span>
                    <select
                      className="ops-select"
                      value={form.templateId}
                      disabled={hasActiveCampaign || submitting}
                      onChange={(event) => handleTemplateChange(event.target.value)}
                    >
                      {templates.map((template) => (
                        <option key={template.id} value={template.id}>{template.name}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_160px]">
                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase text-text-secondary">Use sent campaign</span>
                    <select
                      className="ops-select"
                      value={reusedCampaignId}
                      disabled={hasActiveCampaign || submitting || reusableCampaigns.length === 0}
                      onChange={(event) => {
                        const campaign = reusableCampaigns.find((item) => item.id === event.target.value);
                        if (campaign) loadReusableCampaign(campaign);
                        if (!event.target.value) {
                          setReusedCampaignId('');
                          setForm(emptyFormFromTemplate(selectedTemplate));
                        }
                      }}
                    >
                      <option value="">{reusableCampaigns.length ? 'Select a sent campaign' : 'No sent campaigns yet'}</option>
                      {reusableCampaigns.map((campaign) => (
                        <option key={campaign.id} value={campaign.id}>
                          {campaign.name} · {campaign.sentCount}/{campaign.recipientCount}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="ops-button-secondary self-end"
                    disabled={hasActiveCampaign || submitting}
                    onClick={() => {
                      setForm(emptyFormFromTemplate());
                      setReusedCampaignId('');
                      setCsvFile(null);
                      setCsvPreview([]);
                      setRecipientsCount(0);
                      setCsvError('');
                    }}
                  >
                    <FileText className="h-4 w-4" />
                    <span>New draft</span>
                  </button>
                </div>

                <div className="mt-4 space-y-3 rounded-lg border border-border bg-surface-secondary p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase text-text-secondary">Shortcuts</span>
                    {mergeTags.map((tag) => (
                      <button
                        key={tag.value}
                        type="button"
                        className="ops-button-secondary h-7 px-2 text-xs"
                        disabled={hasActiveCampaign || submitting}
                        onClick={() => setForm((current) => ({ ...current, subject: applyToken(current.subject, tag.value) }))}
                        title={`Add ${tag.value} to subject`}
                      >
                        {tag.label}
                      </button>
                    ))}
                  </div>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase text-text-secondary">Subject</span>
                    <input
                      className="ops-input"
                      value={form.subject}
                      disabled={hasActiveCampaign || submitting}
                      onChange={(event) => setForm({ ...form, subject: event.target.value })}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase text-text-secondary">Header note</span>
                    <input
                      className="ops-input"
                      value={form.headerNote}
                      disabled={hasActiveCampaign || submitting}
                      onChange={(event) => setForm({ ...form, headerNote: event.target.value })}
                      placeholder="A personal note from {sender_name}"
                    />
                  </label>
                </div>

                <div className="mt-4">
                  <div className="rounded-lg border border-border bg-surface overflow-hidden">
                    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-secondary px-3 py-2">
                      <span className="text-xs font-semibold uppercase text-text-secondary">Message editor</span>
                      {mergeTags.map((tag) => (
                        <button
                          key={tag.value}
                          type="button"
                          className="ops-button-secondary h-7 px-2 text-xs"
                          disabled={hasActiveCampaign || submitting}
                          onClick={() => setForm((current) => ({ ...current, content: applyToken(current.content, tag.value) }))}
                          title={`Add ${tag.value} to message`}
                        >
                          {tag.label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      className="min-h-36 w-full resize-y bg-surface px-3 py-3 text-sm leading-6 text-text-primary outline-none focus:ring-0"
                      value={form.content}
                      disabled={hasActiveCampaign || submitting}
                      onChange={(event) => setForm({ ...form, content: event.target.value })}
                    />
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase text-text-secondary">Button label</span>
                    <input
                      className="ops-input"
                      value={form.ctaLabel}
                      disabled={hasActiveCampaign || submitting}
                      onChange={(event) => setForm({ ...form, ctaLabel: event.target.value })}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase text-text-secondary">Button link</span>
                    <input
                      className="ops-input"
                      value={form.ctaUrl}
                      disabled={hasActiveCampaign || submitting}
                      onChange={(event) => setForm({ ...form, ctaUrl: event.target.value })}
                      placeholder="https://..."
                    />
                  </label>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase text-text-secondary">Signoff</span>
                    <input
                      className="ops-input"
                      value={form.signoff}
                      disabled={hasActiveCampaign || submitting}
                      onChange={(event) => setForm({ ...form, signoff: event.target.value })}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase text-text-secondary">Signature name</span>
                    <input
                      className="ops-input"
                      value={form.signatureName}
                      disabled={hasActiveCampaign || submitting}
                      onChange={(event) => setForm({ ...form, signatureName: event.target.value })}
                      placeholder="{sender_name}"
                    />
                  </label>
                </div>

                <div className="mt-4 flex justify-end">
                  <label className="w-full space-y-1 lg:w-[220px]">
                    <span className="text-xs font-semibold uppercase text-text-secondary">Recipients</span>
                    <input
                      id="csv-upload-input"
                      className="hidden"
                      type="file"
                      accept=".csv"
                      disabled={hasActiveCampaign || submitting}
                      onChange={handleCsvChange}
                    />
                    <span className="ops-button-secondary w-full cursor-pointer">
                      <Upload className="h-4 w-4" />
                      <span>{csvFile ? 'Replace CSV' : 'Upload CSV'}</span>
                    </span>
                  </label>
                </div>

                {csvError ? <p className="mt-2 text-sm font-medium text-error">{csvError}</p> : null}
                {csvFile ? (
                  <div className="mt-4 rounded-lg border border-border bg-surface p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-text-primary">{csvFile.name}</p>
                        <p className="text-xs text-text-muted">{recipientsCount} valid recipients</p>
                      </div>
                      <FileText className="h-5 w-5 text-text-muted" />
                    </div>
                    {csvPreview.length ? (
                      <div className="mt-3 divide-y divide-border text-xs">
                        {csvPreview.map((recipient) => (
                          <div key={recipient.email} className="flex justify-between gap-3 py-1">
                            <span className="font-medium text-text-primary">{recipient.name || 'Friend'}</span>
                            <span className="text-text-muted">{recipient.email}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={hasActiveCampaign || submitting || recipientsCount === 0}
                  className="ops-button-primary mt-5 w-full"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  <span>{submitting ? 'Creating campaign' : 'Queue designed campaign'}</span>
                </button>
              </form>

              <aside className="ops-panel overflow-hidden">
                <div className="border-b border-border bg-surface-secondary px-4 py-3">
                  <p className="text-sm font-semibold text-text-primary">Delivery Preview</p>
                  <p className="text-xs text-text-muted">Avery receives the sample version.</p>
                </div>
                <div className="bg-background p-4">
                  <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                </div>
              </aside>
            </section>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
              <div className="ops-panel overflow-hidden">
                <div className="border-b border-border px-4 py-3">
                  <h2 className="text-base font-semibold text-text-primary">Outbox Campaigns</h2>
                </div>
                {campaigns.length === 0 ? (
                  <div className="p-8 text-center text-sm text-text-muted">No bulk email campaigns yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-border bg-surface-secondary text-xs uppercase text-text-muted">
                        <tr>
                          <th className="px-4 py-3">Campaign</th>
                          <th className="px-4 py-3">Delivery</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {campaigns.map((campaign) => {
                          const progress = campaign.recipientCount ? Math.round((campaign.sentCount / campaign.recipientCount) * 100) : 0;
                          return (
                            <tr
                              key={campaign.id}
                              className={`cursor-pointer transition-colors hover:bg-surface-secondary ${selectedCampaign?.id === campaign.id ? 'bg-surface-secondary' : ''}`}
                              onClick={() => handleSelectCampaign(campaign)}
                            >
                              <td className="px-4 py-3">
                                <p className="font-semibold text-text-primary">{campaign.name}</p>
                                <p className="mt-0.5 max-w-sm truncate text-xs text-text-muted">{campaign.subject}</p>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-tertiary">
                                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(progress, 100)}%` }} />
                                  </div>
                                  <span className="text-xs font-medium text-text-secondary">{campaign.sentCount}/{campaign.recipientCount}</span>
                                </div>
                                <p className="mt-1 text-xs text-text-muted">{campaign.deliveredCount} delivered · {campaign.failedCount} failed</p>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`ops-badge ${statusTones[campaign.status] || 'bg-surface-secondary text-text-secondary'}`}>
                                  {campaign.status}
                                </span>
                              </td>
                              <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                                <div className="flex justify-end gap-1.5">
                                  {campaign.status === 'sending' ? (
                                    <button type="button" className="ops-button-secondary h-8 w-8 px-0 text-warning" title="Pause" onClick={() => handlePause(campaign.id)}>
                                      <Pause className="h-4 w-4" />
                                    </button>
                                  ) : null}
                                  {campaign.status === 'paused' ? (
                                    <button type="button" className="ops-button-secondary h-8 w-8 px-0 text-success" title="Resume" onClick={() => handleResume(campaign.id)}>
                                      <Play className="h-4 w-4" />
                                    </button>
                                  ) : null}
                                  {['queued', 'sending', 'paused'].includes(campaign.status) ? (
                                    <button type="button" className="ops-button-secondary h-8 w-8 px-0 text-error" title="Cancel" onClick={() => setCancelTarget(campaign)}>
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  ) : null}
                                  {campaign.status === 'completed' || Number(campaign.sentCount || 0) > 0 ? (
                                    <button
                                      type="button"
                                      className="ops-button-secondary h-8 w-8 px-0 text-accent"
                                      title="Reuse campaign"
                                      disabled={hasActiveCampaign || submitting}
                                      onClick={() => loadReusableCampaign(campaign)}
                                    >
                                      <RotateCcw className="h-4 w-4" />
                                    </button>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="ops-panel overflow-hidden">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div>
                    <h2 className="text-base font-semibold text-text-primary">Delivery Issues</h2>
                    <p className="text-xs text-text-muted">{selectedCampaign ? selectedCampaign.name : 'Select a campaign'}</p>
                  </div>
                  <span className="ops-badge bg-error-soft text-error">{failedRecipients.length} failed</span>
                </div>
                {!selectedCampaign ? (
                  <div className="p-8 text-center text-sm text-text-muted">Choose a campaign to inspect failures.</div>
                ) : failedRecipients.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-text-muted">
                    <CheckCircle2 className="h-6 w-6 text-success" />
                    <span>No failed or bounced recipients.</span>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {failedRecipients.map((recipient) => (
                      <div key={recipient.id} className="p-4">
                        <p className="font-semibold text-text-primary">{recipient.name || 'Friend'}</p>
                        <p className="text-xs text-text-muted">{recipient.email}</p>
                        <p className="mt-2 text-xs font-medium text-error">{recipient.errorMessage || 'Delivery rejected'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </main>
      </div>

      {cancelTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-primary/40 p-4">
          <div className="ops-panel max-w-md p-5">
            <h2 className="text-base font-semibold text-text-primary">Cancel campaign?</h2>
            <p className="mt-2 text-sm text-text-muted">Sending will stop permanently for {cancelTarget.name}.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="ops-button-secondary" onClick={() => setCancelTarget(null)}>Keep sending</button>
              <button type="button" className="ops-button-primary bg-error hover:bg-error" onClick={handleCancel}>Cancel campaign</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

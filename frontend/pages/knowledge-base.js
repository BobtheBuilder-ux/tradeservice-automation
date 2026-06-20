import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  BookOpen,
  Bot,
  FileText,
  Globe2,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import {
  createTenantKnowledgeDocument,
  deleteTenantKnowledgeDocument,
  listTenantAgents,
  listTenantKnowledgeDocuments,
  uploadTenantKnowledgeFile,
} from '../lib/insforge-product';

const emptyForm = {
  sourceType: 'text',
  title: '',
  tenantAgentId: '',
  sourceUrl: '',
  bodyText: '',
};

const statusTone = {
  ready: 'bg-success-soft text-success',
  uploaded: 'bg-info-soft text-info',
  processing: 'bg-warning-soft text-warning',
  failed: 'bg-error-soft text-error',
};

function pretty(value) {
  if (!value) return 'Not set';
  return String(value).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function StatusBadge({ value }) {
  const normalized = value || 'uploaded';
  return <span className={`ops-badge ${statusTone[normalized] || statusTone.uploaded}`}>{pretty(normalized)}</span>;
}

function SourceIcon({ sourceType }) {
  if (sourceType === 'url') return <Globe2 className="h-4 w-4 text-text-muted" aria-hidden="true" />;
  if (sourceType === 'file') return <FileText className="h-4 w-4 text-text-muted" aria-hidden="true" />;
  return <BookOpen className="h-4 w-4 text-text-muted" aria-hidden="true" />;
}

function formatDate(value) {
  if (!value) return 'Not synced yet';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatFileSize(value) {
  const size = Number(value || 0);
  if (!size) return null;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function KnowledgeBasePage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [agents, setAgents] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState(null);
  const [documentToDelete, setDocumentToDelete] = useState(null);

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
    fetchKnowledgeBase();
  }, [authLoading, isAuthenticated, user, router]);

  const agentById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
  const readyCount = documents.filter((document) => document.status === 'ready').length;
  const failedCount = documents.filter((document) => document.status === 'failed').length;

  async function fetchKnowledgeBase() {
    try {
      setLoading(true);
      setError(null);
      const [agentRows, documentRows] = await Promise.all([
        listTenantAgents(user),
        listTenantKnowledgeDocuments(user),
      ]);
      setAgents(agentRows || []);
      setDocuments(documentRows || []);
    } catch (err) {
      setError(err.message || 'Failed to load knowledge base');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    try {
      setSaving(true);
      setError(null);
      setNotice(null);

      if (form.sourceType === 'file') {
        await uploadTenantKnowledgeFile(user, file, {
          title: form.title,
          tenantAgentId: form.tenantAgentId || null,
        });
      } else {
        await createTenantKnowledgeDocument(user, {
          ...form,
          tenantAgentId: form.tenantAgentId || null,
        });
      }

      setForm(emptyForm);
      setFile(null);
      formElement.reset();
      setNotice('Knowledge document saved.');
      await fetchKnowledgeBase();
    } catch (err) {
      setError(err.message || 'Failed to save knowledge document');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(document) {
    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      await deleteTenantKnowledgeDocument(user, document);
      setDocumentToDelete(null);
      setNotice('Knowledge document deleted.');
      await fetchKnowledgeBase();
    } catch (err) {
      setError(err.message || 'Failed to delete knowledge document');
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || loading) {
    return (
      <>
        <Head>
          <title>Knowledge Base | Bob Automation</title>
        </Head>
        <main className="min-h-screen bg-background px-4 py-6 text-text-primary sm:px-6">
          <div className="mx-auto max-w-7xl">
            <div className="ops-panel p-4 text-sm text-text-secondary">Loading knowledge base...</div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Knowledge Base | Bob Automation</title>
      </Head>
      <main className="min-h-screen bg-background px-4 py-6 text-text-primary sm:px-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-text-muted">Tenant setup</p>
              <h1 className="text-2xl font-semibold text-text-primary">Knowledge Base</h1>
              <p className="mt-1 text-sm text-text-secondary">
                Add tenant-owned facts, FAQs, policies, and service details for assigned AI agents.
              </p>
            </div>
            <button type="button" className="ops-button-secondary" onClick={() => router.push('/admin-dashboard')}>
              Back to Dashboard
            </button>
          </div>

          {error ? <div className="ops-panel border-error bg-error-soft px-4 py-3 text-sm font-medium text-error">{error}</div> : null}
          {notice ? <div className="ops-panel border-success bg-success-soft px-4 py-3 text-sm font-medium text-success">{notice}</div> : null}

          <div className="grid gap-4 md:grid-cols-3">
            <section className="ops-panel p-4">
              <p className="text-xs font-medium text-text-muted">Documents</p>
              <p className="mt-2 text-3xl font-semibold text-text-primary">{documents.length}</p>
              <p className="mt-1 text-sm text-text-secondary">Tenant-owned sources uploaded or registered.</p>
            </section>
            <section className="ops-panel p-4">
              <p className="text-xs font-medium text-text-muted">Ready</p>
              <p className="mt-2 text-3xl font-semibold text-success">{readyCount}</p>
              <p className="mt-1 text-sm text-text-secondary">Sources synced and available for provider use.</p>
            </section>
            <section className="ops-panel p-4">
              <p className="text-xs font-medium text-text-muted">Needs attention</p>
              <p className="mt-2 text-3xl font-semibold text-error">{failedCount}</p>
              <p className="mt-1 text-sm text-text-secondary">Failed sync or validation states.</p>
            </section>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <section className="ops-panel">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <BookOpen className="h-4 w-4 text-text-muted" aria-hidden="true" />
                  <h2 className="truncate text-sm font-semibold text-text-primary">Tenant documents</h2>
                </div>
                <span className="ops-badge bg-info-soft text-info">{documents.length}</span>
              </div>

              {documents.length === 0 ? (
                <div className="p-6 text-sm text-text-secondary">
                  No knowledge documents yet. Add a text note, URL, or uploaded file to start preparing this tenant's AI context.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {documents.map((document) => {
                    const agent = agentById.get(document.tenantAgentId);
                    const size = formatFileSize(document.fileSize);
                    return (
                      <div key={document.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <SourceIcon sourceType={document.sourceType} />
                            <p className="truncate text-sm font-semibold text-text-primary">{document.title}</p>
                            <StatusBadge value={document.status} />
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                            <span>{pretty(document.sourceType)}</span>
                            {agent ? (
                              <span className="inline-flex items-center gap-1">
                                <Bot className="h-3 w-3" aria-hidden="true" />
                                {agent.displayName}
                              </span>
                            ) : (
                              <span>Shared tenant source</span>
                            )}
                            {size ? <span>{size}</span> : null}
                            <span>Updated {formatDate(document.updatedAt || document.createdAt)}</span>
                          </div>
                          {document.sourceUrl ? (
                            <p className="mt-2 truncate text-xs text-text-secondary">{document.sourceUrl}</p>
                          ) : null}
                          {document.errorMessage ? (
                            <p className="mt-2 text-xs font-medium text-error">{document.errorMessage}</p>
                          ) : null}
                          {document.elevenlabsDocumentId ? (
                            <p className="mt-2 text-xs text-text-muted">ElevenLabs document: {document.elevenlabsDocumentId}</p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="ops-button-secondary h-8 px-2"
                          disabled={saving}
                          onClick={() => setDocumentToDelete(document)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Delete
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="ops-panel">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Plus className="h-4 w-4 text-text-muted" aria-hidden="true" />
                  <h2 className="truncate text-sm font-semibold text-text-primary">Add source</h2>
                </div>
              </div>
              <form className="space-y-4 p-4" onSubmit={handleSubmit}>
                <div className="grid grid-cols-3 gap-2">
                  {['text', 'url', 'file'].map((sourceType) => (
                    <button
                      key={sourceType}
                      type="button"
                      className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                        form.sourceType === sourceType
                          ? 'border-accent bg-accent-soft text-accent'
                          : 'border-border bg-surface text-text-secondary'
                      }`}
                      onClick={() => setForm({ ...form, sourceType })}
                    >
                      {pretty(sourceType)}
                    </button>
                  ))}
                </div>

                <input
                  className="ops-input"
                  placeholder={form.sourceType === 'file' ? 'Display title, optional' : 'Document title'}
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                />

                <select
                  className="ops-select"
                  value={form.tenantAgentId}
                  onChange={(event) => setForm({ ...form, tenantAgentId: event.target.value })}
                >
                  <option value="">Shared tenant source</option>
                  {agents.filter((agent) => agent.status !== 'archived').map((agent) => (
                    <option key={agent.id} value={agent.id}>{agent.displayName}</option>
                  ))}
                </select>

                {form.sourceType === 'text' ? (
                  <textarea
                    className="min-h-40 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                    placeholder="Paste FAQs, service details, pricing guidance, policies, or objection handling notes."
                    value={form.bodyText}
                    onChange={(event) => setForm({ ...form, bodyText: event.target.value })}
                  />
                ) : null}

                {form.sourceType === 'url' ? (
                  <input
                    className="ops-input"
                    placeholder="https://example.com/services"
                    value={form.sourceUrl}
                    onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })}
                  />
                ) : null}

                {form.sourceType === 'file' ? (
                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface-secondary px-4 py-6 text-center text-sm text-text-secondary">
                    <Upload className="mb-2 h-5 w-5 text-text-muted" aria-hidden="true" />
                    <span className="font-medium text-text-primary">{file?.name || 'Choose a file'}</span>
                    <span className="mt-1 text-xs text-text-muted">Upload PDFs, docs, text files, or service sheets.</span>
                    <input
                      type="file"
                      className="sr-only"
                      onChange={(event) => setFile(event.target.files?.[0] || null)}
                    />
                  </label>
                ) : null}

                <button type="submit" className="ops-button-primary w-full" disabled={saving}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Save Source
                </button>
              </form>
            </section>
          </div>
        </div>
      </main>
      {documentToDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-primary/40 px-4 py-6">
          <div className="w-full max-w-md rounded-lg border border-border bg-surface shadow-lg">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-text-primary">Delete knowledge source?</h2>
              <p className="mt-1 text-sm text-text-secondary">
                This removes the source from this tenant knowledge base. Uploaded files are also removed from storage.
              </p>
            </div>
            <div className="space-y-3 p-4">
              <div className="rounded-lg border border-border bg-surface-secondary px-3 py-2">
                <p className="truncate text-sm font-medium text-text-primary">{documentToDelete.title}</p>
                <p className="mt-1 text-xs text-text-muted">{pretty(documentToDelete.sourceType)} source</p>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="ops-button-secondary"
                  disabled={saving}
                  onClick={() => setDocumentToDelete(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="ops-button-primary bg-error text-accent-foreground hover:bg-error"
                  disabled={saving}
                  onClick={() => handleDelete(documentToDelete)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Delete Source
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

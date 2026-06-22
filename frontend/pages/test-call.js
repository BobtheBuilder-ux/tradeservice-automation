import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { AlertCircle, CheckCircle2, PhoneCall, Send, ShieldCheck } from 'lucide-react';
import { invokeFunction } from '../lib/insforge-functions';
import { useAuth } from '../lib/auth';
import { getTenantOnboardingRedirect } from '../lib/insforge-product';

const initialForm = {
  to: '+14384838093',
  from: '+17372922494',
  url: 'http://demo.twilio.com/docs/voice.xml',
  callConsent: true,
};

export default function TestCall() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError('');
    setResult(null);
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

  const submitTestCall = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const data = await invokeFunction('bob-queue-actions', { action: 'test-call', body: form });
      setResult(data.call);
    } catch (err) {
      setError(err.message || 'Failed to start test call');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Twilio Test Call</title>
      </Head>

      <main className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-950">Twilio Test Call</h1>
              <p className="mt-1 text-sm text-gray-600">Create a single outbound call using the backend Twilio credentials.</p>
            </div>
            <div className="hidden items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 sm:flex">
              <ShieldCheck className="h-4 w-4" />
              Test mode
            </div>
          </div>

          <form onSubmit={submitTestCall} className="card">
            <div className="card-header flex items-center gap-2">
              <PhoneCall className="h-5 w-5 text-gray-800" />
              <h2 className="text-base font-semibold text-gray-950">Call details</h2>
            </div>

            <div className="card-body space-y-5">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">To</span>
                <input
                  className="form-input"
                  value={form.to}
                  onChange={(event) => updateField('to', event.target.value)}
                  placeholder="+14384838093"
                  inputMode="tel"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">From</span>
                <input
                  className="form-input"
                  value={form.from}
                  onChange={(event) => updateField('from', event.target.value)}
                  placeholder="+17372922494"
                  inputMode="tel"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">TwiML URL</span>
                <input
                  className="form-input"
                  value={form.url}
                  onChange={(event) => updateField('url', event.target.value)}
                  placeholder="http://demo.twilio.com/docs/voice.xml"
                  type="url"
                  required
                />
              </label>

              <label className="flex items-start gap-3 rounded-md border border-border bg-surface-secondary px-3 py-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  className="mt-1 rounded border-border text-accent focus:ring-accent"
                  checked={form.callConsent}
                  onChange={(event) => updateField('callConsent', event.target.checked)}
                />
                <span>I have consent to place this test call.</span>
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
                    Call queued
                  </div>
                  <dl className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <dt className="text-green-700">Call SID</dt>
                      <dd className="break-all font-mono text-xs">{result.sid}</dd>
                    </div>
                    <div>
                      <dt className="text-green-700">Status</dt>
                      <dd>{result.status}</dd>
                    </div>
                    <div>
                      <dt className="text-green-700">From</dt>
                      <dd>{result.from}</dd>
                    </div>
                    <div>
                      <dt className="text-green-700">To</dt>
                      <dd>{result.to}</dd>
                    </div>
                  </dl>
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-gray-200 px-6 py-4">
              <button type="submit" className="btn-primary inline-flex items-center gap-2" disabled={loading}>
                <Send className="h-4 w-4" />
                {loading ? 'Starting call...' : 'Start test call'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </>
  );
}

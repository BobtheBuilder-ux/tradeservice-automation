import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { CheckCircle, Loader, XCircle } from 'lucide-react';

function getReturnPath(target) {
  if (target === 'onboarding') return '/onboarding';
  if (target === 'settings') return '/settings/company';
  return '/admin-dashboard';
}

export default function IntegrationCallback() {
  const router = useRouter();
  const [status, setStatus] = useState('processing');
  const [message, setMessage] = useState('Completing integration connection...');
  const [provider, setProvider] = useState('integration');
  const [target, setTarget] = useState('dashboard');

  const title = useMemo(() => {
    const name = provider === 'calendly' ? 'Calendly' : provider;
    return `${name} Integration`;
  }, [provider]);

  useEffect(() => {
    if (!router.isReady || typeof window === 'undefined') return undefined;

    const providerParam = String(router.query.platform || router.query.provider || 'integration');
    const targetParam = String(router.query.target || 'dashboard');
    const errorParam = router.query.error ? String(router.query.error) : '';
    if (router.query.status === 'processing') {
      setProvider(providerParam);
      setTarget(targetParam);
      setStatus('processing');
      setMessage('Waiting for approval...');
      return undefined;
    }
    const connected = router.query.connected || router.query.status === 'connected';
    const nextStatus = errorParam ? 'error' : connected ? 'success' : 'error';
    const payload = {
      provider: providerParam,
      target: targetParam,
      status: nextStatus === 'success' ? 'connected' : 'error',
      error: errorParam,
      at: Date.now(),
    };

    setProvider(providerParam);
    setTarget(targetParam);
    setStatus(nextStatus);
    setMessage(nextStatus === 'success'
      ? `${providerParam === 'calendly' ? 'Calendly' : providerParam} connected.`
      : errorParam || 'Integration connection was not completed.');

    try {
      window.localStorage.setItem('bob:integration-connected', JSON.stringify(payload));
      if ('BroadcastChannel' in window) {
        const channel = new BroadcastChannel('bob-integrations');
        channel.postMessage(payload);
        channel.close();
      }
    } catch {
      // The return button still gets the user back to the correct page.
    }

    const closeTimer = window.setTimeout(() => {
      window.close();
    }, 1200);

    return () => window.clearTimeout(closeTimer);
  }, [router.isReady, router.query]);

  const Icon = status === 'success' ? CheckCircle : status === 'error' ? XCircle : Loader;
  const toneClass = status === 'success'
    ? 'bg-success-soft text-success'
    : status === 'error'
      ? 'bg-error-soft text-error'
      : 'bg-info-soft text-info';

  return (
    <>
      <Head>
        <title>{title} - Bob Automation</title>
        <meta name="description" content="Integration connection status" />
      </Head>

      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8 text-text-primary">
        <section className="ops-panel w-full max-w-md p-6 text-center">
          <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${toneClass}`}>
            <Icon className={`h-7 w-7 ${status === 'processing' ? 'animate-spin' : ''}`} aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-xl font-semibold capitalize text-text-primary">{title}</h1>
          <p className="mt-2 text-sm text-text-secondary">{message}</p>
          <p className="mt-1 text-xs text-text-muted">You can return to the setup page now.</p>
          <button type="button" className="ops-button-primary mt-5" onClick={() => router.push(getReturnPath(target))}>
            Return
          </button>
        </section>
      </main>
    </>
  );
}

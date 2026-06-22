import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useAuth } from '../lib/auth';
import { getCurrentPlatformAdminProfile, getTenantOnboardingRedirect } from '../lib/insforge-product';

export default function HomeRedirect() {
  const router = useRouter();
  const { loading, isAuthenticated, user } = useAuth();

  useEffect(() => {
    let cancelled = false;

    async function routeHome() {
      if (loading) return;
      if (!isAuthenticated) {
        router.replace('/login');
        return;
      }

      try {
        const profile = await getCurrentPlatformAdminProfile();
        if (cancelled) return;
        if (profile?.isPlatformAdmin) {
          router.replace('/overview');
          return;
        }
        router.replace(await getTenantOnboardingRedirect(user));
      } catch (profileError) {
        console.error('Platform admin home redirect check failed:', profileError);
        if (!cancelled) router.replace(await getTenantOnboardingRedirect(user));
      }
    }

    routeHome();
    return () => {
      cancelled = true;
    };
  }, [loading, isAuthenticated, user, router]);

  return (
    <>
      <Head>
        <title>Lead Management</title>
      </Head>
      <div className="min-h-screen bg-background flex items-center justify-center text-text-secondary">
        Loading...
      </div>
    </>
  );
}

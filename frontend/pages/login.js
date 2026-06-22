import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { authManager, useAuth } from '../lib/auth';
import { getCurrentPlatformAdminProfile, getTenantOnboardingRedirect } from '../lib/insforge-product';

export default function Login() {
  const router = useRouter();
  const { user, isAuthenticated, error: authError, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function routeAuthenticatedUser() {
      if (authLoading) return;

      if (!isAuthenticated || !user) return;

      try {
        const profile = await getCurrentPlatformAdminProfile();
        if (cancelled) return;
        if (profile?.isPlatformAdmin) {
          router.push('/overview');
          return;
        }
        router.push(await getTenantOnboardingRedirect(user));
      } catch (profileError) {
        console.error('Platform admin redirect check failed:', profileError);
        if (!cancelled) router.push(await getTenantOnboardingRedirect(user));
      }
    }

    routeAuthenticatedUser();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, user, router]);

  useEffect(() => {
    if (!authError) return;
    setError(authError);
  }, [authError]);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');

    const result = await authManager.signInWithGoogle();
    if (result.error) {
      setError(result.error.message || 'Google sign-in failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Login - 9QC Lead Management</title>
        <meta name="description" content="Sign in to the 9QC lead management dashboard" />
      </Head>
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">9QC Lead Management</h1>
            <h2 className="text-xl text-gray-600">Sign in with Google</h2>
            <p className="mt-3 text-sm text-gray-500">
              New users sign in with Google and receive admin dashboard access.
            </p>
          </div>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            {error && (
              <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading || authLoading}
              className="w-full flex justify-center items-center py-3 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out"
            >
              {loading || authLoading ? 'Redirecting to Google...' : 'Continue with Google'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useAuth } from '../lib/auth';

export default function HomeRedirect() {
  const router = useRouter();
  const { loading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (loading) return;
    router.replace(isAuthenticated ? '/admin-dashboard' : '/login');
  }, [loading, isAuthenticated, router]);

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

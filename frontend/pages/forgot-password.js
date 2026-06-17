import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function ForgotPassword() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/login');
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md bg-white rounded-lg shadow p-6 text-center">
        <h1 className="text-xl font-bold text-gray-900">Password login removed</h1>
        <p className="mt-3 text-gray-600">
          Password resets are no longer used. Please sign in with your approved Google account.
        </p>
      </div>
    </div>
  );
}

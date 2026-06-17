import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function ResetPassword() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/login');
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md bg-white rounded-lg shadow p-6 text-center">
        <h1 className="text-xl font-bold text-gray-900">Password login removed</h1>
        <p className="mt-3 text-gray-600">
          Password reset links are disabled because the portal now uses InsForge Google OAuth.
        </p>
      </div>
    </div>
  );
}

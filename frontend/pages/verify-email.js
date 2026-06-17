import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function VerifyEmail() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/login');
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md bg-white rounded-lg shadow p-6 text-center">
        <h1 className="text-xl font-bold text-gray-900">Google verification enabled</h1>
        <p className="mt-3 text-gray-600">
          Email verification is handled by Google and InsForge. Please continue with Google sign-in.
        </p>
      </div>
    </div>
  );
}

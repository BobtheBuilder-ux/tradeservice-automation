import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Register() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/login');
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md bg-white rounded-lg shadow p-6 text-center">
        <h1 className="text-xl font-bold text-gray-900">Google sign-in is now required</h1>
        <p className="mt-3 text-gray-600">
          Public registration has been disabled. Admins create portal users, and users sign in with their approved Google account.
        </p>
      </div>
    </div>
  );
}

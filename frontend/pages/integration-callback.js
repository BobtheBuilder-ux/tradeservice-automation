import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { CheckCircle, XCircle, Loader } from 'lucide-react';

export default function IntegrationCallback() {
  const router = useRouter();
  const [status, setStatus] = useState('processing'); // processing, success, error
  const [message, setMessage] = useState('Processing integration...');
  const [platform, setPlatform] = useState('');

  useEffect(() => {
    const handleCallback = async () => {
      const { platform: platformParam, connected, error } = router.query;
      
      if (!router.isReady) return;
      
      setPlatform(platformParam || 'integration');
      
      if (error) {
        setStatus('error');
        setMessage(`Integration failed: ${error}`);
        return;
      }
      
      if (connected) {
        setStatus('success');
        setMessage(`${platformParam} integration successful!`);
        
        // Redirect back to dashboard after 2 seconds
        setTimeout(() => {
          router.push('/agent-dashboard');
        }, 2000);
        return;
      }
      
      // If no connected parameter, show error
      setStatus('error');
      setMessage('Integration status unknown');
    };
    
    handleCallback();
  }, [router.isReady, router.query]);

  const getIcon = () => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-16 h-16 text-green-500" />;
      case 'error':
        return <XCircle className="w-16 h-16 text-red-500" />;
      default:
        return <Loader className="w-16 h-16 text-blue-500 animate-spin" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'success':
        return 'from-green-50 to-emerald-50 border-green-200';
      case 'error':
        return 'from-red-50 to-pink-50 border-red-200';
      default:
        return 'from-blue-50 to-indigo-50 border-blue-200';
    }
  };

  return (
    <>
      <Head>
        <title>Integration Callback - {platform}</title>
        <meta name="description" content="Processing integration callback" />
      </Head>
      
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-pink-50 flex items-center justify-center">
        <div className={`max-w-md w-full mx-4 bg-gradient-to-br ${getStatusColor()} rounded-xl shadow-xl p-8 border-2`}>
          <div className="text-center">
            <div className="flex justify-center mb-6">
              {getIcon()}
            </div>
            
            <h1 className="text-2xl font-bold text-gray-800 mb-4 capitalize">
              {platform} Integration
            </h1>
            
            <p className="text-gray-600 mb-6">
              {message}
            </p>
            
            {status === 'success' && (
              <p className="text-sm text-green-600 font-medium">
                Redirecting to dashboard...
              </p>
            )}
            
            {status === 'error' && (
              <button
                onClick={() => router.push('/agent-dashboard')}
                className="bg-gradient-to-r from-orange-600 to-red-600 text-white px-6 py-2 rounded-lg hover:from-orange-700 hover:to-red-700 transition-all duration-200 font-medium"
              >
                Return to Dashboard
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
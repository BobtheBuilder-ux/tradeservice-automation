/** @type {import('next').NextConfig} */
function getBackendUrl() {
  const rawUrl = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || '';
  const backendUrl = rawUrl.trim().replace(/\/$/, '');

  if (!backendUrl || backendUrl === 'undefined' || backendUrl === 'null') {
    return null;
  }

  if (backendUrl.startsWith('http://') || backendUrl.startsWith('https://')) {
    return backendUrl;
  }

  throw new Error(
    'NEXT_PUBLIC_API_URL must start with http:// or https:// when configured. ' +
    `Received: ${backendUrl}`
  );
}

const nextConfig = {
  reactStrictMode: true,
  // Reduce compilation frequency
  onDemandEntries: {
    // Period (in ms) where the server will keep pages in the buffer
    maxInactiveAge: 25 * 1000,
    // Number of pages that should be kept simultaneously without being disposed
    pagesBufferLength: 2,
  },
  async rewrites() {
    const backendUrl = getBackendUrl();

    if (!backendUrl) {
      return [];
    }

    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: '/webhook/:path*',
        destination: `${backendUrl}/webhook/:path*`,
      },
    ];
  },
}

module.exports = nextConfig

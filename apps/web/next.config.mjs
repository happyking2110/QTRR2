const apiBaseUrl = process.env.API_BASE_URL;
if (!apiBaseUrl) {
  throw new Error('Thiếu biến môi trường API_BASE_URL');
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiBaseUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

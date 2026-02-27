/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone', // Required for Electron packaging
  experimental: {
    serverComponentsExternalPackages: ['@anthropic-ai/sdk', '@modelcontextprotocol/sdk', 'jsonwebtoken'],
  },
  // Electron: disable image optimization (no external server)
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;

const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone', // Required for Electron packaging
  serverExternalPackages: ['@anthropic-ai/sdk', '@modelcontextprotocol/sdk', 'jsonwebtoken'],
  turbopack: {
    root: path.resolve(__dirname),
    ignoreIssue: [
      {
        path: /next\.config\.js$/,
        title: 'Encountered unexpected file in NFT list',
        description: /whole project was traced unintentionally/,
      },
    ],
  },
  // Electron: disable image optimization (no external server)
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;

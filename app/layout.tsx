import type { Metadata, Viewport } from 'next';
import { ThemeProvider } from '@/components/ThemeProvider';
import 'katex/dist/katex.min.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'ChainMind — Multi-agent discussion workspace',
  description: 'A local-first workspace for AI collaboration, multi-agent discussions, and human-guided decisions.',
  keywords: ['ChainMind', 'AI Chain', 'IDE', '提示词工程', 'MCP', 'Claude', 'GPT', 'AI协作'],
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
  },
};

export const viewport: Viewport = { themeColor: '#10231e' };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/ThemeProvider';
import 'katex/dist/katex.min.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'ChainMind — Multi-agent discussion workspace',
  description: 'ChainMind — 内置多AI轮次完善、任务分配、并行处理的链式提示词工程IDE',
  keywords: ['ChainMind', 'AI Chain', 'IDE', '提示词工程', 'MCP', 'Claude', 'GPT', 'AI协作'],
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-touch-icon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#ff6b57" />
      </head>
      <body className="antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

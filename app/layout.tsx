import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ChainMind - AI 链式讨论平台',
  description: '可视化编排多AI模型协作流水线，让AI像团队一样思考',
  keywords: ['AI', '链式讨论', 'DAG', '流水线', 'Claude', 'GPT', 'Gemini'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}

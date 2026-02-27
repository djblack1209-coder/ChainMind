"use client";

// ChainMind Landing Page — Product entry point with branding
// In Electron mode, auto-redirects to /workspace

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const FEATURES = [
  {
    icon: '🔗',
    title: '可视化 DAG 编排',
    desc: '拖拽连线构建多模型协作流水线，自动拓扑排序与并行执行',
  },
  {
    icon: '🤖',
    title: '多模型统一接入',
    desc: '一站式接入 Claude、GPT-4o、Gemini，自由混合搭配',
  },
  {
    icon: '🔒',
    title: '军事级加密',
    desc: 'AES-256-GCM 本地加密存储，密钥永不离开浏览器',
  },
  {
    icon: '⚡',
    title: '实时流式输出',
    desc: 'SSE 流式传输，逐字呈现 AI 思考过程与推理链',
  },
  {
    icon: '🧠',
    title: '三级记忆架构',
    desc: '短期/中期/长期上下文管理，智能摘要与 Token 预算控制',
  },
  {
    icon: '✨',
    title: '元提示优化',
    desc: '内置提示词优化引擎，自动提升每个节点的输出质量',
  },
];

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    // Electron desktop mode: skip landing, go to login
    if (typeof window !== 'undefined' && window.electronAPI) {
      router.replace('/login');
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-[var(--bg-root)] overflow-x-hidden">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center text-white font-bold text-sm">
              C
            </div>
            <span className="text-lg font-bold text-[var(--text-primary)]">
              Chain<span className="gradient-text">Mind</span>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/workspace"
              className="btn btn-primary btn-lg"
            >
              开始使用
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 px-6">
        {/* Background effects */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px]" />
          <div className="absolute top-40 right-1/4 w-80 h-80 bg-cyan-500/10 rounded-full blur-[100px]" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-indigo-500/5 rounded-full blur-[80px]" />
        </div>

        <div className={`relative max-w-4xl mx-auto text-center ${mounted ? 'animate-slide-up' : 'opacity-0'}`}>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--brand-primary-light)] border border-[var(--border-primary)] text-sm text-indigo-300 mb-8">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            支持 Claude Opus 4 / GPT-4o / Gemini 2.0
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold leading-tight mb-6">
            <span className="text-[var(--text-primary)]">让 AI 像</span>
            <span className="gradient-text">团队</span>
            <span className="text-[var(--text-primary)]">一样</span>
            <br />
            <span className="gradient-text">协作思考</span>
          </h1>

          <p className="text-lg md:text-xl text-[var(--text-secondary)] max-w-2xl mx-auto mb-10 leading-relaxed">
            可视化编排多 AI 模型协作流水线。每个节点是一个独立的 AI 大脑，
            通过 DAG 有向图连接，上游输出自动注入下游，实现链式深度推理。
          </p>

          <div className="flex items-center justify-center gap-4">
            <Link
              href="/workspace"
              className="btn btn-primary btn-lg text-base px-10 py-4 shadow-lg"
              style={{ boxShadow: '0 8px 32px rgba(99, 102, 241, 0.35)' }}
            >
              进入工作台
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Preview mockup */}
        <div className={`relative max-w-5xl mx-auto mt-16 ${mounted ? 'animate-fade-in' : 'opacity-0'}`} style={{ animationDelay: '0.3s', animationFillMode: 'both' }}>
          <div className="relative rounded-2xl overflow-hidden border border-[var(--border-primary)] shadow-2xl" style={{ boxShadow: '0 20px 80px rgba(99, 102, 241, 0.15)' }}>
            <div className="bg-[var(--bg-secondary)] px-4 py-3 flex items-center gap-2 border-b border-[var(--border-secondary)]">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
              </div>
              <div className="flex-1 text-center text-xs text-[var(--text-tertiary)]">ChainMind — 工作台</div>
            </div>
            <div className="bg-[var(--bg-primary)] p-8 min-h-[360px] flex items-center justify-center">
              {/* Animated DAG preview */}
              <div className="flex items-center gap-6">
                {['分析需求', '生成方案', '代码实现', '质量审查'].map((label, i) => (
                  <React.Fragment key={label}>
                    <div className={`animate-float px-5 py-3 rounded-xl border-2 text-sm font-medium ${
                      i === 0 ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300' :
                      i === 1 ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300' :
                      i === 2 ? 'border-green-500/50 bg-green-500/10 text-green-300' :
                      'border-amber-500/50 bg-amber-500/10 text-amber-300'
                    }`} style={{ animationDelay: `${i * 0.3}s` }}>
                      {label}
                    </div>
                    {i < 3 && (
                      <svg width="32" height="16" viewBox="0 0 32 16" className="text-[var(--text-tertiary)]">
                        <path d="M0 8h24M20 3l6 5-6 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-[var(--text-primary)] mb-3">核心能力</h2>
            <p className="text-[var(--text-secondary)]">为专业 AI 工作流设计的全栈能力</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="group p-6 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-secondary)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-tertiary)] transition-all duration-300 cursor-default"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="text-base font-semibold text-[var(--text-primary)] mb-2">{f.title}</h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="p-10 rounded-3xl bg-gradient-to-br from-indigo-500/10 to-cyan-500/10 border border-[var(--border-primary)]">
            <h2 className="text-3xl font-bold text-[var(--text-primary)] mb-4">准备好了吗？</h2>
            <p className="text-[var(--text-secondary)] mb-8">无需注册，密钥本地加密存储，即刻开始构建你的 AI 协作流水线</p>
            <Link href="/workspace" className="btn btn-primary btn-lg text-base px-12 py-4">
              立即开始
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-[var(--border-secondary)]">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-[var(--text-tertiary)]">
          <span>ChainMind &copy; 2026</span>
          <span>所有数据仅存储在您的浏览器中</span>
        </div>
      </footer>
    </div>
  );
}

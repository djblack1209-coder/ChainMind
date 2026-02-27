"use client";

import React, { useState } from 'react';

interface Props {
  onComplete: () => void;
  onOpenApiKeys: () => void;
}

const STEPS = [
  {
    title: '欢迎使用 ChainMind',
    subtitle: 'AI 链式讨论平台',
    desc: '让多个 AI 模型接力思考，构建强大的智能工作流。\n只需 3 步即可开始使用。',
    icon: (
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center text-white text-3xl font-bold shadow-lg">
        C
      </div>
    ),
  },
  {
    title: '第 1 步：配置 API 密钥',
    subtitle: '连接你的 AI 服务',
    desc: '支持 Claude、OpenAI、Gemini 三大模型。\n至少配置一个即可开始使用，密钥加密存储在本地浏览器中，绝不上传。',
    icon: (
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
        </svg>
      </div>
    ),
    action: 'openKeys',
  },
  {
    title: '第 2 步：添加 AI 节点',
    subtitle: '拖拽构建工作流',
    desc: '点击「添加节点」按钮创建 AI 节点，\n拖拽节点底部的绿色圆点连接到下一个节点的蓝色圆点，\n形成链式思考流程。',
    icon: (
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      </div>
    ),
  },
  {
    title: '第 3 步：执行流水线',
    subtitle: '一键运行，查看结果',
    desc: '点击绿色的「执行流水线」按钮，\n所有节点将按照连线顺序依次执行，\n实时查看每个节点的输出结果。',
    icon: (
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30 flex items-center justify-center">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.5">
          <polygon points="5 3 19 12 5 21 5 3" fill="#22c55e30" />
        </svg>
      </div>
    ),
  },
];

export default function WelcomeGuide({ onComplete, onOpenApiKeys }: Props) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const handleNext = () => {
    if (current.action === 'openKeys') {
      onOpenApiKeys();
    }
    if (isLast) {
      onComplete();
    } else {
      setStep(step + 1);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="w-[480px] bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border-primary)] shadow-2xl overflow-hidden" style={{ boxShadow: '0 0 80px rgba(99,102,241,0.15)' }}>
        {/* Progress bar */}
        <div className="h-1 bg-[var(--bg-primary)]">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-500 ease-out"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div className="px-8 pt-10 pb-6 text-center">
          <div className="flex justify-center mb-6 animate-fade-in-scale">
            {current.icon}
          </div>
          <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1">{current.title}</h2>
          <p className="text-xs text-indigo-400 mb-4">{current.subtitle}</p>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-line">
            {current.desc}
          </p>
        </div>

        {/* Actions */}
        <div className="px-8 pb-8 flex items-center justify-between">
          <button
            onClick={handleSkip}
 className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition"
          >
            跳过引导
          </button>

          <div className="flex items-center gap-3">
            {/* Step dots */}
            <div className="flex items-center gap-1.5 mr-2">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${
                    i === step ? 'bg-indigo-400 w-4' : i < step ? 'bg-indigo-400/40' : 'bg-[var(--text-tertiary)]/30'
                  }`}
                />
              ))}
            </div>

            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="btn btn-secondary text-xs py-2 px-4"
              >
                上一步
              </button>
            )}
            <button
              onClick={handleNext}
              className="btn btn-primary text-xs py-2 px-5"
            >
              {isLast ? '开始使用' : current.action === 'openKeys' ? '去配置密钥' : '下一步'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

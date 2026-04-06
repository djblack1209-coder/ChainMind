"use client";

import React, { useState } from 'react';
import BrandMark from '@/components/BrandMark';

interface Props {
  onComplete: () => void;
  onOpenApiKeys: () => void;
}

const STEPS = [
  {
    title: '欢迎使用 ChainMind',
    subtitle: 'AI 链式讨论平台',
    desc: '让多个 AI 模型接力思考，构建更强的智能工作流。只需 3 步即可完成初始化。',
    chip: 'Welcome',
  },
  {
    title: '第 1 步：配置 API 密钥',
    subtitle: '连接你的 AI 服务',
    desc: '支持 Claude、OpenAI、Gemini。至少配置一个即可开始使用，密钥仅保存在本地环境。',
    chip: 'Keys',
    action: 'openKeys',
  },
  {
    title: '第 2 步：添加 AI 节点',
    subtitle: '拖拽构建工作流',
    desc: '点击“添加节点”创建执行单元，再通过节点之间的连线组织推理顺序。',
    chip: 'Nodes',
  },
  {
    title: '第 3 步：执行流水线',
    subtitle: '一键运行，查看结果',
    desc: '点击执行按钮后，系统会按拓扑顺序运行所有节点，并实时回显每一步结果。',
    chip: 'Launch',
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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-3xl overflow-hidden rounded-[40px] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(18,22,30,0.82))] shadow-[var(--shadow-lg)] backdrop-blur-2xl">
        <div className="h-1 bg-black/30">
          <div
            className="h-full bg-[linear-gradient(90deg,#7fbfff,#0a84ff)] transition-all duration-500 ease-out"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        <div className="grid gap-0 md:grid-cols-[0.88fr_1.12fr]">
          <div className="border-b border-white/8 p-6 md:border-b-0 md:border-r md:p-8">
            <div className="section-kicker">Getting started</div>
            <h2 className="font-display mt-5 text-4xl text-[var(--text-primary)]">{current.title}</h2>
            <p className="mt-2 text-sm text-[var(--text-tertiary)]">{current.subtitle}</p>
            <p className="mt-6 text-sm leading-7 text-[var(--text-secondary)] sm:text-base">{current.desc}</p>

            <div className="mt-6 flex flex-wrap gap-2">
              <span className="chip chip-cool">{current.chip}</span>
              <span className="chip chip-muted">Step {step + 1}</span>
            </div>
          </div>

          <div className="flex flex-col justify-between p-6 md:p-8">
            <div className="panel-card flex min-h-[220px] items-center justify-center p-6 text-center">
              <div>
                <BrandMark size="lg" className="justify-center" />
                <div className="mt-5 text-lg font-semibold text-[var(--text-primary)]">ChainMind Control Room</div>
                <div className="mt-2 text-sm leading-7 text-[var(--text-tertiary)]">
                  通过更清晰的对话、链式讨论与配置系统，快速进入可工作的 AI 协作状态。
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between gap-4">
              <button onClick={onComplete} className="text-sm text-[var(--text-tertiary)] transition hover:text-[var(--text-secondary)]">
                跳过引导
              </button>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 mr-1">
                  {STEPS.map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 rounded-full transition-all ${
                        i === step ? 'w-8 bg-[var(--brand-primary)]' : i < step ? 'w-3 bg-[var(--brand-primary)]/50' : 'w-3 bg-white/12'
                      }`}
                    />
                  ))}
                </div>

                {step > 0 && (
                  <button onClick={() => setStep(step - 1)} className="btn btn-secondary px-4 py-2 text-sm">
                    上一步
                  </button>
                )}
                <button onClick={handleNext} className="btn btn-primary px-5 py-2 text-sm">
                  {isLast ? '开始使用' : current.action === 'openKeys' ? '去配置密钥' : '下一步'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

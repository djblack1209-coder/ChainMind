"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Download,
  GitBranch,
  Github,
  Globe2,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import {
  DEMO_STAGES,
  demoContent,
  demoPlanName,
  exportDemoMarkdown,
  type DemoPlan,
  type DemoLanguage,
} from "@/lib/demo-discussion";
import styles from "./demo.module.css";

export default function DiscussionDemo() {
  const [step, setStep] = useState(0);
  const [plan, setPlan] = useState<DemoPlan>("local");
  const [language, setLanguage] = useState<DemoLanguage>("en");
  const zh = language === "zh";
  const stage = DEMO_STAGES[step];

  function download() {
    const url = URL.createObjectURL(
      new Blob([exportDemoMarkdown(plan, language)], {
        type: "text/markdown;charset=utf-8",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `chainmind-sample-${plan}-${language}.md`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className={styles.demo} lang={zh ? "zh-CN" : "en"}>
      <a href="#discussion-content" className={styles.skip}>
        {zh ? "跳到讨论内容" : "Skip to discussion"}
      </a>
      <header className={styles.header}>
        <Link
          href="/demo"
          className={styles.wordmark}
          aria-label="ChainMind demo"
        >
          <BrandMark size="sm" /> ChainMind <span>LAB</span>
        </Link>
        <nav aria-label={zh ? "全局导航" : "Main navigation"}>
          <button onClick={() => setLanguage(zh ? "en" : "zh")}>
            <Globe2 size={15} />
            {zh ? "English" : "中文"}
          </button>
          <a href="https://github.com/djblack1209-coder/ChainMind">
            <Github size={16} />
            <span>GitHub</span>
          </a>
          <Link href="/workspace" className={styles.openWorkspace}>
            {zh ? "打开工作台" : "Open workspace"}
            <ArrowUpRight />
          </Link>
        </nav>
      </header>

      <main className={styles.main}>
        <section className={styles.intro} aria-labelledby="demo-title">
          <div>
            <p className={styles.eyebrow}>
              <span />
              {zh
                ? "多角色协作 · 人工决策"
                : "MULTIPLE PERSPECTIVES. ONE CLEAR DECISION."}
            </p>
            <h1 id="demo-title">
              {zh ? (
                <>
                  让想法经过评审，
                  <br />
                  <em>成为行动。</em>
                </>
              ) : (
                <>
                  Think in perspectives.
                  <br />
                  <em>Build with clarity.</em>
                </>
              )}
            </h1>
            <p className={styles.subtitle}>
              {zh
                ? "从需求到交付，走完一次可追溯的 AI 协作流程。"
                : "Follow an idea from the first brief to a reviewable delivery plan."}
            </p>
          </div>
          <div className={styles.demoNote}>
            <Sparkles size={18} />
            <div>
              <strong>
                {zh ? "无需密钥的交互示例" : "Interactive sample · No API key"}
              </strong>
              <p>
                {zh
                  ? "内置教学内容，不调用模型。选择方案，查看每一步的变化。"
                  : "Authored content, no live inference. Choose a plan and explore each handoff."}
              </p>
            </div>
          </div>
        </section>

        <section
          className={styles.workbench}
          aria-label={zh ? "讨论示例" : "Sample discussion"}
        >
          <div className={styles.windowBar}>
            <span className={styles.windowDots}>
              <i />
              <i />
              <i />
            </span>
            <span>
              <GitBranch size={14} />
              {zh
                ? "AI 代码评审助手 / 方案讨论"
                : "AI code-review assistant / Design discussion"}
            </span>
            <span className={styles.sampleBadge}>{zh ? "示例" : "SAMPLE"}</span>
          </div>
          <div className={styles.workbenchBody}>
            <aside className={styles.sidebar}>
              <p className={styles.sectionLabel}>
                {zh ? "协作流程" : "DISCUSSION FLOW"}
              </p>
              <nav aria-label={zh ? "讨论阶段" : "Discussion stages"}>
                {DEMO_STAGES.map((item, index) => (
                  <button
                    key={item.id}
                    onClick={() => setStep(index)}
                    aria-current={step === index ? "step" : undefined}
                    className={`${styles.stage} ${step === index ? styles.activeStage : ""}`}
                  >
                    <span className={styles.stageNumber}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span>
                      <strong>{item[language]}</strong>
                      <small>{item.role}</small>
                    </span>
                    {step === index && <ChevronRight size={14} />}
                  </button>
                ))}
              </nav>
              <div className={styles.brief}>
                <p className={styles.sectionLabel}>
                  {zh ? "项目约束" : "THE BRIEF"}
                </p>
                <p>
                  {zh
                    ? "3 人开发团队。自己的模型账户。一次能落地的代码评审流程。"
                    : "Three engineers. Their own model accounts. One actionable code-review workflow."}
                </p>
                <span>{zh ? "明确分工" : "Clear ownership"}</span>
                <span>{zh ? "保留决策依据" : "Traceable decisions"}</span>
              </div>
              <button
                className={styles.reset}
                onClick={() => {
                  setStep(0);
                  setPlan("local");
                }}
              >
                <RotateCcw size={14} />
                {zh ? "重新开始" : "Restart sample"}
              </button>
            </aside>

            <div id="discussion-content" className={styles.content}>
              <div className={styles.contentHeader}>
                <span className={styles.sectionLabel}>
                  {zh ? "阶段" : "STEP"} {String(step + 1).padStart(2, "0")} /
                  05
                </span>
                <span className={styles.handoff}>
                  <span />
                  {zh ? "由你控制进度" : "You control the handoff"}
                </span>
              </div>
              <h2>{stage[language]}</h2>
              <div className={styles.roleLine}>
                <span className={styles.avatar}>
                  {step === 1 ? "AR" : ["PL", "AR", "TL", "FB", "DL"][step]}
                </span>
                <div>
                  <strong>{stage.role}</strong>
                  <span>{zh ? "示例角色输出" : "Sample role output"}</span>
                </div>
                <GitBranch size={18} />
              </div>
              <article
                className={styles.article}
                aria-live="polite"
                aria-atomic="true"
              >
                <MarkdownRenderer
                  content={demoContent(step, plan, language)}
                  enableMath={false}
                  enableMermaid={false}
                  enableCopy={false}
                />
              </article>
              <div className={styles.controls}>
                <button
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  disabled={step === 0}
                >
                  <ArrowLeft size={15} />
                  {zh ? "上一步" : "Previous"}
                </button>
                <span>
                  {step + 1} / {DEMO_STAGES.length}
                </span>
                {step < DEMO_STAGES.length - 1 ? (
                  <button
                    className={styles.next}
                    onClick={() =>
                      setStep((s) => Math.min(DEMO_STAGES.length - 1, s + 1))
                    }
                  >
                    {zh ? "下一步" : "Next handoff"}
                    <ArrowRight size={15} />
                  </button>
                ) : (
                  <button className={styles.next} onClick={download}>
                    <Download size={15} />
                    {zh ? "导出报告" : "Export report"}
                  </button>
                )}
              </div>
            </div>

            <aside className={styles.decisions}>
              <p className={styles.sectionLabel}>
                {zh ? "人工决策点" : "HUMAN DECISION"}
              </p>
              <h3>{zh ? "你决定方向。" : "You set the direction."}</h3>
              <p>
                {zh
                  ? "切换方案，比较后续评审、分工和交付内容。"
                  : "Switch plans to compare the review, task ownership, and final recommendation."}
              </p>
              <fieldset>
                <legend className={styles.sectionLabel}>
                  {zh ? "选择一个方案" : "CHOOSE A PLAN"}
                </legend>
                {(["local", "cloud"] as const).map((id, index) => (
                  <label
                    key={id}
                    className={`${styles.plan} ${plan === id ? styles.selectedPlan : ""}`}
                  >
                    <input
                      type="radio"
                      name="plan"
                      value={id}
                      checked={plan === id}
                      onChange={() => {
                        setPlan(id);
                        setStep(1);
                      }}
                    />
                    <span className={styles.planLetter}>
                      {String.fromCharCode(65 + index)}
                    </span>
                    <strong>{demoPlanName(id, language)}</strong>
                    <span className={styles.planCheck}>
                      {plan === id && <Check size={14} />}
                    </span>
                    <small>
                      {id === "local"
                        ? zh
                          ? "较少运维 · 单机数据"
                          : "Less infrastructure · single device"
                        : zh
                          ? "协作优先 · 需要后端服务"
                          : "Sharing first · requires backend"}
                    </small>
                  </label>
                ))}
              </fieldset>
              <div className={styles.deliverable}>
                <span className={styles.fileIcon}>MD</span>
                <div>
                  <strong>
                    {zh ? "带走完整决策" : "Take the decision with you"}
                  </strong>
                  <p>
                    {zh
                      ? "包含所选方案与全部 5 个阶段。"
                      : "Your selected plan and all five stages."}
                  </p>
                </div>
                <button onClick={download}>
                  <Download size={14} />
                  {zh ? "下载示例报告" : "Download sample report"}
                </button>
              </div>
              <p className={styles.boundary}>
                {zh
                  ? "云端方案用于展示权衡，当前产品未实现团队云协作。真实使用请在工作台配置自己的模型。"
                  : "The cloud plan illustrates a trade-off; cloud team collaboration is not implemented. Configure your own model in the workspace for live use."}
              </p>
            </aside>
          </div>
        </section>
        <footer className={styles.footer}>
          <span>
            {zh
              ? "本地优先的 AI 协作工作台"
              : "A local-first workspace for AI collaboration"}
          </span>
          <span>
            Next.js <b>·</b> React <b>·</b> TypeScript <b>·</b> Electron
          </span>
          <a href="https://github.com/djblack1209-coder/ChainMind#architecture">
            {zh ? "查看架构" : "Explore the architecture"}
            <ArrowRight size={13} />
          </a>
        </footer>
      </main>
    </div>
  );
}

function ArrowUpRight() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M7 17 17 7M7 7h10v10" />
    </svg>
  );
}

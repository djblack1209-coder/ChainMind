"use client";

import React, { useState, useCallback } from "react";
import type { AIProvider } from "@/lib/types";
import { useApiKeyStore } from "@/stores/api-key-store";
import { DEFAULT_PROVIDER_MODEL } from "@/lib/types";
import { streamChatRequest } from "@/lib/llm-client";

// ─── Types ───────────────────────────────────────────────
export interface ChainAIAgent {
  id: string;
  name: string;
  role: string;
  model: string;
  provider: AIProvider;
  tools: string[];
  order: number;
}

export interface ChainRound {
  roundIndex: number;
  agentId: string;
  agentName: string;
  model: string;
  input: string;
  output: string;
  status: "pending" | "running" | "done" | "error";
  latencyMs: number;
  error?: string;
}

export interface ChainTask {
  id: string;
  agentId: string;
  agentName: string;
  model: string;
  description: string;
  output: string;
  status: "pending" | "running" | "done" | "error";
  latencyMs: number;
  error?: string;
}

export interface ChainSession {
  id: string;
  userInput: string;
  refinementRounds: number;
  rounds: ChainRound[];
  tasks: ChainTask[];
  finalReport: string;
  status: "idle" | "refining" | "assigning" | "executing" | "reporting" | "done";
}

// ─── Prompt Engine Panel ─────────────────────────────────
export default function PromptEnginePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const getKey = useApiKeyStore((s) => s.getKey);
  const baseUrls = useApiKeyStore((s) => s.baseUrls);
  const keys = useApiKeyStore((s) => s.keys);

  const [userInput, setUserInput] = useState("");
  const [refinementRounds, setRefinementRounds] = useState(2);
  const [session, setSession] = useState<ChainSession | null>(null);

  // Default agents for the chain
  const [agents] = useState<ChainAIAgent[]>([
    { id: "refiner-1", name: "需求分析师", role: "分析用户需求，提取关键信息，补充缺失上下文", model: DEFAULT_PROVIDER_MODEL.claude, provider: "claude", tools: ["web_search"], order: 1 },
    { id: "refiner-2", name: "方案架构师", role: "基于分析结果设计技术方案，评估可行性和风险", model: DEFAULT_PROVIDER_MODEL.openai, provider: "openai", tools: ["web_search", "code_exec"], order: 2 },
    { id: "executor-code", name: "代码工程师", role: "负责代码实现", model: DEFAULT_PROVIDER_MODEL.claude, provider: "claude", tools: ["code_exec", "file_read"], order: 3 },
    { id: "executor-review", name: "质量审查员", role: "代码审查和质量保证", model: DEFAULT_PROVIDER_MODEL.openai, provider: "openai", tools: ["code_exec"], order: 4 },
    { id: "reporter", name: "汇报总结", role: "整合所有结果，生成最终报告", model: DEFAULT_PROVIDER_MODEL.claude, provider: "claude", tools: [], order: 5 },
  ]);

  const resolveCredentials = useCallback(async (provider: AIProvider) => {
    const key = await getKey(provider);
    if (key) return { apiKey: key, baseUrl: baseUrls[provider] };
    // Fallback to any available key
    for (const p of ["claude", "openai", "gemini"] as AIProvider[]) {
      const k = await getKey(p);
      if (k) return { apiKey: k, baseUrl: baseUrls[p] };
    }
    return null;
  }, [getKey, baseUrls]);

  const streamFromAgent = useCallback(async (
    agent: ChainAIAgent,
    systemPrompt: string,
    userPrompt: string,
    onChunk: (text: string) => void,
  ): Promise<{ fullText: string; latencyMs: number }> => {
    const creds = await resolveCredentials(agent.provider);
    if (!creds) throw new Error("无可用 API 密钥");

    const start = performance.now();
    let fullText = "";

    await streamChatRequest(
      {
        provider: agent.provider,
        model: agent.model,
        apiKey: creds.apiKey,
        baseUrl: creds.baseUrl,
        systemPrompt,
        userPrompt,
        temperature: 0.6,
        maxTokens: 4096,
        effort: "medium",
        enableMetaPrompt: false,
      },
      {
        onChunk: (chunk) => {
          if (chunk.type === "text") {
            fullText += chunk.content;
            onChunk(fullText);
          }
        },
      },
    );

    return { fullText, latencyMs: Math.round(performance.now() - start) };
  }, [resolveCredentials]);

  // ─── Core Chain Execution ──────────────────────────────
  const runChain = useCallback(async () => {
    if (!userInput.trim()) return;

    const sessionId = `session_${Date.now()}`;
    const newSession: ChainSession = {
      id: sessionId,
      userInput: userInput.trim(),
      refinementRounds,
      rounds: [],
      tasks: [],
      finalReport: "",
      status: "refining",
    };
    setSession(newSession);

    // Phase 1: Multi-AI refinement rounds
    let currentContext = userInput.trim();
    const refiners = agents.filter((a) => a.id.startsWith("refiner-"));

    for (let round = 0; round < refinementRounds; round++) {
      for (const agent of refiners) {
        const roundEntry: ChainRound = {
          roundIndex: round,
          agentId: agent.id,
          agentName: agent.name,
          model: agent.model,
          input: currentContext,
          output: "",
          status: "running",
          latencyMs: 0,
        };

        setSession((prev) => prev ? { ...prev, rounds: [...prev.rounds, roundEntry] } : prev);

        try {
          const systemPrompt = `你是${agent.name}。${agent.role}。
这是第 ${round + 1}/${refinementRounds} 轮完善。请在上一位的结论基础上继续完善方案。
要求：保留上一位的有效结论，补充你的专业视角，指出遗漏和风险。`;

          const result = await streamFromAgent(
            agent,
            systemPrompt,
            `当前方案/需求:\n${currentContext}`,
            (text) => {
              setSession((prev) => {
                if (!prev) return prev;
                const rounds = [...prev.rounds];
                const idx = rounds.findIndex((r) => r.agentId === agent.id && r.roundIndex === round);
                if (idx >= 0) rounds[idx] = { ...rounds[idx], output: text, status: "running" };
                return { ...prev, rounds };
              });
            },
          );

          currentContext = result.fullText;
          setSession((prev) => {
            if (!prev) return prev;
            const rounds = [...prev.rounds];
            const idx = rounds.findIndex((r) => r.agentId === agent.id && r.roundIndex === round);
            if (idx >= 0) rounds[idx] = { ...rounds[idx], output: result.fullText, status: "done", latencyMs: result.latencyMs };
            return { ...prev, rounds };
          });
        } catch (err) {
          setSession((prev) => {
            if (!prev) return prev;
            const rounds = [...prev.rounds];
            const idx = rounds.findIndex((r) => r.agentId === agent.id && r.roundIndex === round);
            if (idx >= 0) rounds[idx] = { ...rounds[idx], status: "error", error: String(err) };
            return { ...prev, rounds };
          });
        }
      }
    }

    // Phase 2: Task assignment based on refined plan
    setSession((prev) => prev ? { ...prev, status: "assigning" } : prev);
    const executors = agents.filter((a) => a.id.startsWith("executor-"));
    const tasks: ChainTask[] = executors.map((agent) => ({
      id: `task_${agent.id}_${Date.now()}`,
      agentId: agent.id,
      agentName: agent.name,
      model: agent.model,
      description: `基于完善后的方案，由${agent.name}执行: ${agent.role}`,
      output: "",
      status: "pending" as const,
      latencyMs: 0,
    }));
    setSession((prev) => prev ? { ...prev, tasks, status: "executing" } : prev);

    // Phase 3: Parallel execution
    await Promise.all(
      tasks.map(async (task) => {
        const agent = agents.find((a) => a.id === task.agentId);
        if (!agent) return;

        setSession((prev) => {
          if (!prev) return prev;
          const ts = prev.tasks.map((t) => t.id === task.id ? { ...t, status: "running" as const } : t);
          return { ...prev, tasks: ts };
        });

        try {
          const result = await streamFromAgent(
            agent,
            `你是${agent.name}。${agent.role}。请基于以下完善后的方案执行你的任务。`,
            `完善后的方案:\n${currentContext}\n\n请直接输出你的工作成果。`,
            (text) => {
              setSession((prev) => {
                if (!prev) return prev;
                const ts = prev.tasks.map((t) => t.id === task.id ? { ...t, output: text } : t);
                return { ...prev, tasks: ts };
              });
            },
          );

          setSession((prev) => {
            if (!prev) return prev;
            const ts = prev.tasks.map((t) => t.id === task.id ? { ...t, output: result.fullText, status: "done" as const, latencyMs: result.latencyMs } : t);
            return { ...prev, tasks: ts };
          });
        } catch (err) {
          setSession((prev) => {
            if (!prev) return prev;
            const ts = prev.tasks.map((t) => t.id === task.id ? { ...t, status: "error" as const, error: String(err) } : t);
            return { ...prev, tasks: ts };
          });
        }
      }),
    );

    // Phase 4: Final report
    setSession((prev) => prev ? { ...prev, status: "reporting" } : prev);
    const reporter = agents.find((a) => a.id === "reporter");
    if (reporter) {
      try {
        const taskSummaries = tasks.map((t) => `【${t.agentName}】\n${t.description}\n输出: 见下方`).join("\n\n");
        const result = await streamFromAgent(
          reporter,
          `你是汇报总结专家。请整合所有团队成员的工作成果，生成一份结构化的最终报告。
报告格式:
## 需求概述
## 方案要点
## 执行成果
## 风险与建议
## 下一步行动`,
          `原始需求: ${userInput}\n\n完善后方案:\n${currentContext}\n\n团队执行:\n${taskSummaries}`,
          (text) => {
            setSession((prev) => prev ? { ...prev, finalReport: text } : prev);
          },
        );
        setSession((prev) => prev ? { ...prev, finalReport: result.fullText, status: "done" } : prev);
      } catch {
        setSession((prev) => prev ? { ...prev, status: "done" } : prev);
      }
    } else {
      setSession((prev) => prev ? { ...prev, status: "done" } : prev);
    }
  }, [userInput, refinementRounds, agents, streamFromAgent]);

  const hasKeys = keys.claude !== null || keys.openai !== null || keys.gemini !== null;

  if (!open) return null;

  const statusBadge = (s: string) => {
    switch (s) {
      case "running": return "border-[var(--border-primary)] bg-[var(--brand-primary-soft)] text-[var(--text-primary)]";
      case "done": return "border-emerald-500/20 bg-emerald-500/10 text-emerald-200";
      case "error": return "border-rose-500/20 bg-rose-500/10 text-rose-200";
      default: return "border-white/8 bg-white/[0.03] text-[var(--text-tertiary)]";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,16,20,0.98),rgba(8,8,10,0.98))] shadow-[var(--shadow-lg)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">AI Chain Prompt Engine</div>
            <div className="mt-1 text-sm text-[var(--text-secondary)]">
              人类输入 → 多AI轮次完善 → 任务分配 → 并行执行 → 汇报
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon border border-white/8 bg-white/[0.03]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Input area */}
          {(!session || session.status === "done") && (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-2 block">你的需求（自然语言）</label>
                <textarea
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  rows={4}
                  placeholder="描述你想要实现的功能、解决的问题或任何需求..."
                  className="input resize-none text-sm leading-7"
                />
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">完善轮次</label>
                  <select
                    value={refinementRounds}
                    onChange={(e) => setRefinementRounds(Number(e.target.value))}
                    className="input w-20 text-xs"
                  >
                    <option value={1}>1 轮</option>
                    <option value={2}>2 轮</option>
                    <option value={3}>3 轮</option>
                  </select>
                </div>
                <button
                  onClick={runChain}
                  disabled={!userInput.trim() || !hasKeys}
                  className="btn btn-primary px-6"
                >
                  启动 AI Chain
                </button>
                {!hasKeys && (
                  <span className="text-xs text-amber-300">请先配置 API 密钥</span>
                )}
              </div>

              {/* Agent overview */}
              <div className="rounded-[18px] border border-white/8 bg-white/[0.02] p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-3">Chain 流水线</div>
                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                  {agents.map((agent, i) => (
                    <React.Fragment key={agent.id}>
                      <div className="flex-shrink-0 rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2 text-center">
                        <div className="text-[11px] font-medium text-[var(--text-primary)]">{agent.name}</div>
                        <div className="mt-0.5 font-mono text-[9px] text-[var(--text-tertiary)]">{agent.model}</div>
                      </div>
                      {i < agents.length - 1 && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" className="flex-shrink-0">
                          <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Session progress */}
          {session && session.status !== "idle" && (
            <div className="space-y-4">
              {/* Status bar */}
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium ${
                  session.status === "done" ? statusBadge("done") : statusBadge("running")
                }`}>
                  {session.status !== "done" && (
                    <span className="h-2 w-2 rounded-full border border-[var(--brand-primary)] border-t-transparent animate-spin" />
                  )}
                  {session.status === "refining" && "AI 轮次完善中..."}
                  {session.status === "assigning" && "任务分配中..."}
                  {session.status === "executing" && "并行执行中..."}
                  {session.status === "reporting" && "生成汇报..."}
                  {session.status === "done" && "Chain 完成"}
                </span>
                <span className="text-[11px] text-[var(--text-tertiary)]">
                  {session.rounds.length} 轮完善 · {session.tasks.length} 个任务
                </span>
              </div>

              {/* Refinement rounds */}
              {session.rounds.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-2">完善轮次</div>
                  <div className="space-y-2">
                    {session.rounds.map((round, i) => (
                      <div key={`${round.agentId}-${round.roundIndex}`} className="rounded-[16px] border border-white/8 bg-white/[0.03] p-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-[var(--text-tertiary)]">R{round.roundIndex + 1}</span>
                            <span className="text-xs font-medium text-[var(--text-primary)]">{round.agentName}</span>
                            <span className="font-mono text-[10px] text-[var(--text-tertiary)]">{round.model}</span>
                          </div>
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] ${statusBadge(round.status)}`}>
                            {round.status === "running" ? "运行中" : round.status === "done" ? `${round.latencyMs}ms` : round.status}
                          </span>
                        </div>
                        {round.output && (
                          <div className="max-h-32 overflow-y-auto whitespace-pre-wrap text-[11px] leading-5 text-[var(--text-secondary)]">
                            {round.output.slice(0, 500)}{round.output.length > 500 ? "..." : ""}
                          </div>
                        )}
                        {round.error && (
                          <div className="mt-1 text-[11px] text-rose-300">{round.error}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Parallel tasks */}
              {session.tasks.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-2">并行任务</div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {session.tasks.map((task) => (
                      <div key={task.id} className="rounded-[16px] border border-white/8 bg-white/[0.03] p-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-xs font-medium text-[var(--text-primary)]">{task.agentName}</span>
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] ${statusBadge(task.status)}`}>
                            {task.status === "running" ? "执行中" : task.status === "done" ? `${task.latencyMs}ms` : task.status}
                          </span>
                        </div>
                        {task.output && (
                          <div className="max-h-24 overflow-y-auto whitespace-pre-wrap text-[11px] leading-5 text-[var(--text-secondary)]">
                            {task.output.slice(0, 300)}{task.output.length > 300 ? "..." : ""}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Final report */}
              {session.finalReport && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-2">最终汇报</div>
                  <div className="rounded-[18px] border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <div className="max-h-64 overflow-y-auto whitespace-pre-wrap text-sm leading-7 text-[var(--text-secondary)]">
                      {session.finalReport}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

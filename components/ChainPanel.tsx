"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useChainStore } from '@/stores/chain-store';
import { useApiKeyStore } from '@/stores/api-key-store';
import type { AIProvider, ChainAgent, ChainTurn, ChainDiscussion, ChainTeamAssignment, AgentToolName, ChainStageRatings, ChainWorkflowStage, ChainPendingAction } from '@/lib/types';
import { ALL_AGENT_TOOLS, DEFAULT_PROVIDER_MODEL, MODEL_OPTIONS, buildToolPrompt, describeModelFocus, detectProvider, isFreeFriendlyModel } from '@/lib/types';
import {
  buildAdaptiveStageHint,
  buildExecutionAssignments,
  buildGuidedWorkflowAgents,
  collectAvailableModels,
  formatAssignmentList,
  mergeAdaptiveProfile,
  parsePlanOptions,
  parsePlanSelection,
  parseStageRatings,
} from '@/lib/chain-workflow';
import { streamChatRequest } from '@/lib/llm-client';
import { parseToolCalls, executeAllTools } from '@/lib/tool-executor';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import HumanApprovalCard from '@/components/chain/HumanApprovalCard';
import ExecutionTimeline from '@/components/chain/ExecutionTimeline';
import { getBuiltinAgents, getBuiltinWorkflows } from '@/lib/agent-config';
import { useExecutionEngine } from '@/lib/use-execution-engine';

// Lightweight wrapper to avoid re-renders during streaming
const ChainMarkdown = React.memo(({ content }: { content: string }) => (
  <MarkdownRenderer content={content} />
));

function genId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const AGENT_COLORS = ['#ff7c5a', '#56e2d4', '#ffbe72', '#8bb8ff', '#7ce6a7', '#f58aa8', '#c9d4ff'];
const AGENT_ICONS = ['🤖', '🧠', '🛠️', '📐', '🔍', '⚡', '🧩'];

function toAgentLabel(text: string, fallbackIndex = 1): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (!clean) return `智能体${fallbackIndex}`;
  return clean.length > 12 ? `${clean.slice(0, 12)}...` : clean;
}

function createAgentFromDraft(params: {
  name?: string;
  description: string;
  task?: string;
  model: string;
  index: number;
}): ChainAgent {
  const provider = detectProvider(params.model);
  const color = AGENT_COLORS[(params.index - 1) % AGENT_COLORS.length];
  const icon = AGENT_ICONS[(params.index - 1) % AGENT_ICONS.length];
  return {
    id: genId('agent'),
    name: (params.name || '').trim() || toAgentLabel(params.description, params.index),
    role: params.description.trim(),
    task: params.task?.trim() || '',
    provider,
    model: params.model,
    temperature: 0.6,
    maxTokens: 4096,
    color,
    icon,
    tools: ALL_AGENT_TOOLS.map((t) => t.name),
    sandboxMode: 'safe',
    autoCompress: true,
  };
}

function summarizeTurnContent(content: string, maxLen: number) {
  const oneLine = content.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen)}...`;
}

function buildContextWindow(contextTurns: ChainTurn[], autoCompress: boolean) {
  if (contextTurns.length === 0) {
    return { text: '', compressed: false };
  }

  const fullText = contextTurns.map((t) => `【${t.agentName}】(${t.model}):\n${t.content}`).join('\n\n---\n\n');
  const maxChars = 18_000;

  if (!autoCompress || fullText.length <= maxChars) {
    return { text: fullText, compressed: false };
  }

  const recentCount = 8;
  const olderTurns = contextTurns.slice(0, Math.max(0, contextTurns.length - recentCount));
  const recentTurns = contextTurns.slice(-recentCount);

  const olderSummary = olderTurns.map((t, idx) => {
    const brief = summarizeTurnContent(t.content, 140);
    return `${idx + 1}. 【${t.agentName}】${brief}`;
  }).join('\n');

  const recentRaw = recentTurns.map((t) => {
    const clipped = t.content.length > 1200 ? `${t.content.slice(0, 1200)}...` : t.content;
    return `【${t.agentName}】(${t.model}):\n${clipped}`;
  }).join('\n\n---\n\n');

  const merged = `### 早期讨论摘要（自动压缩）\n${olderSummary || '无'}\n\n### 最近讨论原文\n${recentRaw}`;
  return { text: merged, compressed: true };
}

function stageLabel(stage?: ChainWorkflowStage) {
  switch (stage) {
    case 'intake': return '阶段 1 · 客服接待';
    case 'waiting_plan_selection': return '等待你选择方案';
    case 'expert_review': return '阶段 2 · 专家评审';
    case 'team_assignment': return '阶段 3 · 任务拆分';
    case 'team_execution': return '阶段 4 · 团队执行';
    case 'report': return '阶段 5 · 汇报交付';
    case 'waiting_rating': return '等待评分';
    case 'completed': return '已完成';
    default: return '链式讨论';
  }
}

function createUserTurn(content: string, stage?: ChainWorkflowStage): ChainTurn {
  return {
    id: genId('turn'),
    agentId: 'user',
    agentName: '你',
    model: '',
    content,
    tokenCount: 0,
    latencyMs: 0,
    timestamp: Date.now(),
    role: 'user',
    stage,
  };
}

function createSystemTurn(content: string, stage?: ChainWorkflowStage, ratings?: ChainStageRatings): ChainTurn {
  return {
    id: genId('turn'),
    agentId: 'system',
    agentName: '系统',
    model: '',
    content,
    tokenCount: 0,
    latencyMs: 0,
    timestamp: Date.now(),
    role: 'system',
    stage,
    ratings,
  };
}

function formatPendingPrompt(action?: ChainPendingAction | null) {
  if (!action) return '';
  return action.prompt;
}

async function copyToClipboard(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return false;
}

function downloadTextFile(filename: string, content: string, mime = 'text/markdown;charset=utf-8') {
  if (typeof window === 'undefined') return false;
  const blob = new Blob([content], { type: mime });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
  return true;
}

const WORKFLOW_ROLE_LABELS: Record<string, string> = {
  customer_service: '客服接待',
  solution_expert: '方案评审',
  director: 'AI 总监',
  code_specialist: '工程实现',
  reasoning_specialist: '逻辑推演',
  explanation_specialist: '中文说明',
  verifier_a: '交叉验证 A',
  verifier_b: '交叉验证 B',
  reporter: '交付汇报',
};

function summarizeBoardContent(content: string, maxLen = 180) {
  if (!content.trim()) return '暂无输出';
  return summarizeTurnContent(content, maxLen);
}

function getLatestAgentTurn(turns: ChainTurn[], agentId: string, stage?: ChainWorkflowStage) {
  const matched = turns.filter((turn) => turn.agentId === agentId && (!stage || turn.stage === stage));
  return matched[matched.length - 1];
}

function buildGuidedDiscussionBrief(disc: ChainDiscussion) {
  const reportAgent = disc.agents.find((agent) => agent.workflowRole === 'reporter');
  const reportTurn = reportAgent ? getLatestAgentTurn(disc.turns, reportAgent.id, 'report') : undefined;
  const assignmentLines = (disc.teamAssignments || []).map((assignment) => {
    const turn = getLatestAgentTurn(disc.turns, assignment.agentId, 'team_execution');
    return `${assignment.agentName} (${assignment.model})
- 负责人角色: ${WORKFLOW_ROLE_LABELS[assignment.workflowRole || 'code_specialist'] || '执行'}
- 任务焦点: ${assignment.focus}
- 输出摘要: ${turn ? summarizeBoardContent(turn.content, 240) : '暂无结果'}`;
  }).join('\n\n');

  const verifierLines = disc.agents
    .filter((agent) => agent.workflowRole === 'verifier_a' || agent.workflowRole === 'verifier_b')
    .map((agent) => {
      const turn = getLatestAgentTurn(disc.turns, agent.id, 'team_execution');
      return `${agent.name} (${agent.model})
- 验证状态: ${turn ? (turn.error ? '出错' : turn.isStreaming ? '验证中' : '已验证') : '待验证'}
- 验证结论: ${turn ? summarizeBoardContent(turn.content, 240) : '暂无验证结论'}`;
    }).join('\n\n');

  return [
    '# ChainMind 任务简报',
    '',
    '## 原始需求',
    disc.topic,
    '',
    '## 选定方案',
    disc.selectedPlanSummary || '暂无已选方案摘要',
    '',
    '## 团队执行看板',
    assignmentLines || '暂无执行任务',
    '',
    '## 交叉验证结论',
    verifierLines || '暂无交叉验证结论',
    '',
    '## 最终汇报',
    reportTurn?.content || '暂无最终汇报',
    '',
    '## 评分记忆',
    disc.adaptiveProfile
      ? `客服 ${disc.adaptiveProfile.intakeAvg.toFixed(1)} / 评审 ${disc.adaptiveProfile.reviewAvg.toFixed(1)} / 交付 ${disc.adaptiveProfile.deliveryAvg.toFixed(1)}`
      : '暂无评分记忆',
  ].join('\n');
}

function buildStructuredDeliveryMarkdown(disc: ChainDiscussion) {
  const reportAgent = disc.agents.find((agent) => agent.workflowRole === 'reporter');
  const reportTurn = reportAgent ? getLatestAgentTurn(disc.turns, reportAgent.id, 'report') : undefined;
  const sections = parseStructuredReportSections(reportTurn?.content || '');

  return [
    '# ChainMind 结构化交付',
    '',
    '## 原始需求',
    disc.topic,
    '',
    '## 选定方案',
    disc.selectedPlanSummary || '暂无已选方案摘要',
    '',
    '## 已完成事项',
    sections.completed || '暂无',
    '',
    '## 注意事项',
    sections.cautions || '暂无',
    '',
    '## 后续迭代建议',
    sections.nextSteps || '暂无',
    '',
    '## 评分请求',
    sections.rating || '暂无',
  ].join('\n');
}

function buildAssignmentExecutionPrompt(
  disc: ChainDiscussion,
  assignment: ChainTeamAssignment | undefined,
  agent: ChainAgent,
) {
  const deliveryHint = buildAdaptiveStageHint(disc.adaptiveProfile, 'delivery');
  return `## 当前方案
${disc.selectedPlanSummary || disc.topic}

## 你的分工
${assignment?.focus || agent.task || '围绕当前方案补充你的专业执行内容。'}

## 你的分工原因
${assignment?.reason || '请结合你的模型特性独立完成。'}

你现在处于团队并行执行阶段，请直接输出你完成的工作、关键产出、未决风险和需要其他角色衔接的事项。${deliveryHint}`;
}

function buildVerificationPrompt(disc: ChainDiscussion) {
  return `## 当前方案
${disc.selectedPlanSummary || disc.topic}

你现在处于最终交叉验证阶段。请独立检查目前团队输出是否存在：
1. 事实错误；
2. 逻辑漏洞；
3. 风险遗漏；
4. 对小白不够友好的表述。

请给出验证结论和必要修正建议。`;
}

function buildStructuredReportPrompt(disc: ChainDiscussion) {
  const reportHint = buildAdaptiveStageHint(disc.adaptiveProfile, 'delivery');
  return `## 用户原始需求
${disc.topic}

## 选定方案
${disc.selectedPlanSummary || '用户已确认方案'}

你现在要向小白汇报最终结果。请严格使用以下结构输出，标题不要改：

## 已完成事项
- 用清晰中文说明团队完成了什么

## 注意事项
- 说明还需要用户注意什么

## 后续迭代建议
- 说明下一步建议如何迭代

## 评分请求
- 明确邀请用户分别给环节1（客服接待）、环节2（专家评审）、环节3（最终交付）打 1/2/3 分

请避免空话，直接给小白可理解、可执行的结论。${reportHint}`;
}

function createRatingPendingAction(): ChainPendingAction {
  return {
    type: 'rate_stages',
    prompt: '请为环节 1 / 2 / 3 打 1-3 分，帮助团队自动调整后续表现。',
    placeholder: '例如：3 2 3，或使用下方评分按钮。',
  };
}

function parseStructuredReportSections(content: string) {
  const sections: Record<string, string> = {};
  const lines = content.split('\n');
  let current = '';

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      current = heading[1].trim();
      if (!sections[current]) sections[current] = '';
      continue;
    }
    if (!current) continue;
    sections[current] += `${line}\n`;
  }

  const pick = (keywords: string[]) => {
    const entry = Object.entries(sections).find(([title]) => keywords.some((keyword) => title.includes(keyword)));
    return entry?.[1].trim() || '';
  };

  return {
    completed: pick(['已完成']),
    cautions: pick(['注意']),
    nextSteps: pick(['迭代', '下一步']),
    rating: pick(['评分']),
  };
}

function getTaskBoardStatus(
  turn: ChainTurn | undefined,
  disc: ChainDiscussion,
  workflowRole?: string,
): { label: string; className: string } {
  if (turn?.error) {
    return { label: '出错', className: 'border border-[rgba(251,113,133,0.2)] bg-[rgba(251,113,133,0.08)] text-[#ffbeca]' };
  }
  if (turn?.isStreaming) {
    return { label: workflowRole?.startsWith('verifier') ? '验证中' : '执行中', className: 'border border-[var(--border-primary)] bg-[var(--brand-primary-soft)] text-[var(--text-primary)]' };
  }
  if (turn) {
    return { label: workflowRole?.startsWith('verifier') ? '已验证' : '已完成', className: 'border border-[rgba(74,222,128,0.18)] bg-[rgba(74,222,128,0.08)] text-emerald-200' };
  }

  if (workflowRole === 'director') {
    if (disc.stage === 'team_assignment') return { label: '分工中', className: 'border border-[var(--border-primary)] bg-[var(--brand-primary-soft)] text-[var(--text-primary)]' };
    if (disc.stage === 'intake' || disc.stage === 'expert_review' || disc.stage === 'waiting_plan_selection') {
      return { label: '待分工', className: 'border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]' };
    }
  }

  if (workflowRole?.startsWith('verifier')) {
    if (disc.stage === 'team_execution' || disc.stage === 'report' || disc.stage === 'waiting_rating' || disc.stage === 'completed') {
      return { label: '待验证', className: 'border border-[rgba(255,190,114,0.18)] bg-[rgba(255,190,114,0.08)] text-amber-200' };
    }
  }

  if (workflowRole === 'reporter') {
    if (disc.stage === 'report' || disc.stage === 'waiting_rating' || disc.stage === 'completed') {
      return { label: '待生成', className: 'border border-[rgba(255,190,114,0.18)] bg-[rgba(255,190,114,0.08)] text-amber-200' };
    }
  }

  return { label: '待开始', className: 'border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]' };
}

function TaskStatusBadge({ status }: { status: { label: string; className: string } }) {
  return <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-medium ${status.className}`}>{status.label}</span>;
}

function TaskBoardCard({
  title,
  subtitle,
  roleLabel,
  turn,
  status,
  focus,
  onJump,
  onExport,
  onRerun,
}: {
  title: string;
  subtitle: string;
  roleLabel: string;
  turn?: ChainTurn;
  status: { label: string; className: string };
  focus: string;
  onJump?: () => void;
  onExport?: () => void;
  onRerun?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState<'output' | 'summary' | null>(null);

  const handleCopy = async (mode: 'output' | 'summary') => {
    const text = mode === 'output'
      ? (turn?.content || '')
      : `${title}\n${focus}\n${turn ? summarizeBoardContent(turn.content, 240) : '当前还没有输出结果。'}`;
    if (!text.trim()) return;
    const ok = await copyToClipboard(text);
    if (!ok) return;
    setCopied(mode);
    window.setTimeout(() => setCopied(null), 1200);
  };

  return (
    <div className="rounded-[22px] border border-[var(--border-secondary)] bg-[linear-gradient(180deg,rgba(20,27,39,0.94),rgba(10,14,22,0.94))] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="meta-label">{roleLabel}</div>
          <div className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{title}</div>
          <div className="mt-1 font-mono text-[11px] text-[var(--text-tertiary)]">{subtitle}</div>
        </div>
        <TaskStatusBadge status={status} />
      </div>

      <div className="mt-4 space-y-3">
          <div className="rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] px-3 py-3">
          <div className="meta-label mb-2">任务焦点</div>
          <div className="text-[12px] leading-6 text-[var(--text-secondary)]">{focus}</div>
        </div>

        <div className="rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] px-3 py-3">
          <div className="meta-label mb-2">输出摘要</div>
          <div className="text-[12px] leading-6 text-[var(--text-secondary)]">
            {turn ? summarizeBoardContent(turn.content) : '当前还没有输出结果。'}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {turn && (
            <button onClick={() => setExpanded((prev) => !prev)} className="btn btn-secondary px-3 py-2 text-xs">
              {expanded ? '收起完整输出' : '查看完整输出'}
            </button>
          )}
          {onRerun && (
            <button onClick={onRerun} className="btn btn-secondary px-3 py-2 text-xs">
              重跑此环节
            </button>
          )}
          {turn && onJump && (
            <button onClick={onJump} className="btn btn-secondary px-3 py-2 text-xs">
              定位到发言
            </button>
          )}
          <button onClick={() => { handleCopy('summary').catch(() => {}); }} className="btn btn-secondary px-3 py-2 text-xs">
            {copied === 'summary' ? '已复制摘要' : '复制摘要'}
          </button>
          {turn && (
            <button onClick={() => { handleCopy('output').catch(() => {}); }} className="btn btn-secondary px-3 py-2 text-xs">
              {copied === 'output' ? '已复制全文' : '复制全文'}
            </button>
          )}
          {onExport && (
            <button onClick={onExport} className="btn btn-secondary px-3 py-2 text-xs">
              导出简报
            </button>
          )}
        </div>

        {expanded && turn && (
          <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--brand-primary-soft)] px-3 py-3">
            <div className="meta-label mb-2">完整输出</div>
            <div className="max-h-[220px] overflow-y-auto whitespace-pre-wrap text-[12px] leading-6 text-[var(--text-secondary)]">
              {turn.content}
            </div>
          </div>
        )}

        {turn && !turn.isStreaming && (turn.tokenCount > 0 || turn.latencyMs > 0) && (
          <div className="flex flex-wrap gap-2 text-[11px] text-[var(--text-tertiary)]">
            {turn.tokenCount > 0 && <span className="chip chip-muted !px-2 !py-1">{turn.tokenCount} tokens</span>}
            {turn.latencyMs > 0 && <span className="chip chip-muted !px-2 !py-1">{turn.latencyMs}ms</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function GuidedTaskBoard({
  disc,
  onRerunAssignment,
  onRerunVerification,
  onRerunReport,
  onRerunFailedOnly,
  onRefreshDownstream,
  autoCascadeRefresh,
  autoRetryFailed,
  onToggleAutoCascade,
  onToggleAutoRetry,
}: {
  disc: ChainDiscussion;
  onRerunAssignment: (assignment: ChainTeamAssignment) => void;
  onRerunVerification: (agent?: ChainAgent) => void;
  onRerunReport: () => void;
  onRerunFailedOnly: () => void;
  onRefreshDownstream: () => void;
  autoCascadeRefresh: boolean;
  autoRetryFailed: boolean;
  onToggleAutoCascade: () => void;
  onToggleAutoRetry: () => void;
}) {
  const assignments = disc.teamAssignments || [];
  const director = disc.agents.find((agent) => agent.workflowRole === 'director');
  const directorTurn = director ? getLatestAgentTurn(disc.turns, director.id, 'team_assignment') : undefined;
  const directorStatus = director ? getTaskBoardStatus(directorTurn, disc, director.workflowRole) : null;
  const reporter = disc.agents.find((agent) => agent.workflowRole === 'reporter');
  const reporterTurn = reporter ? getLatestAgentTurn(disc.turns, reporter.id, 'report') : undefined;
  const reporterStatus = reporter ? getTaskBoardStatus(reporterTurn, disc, reporter.workflowRole) : null;
  const structuredReport = reporterTurn ? parseStructuredReportSections(reporterTurn.content) : null;

  const verifierAgents = disc.agents.filter((agent) => agent.workflowRole === 'verifier_a' || agent.workflowRole === 'verifier_b');
  const verifierEntries = verifierAgents.map((agent) => {
    const turn = getLatestAgentTurn(disc.turns, agent.id, 'team_execution');
    return {
      agent,
      turn,
      status: getTaskBoardStatus(turn, disc, agent.workflowRole),
    };
  });

  const completedAssignments = assignments.filter((assignment) => {
    const turn = getLatestAgentTurn(disc.turns, assignment.agentId, 'team_execution');
    return Boolean(turn && !turn.isStreaming && !turn.error);
  }).length;

  const verificationDone = verifierEntries.filter((entry) => entry.turn && !entry.turn.isStreaming && !entry.turn.error).length;
  const failedAssignments = assignments.filter((assignment) => {
    const turn = getLatestAgentTurn(disc.turns, assignment.agentId, 'team_execution');
    return Boolean(turn?.error);
  }).length;
  const failedVerifications = verifierEntries.filter((entry) => entry.turn?.error).length;
  const failedReport = reporterTurn?.error ? 1 : 0;
  const totalFailed = failedAssignments + failedVerifications + failedReport;

  const exportBrief = async () => {
    await copyToClipboard(buildGuidedDiscussionBrief(disc));
  };

  const downloadBrief = async () => {
    downloadTextFile(`chainmind-task-brief-${disc.id}.md`, buildGuidedDiscussionBrief(disc));
  };

  const copyStructuredReport = async () => {
    if (!structuredReport) return;
    const content = [
      '## 已完成事项', structuredReport.completed || '暂无', '',
      '## 注意事项', structuredReport.cautions || '暂无', '',
      '## 后续迭代建议', structuredReport.nextSteps || '暂无', '',
      '## 评分请求', structuredReport.rating || '暂无',
    ].join('\n');
    await copyToClipboard(content);
  };

  const downloadStructuredReport = async () => {
    downloadTextFile(`chainmind-delivery-${disc.id}.md`, buildStructuredDeliveryMarkdown(disc));
  };

  const jumpToTurn = (turnId?: string) => {
    if (!turnId) return;
    const el = document.getElementById(`chain-turn-${turnId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="rounded-[24px] border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="meta-label">任务完成面板</div>
          <div className="mt-1 text-sm text-[var(--text-secondary)]">把分工、进度、输出摘要和交叉验证结果收束成一张任务看板。</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="chip chip-muted">执行完成 {completedAssignments}/{assignments.length}</span>
          <span className="chip chip-muted">验证完成 {verificationDone}/{verifierEntries.length}</span>
          {totalFailed > 0 && <span className="chip chip-muted !px-2 !py-1">失败项 {totalFailed}</span>}
          <button onClick={onToggleAutoCascade} className={`btn px-3 py-2 text-xs ${autoCascadeRefresh ? 'btn-secondary border-[var(--border-primary)] bg-[var(--brand-primary-soft)] text-[var(--text-primary)]' : 'btn-secondary'}`}>
            {autoCascadeRefresh ? '自动刷新下游: 开' : '自动刷新下游: 关'}
          </button>
          <button onClick={onToggleAutoRetry} className={`btn px-3 py-2 text-xs ${autoRetryFailed ? 'btn-secondary border-white/14 bg-white/[0.08] text-[var(--text-primary)]' : 'btn-secondary'}`}>
            {autoRetryFailed ? '失败自动重试: 开' : '失败自动重试: 关'}
          </button>
          <button onClick={onRerunFailedOnly} className="btn btn-secondary px-3 py-2 text-xs">
            仅重跑失败项
          </button>
          <button onClick={onRefreshDownstream} className="btn btn-secondary px-3 py-2 text-xs">
            刷新整条下游链路
          </button>
          {verifierEntries.length > 0 && (
            <button onClick={() => onRerunVerification()} className="btn btn-secondary px-3 py-2 text-xs">
              重跑交叉验证
            </button>
          )}
          <button onClick={onRerunReport} className="btn btn-secondary px-3 py-2 text-xs">
            重生最终汇报
          </button>
          <button onClick={() => { exportBrief().catch(() => {}); }} className="btn btn-secondary px-3 py-2 text-xs">
            复制任务简报
          </button>
          <button onClick={() => { downloadBrief().catch(() => {}); }} className="btn btn-secondary px-3 py-2 text-xs">
            下载任务简报
          </button>
        </div>
      </div>

      {director && directorStatus && (
        <div className="mb-4">
          <TaskBoardCard
            title={director.name}
            subtitle={director.model}
            roleLabel={WORKFLOW_ROLE_LABELS[director.workflowRole || 'director'] || '总监分工'}
            turn={directorTurn}
            status={directorStatus}
            focus="负责基于选定方案与模型特性完成任务拆分、优先级排序与负责人分配。"
            onJump={directorTurn ? () => jumpToTurn(directorTurn.id) : undefined}
            onExport={() => { exportBrief().catch(() => {}); }}
            onRerun={undefined}
          />
        </div>
      )}

      {assignments.length > 0 && (
        <div className="mb-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="chip chip-cool !px-2 !py-1">执行模型</span>
            <span className="text-[11px] text-[var(--text-tertiary)]">每个负责人对应一个主要交付任务</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {assignments.map((assignment: ChainTeamAssignment) => {
              const agent = disc.agents.find((item) => item.id === assignment.agentId);
              if (!agent) return null;
              const turn = getLatestAgentTurn(disc.turns, assignment.agentId, 'team_execution');
              const status = getTaskBoardStatus(turn, disc, assignment.workflowRole);
              return (
                <TaskBoardCard
                  key={assignment.agentId}
                  title={assignment.agentName}
                  subtitle={assignment.model}
                  roleLabel={WORKFLOW_ROLE_LABELS[assignment.workflowRole || 'code_specialist'] || '执行'}
                  turn={turn}
                  status={status}
                  focus={assignment.focus}
                  onJump={turn ? () => jumpToTurn(turn.id) : undefined}
                  onRerun={() => onRerunAssignment(assignment)}
                />
              );
            })}
          </div>
        </div>
      )}

      {verifierEntries.length > 0 && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="chip chip-muted !px-2 !py-1">交叉验证结论</span>
            <span className="text-[11px] text-[var(--text-tertiary)]">由不同模型独立复核前面所有执行输出</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {verifierEntries.map(({ agent, turn, status }) => (
              <TaskBoardCard
                key={agent.id}
                title={agent.name}
                subtitle={agent.model}
                roleLabel={WORKFLOW_ROLE_LABELS[agent.workflowRole || 'verifier_a'] || '交叉验证'}
                turn={turn}
                status={status}
                focus="独立检查事实错误、逻辑漏洞、风险遗漏和对小白不够友好的表述。"
                onJump={turn ? () => jumpToTurn(turn.id) : undefined}
                onRerun={() => onRerunVerification(agent)}
              />
            ))}
          </div>
        </div>
      )}

      {reporter && reporterStatus && (
        <div className="mt-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="chip chip-cool !px-2 !py-1">最终汇报</span>
            <span className="text-[11px] text-[var(--text-tertiary)]">交付总结、注意事项与后续建议</span>
          </div>
          <TaskBoardCard
            title={reporter.name}
            subtitle={reporter.model}
            roleLabel={WORKFLOW_ROLE_LABELS[reporter.workflowRole || 'reporter'] || '最终汇报'}
            turn={reporterTurn}
            status={reporterStatus}
            focus="负责整理团队成果，向小白汇报完成情况、注意事项和后续迭代方向。"
            onJump={reporterTurn ? () => jumpToTurn(reporterTurn.id) : undefined}
            onExport={() => { exportBrief().catch(() => {}); }}
            onRerun={onRerunReport}
          />
        </div>
      )}

      {structuredReport && (structuredReport.completed || structuredReport.cautions || structuredReport.nextSteps) && (
        <div className="mt-4 rounded-[22px] border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="meta-label">结构化交付</div>
              <div className="mt-1 text-[12px] text-[var(--text-tertiary)]">直接查看可复制的最终交付结构，适合给小白或交接他人。</div>
            </div>
            <button onClick={() => { copyStructuredReport().catch(() => {}); }} className="btn btn-secondary px-3 py-2 text-xs">
              复制结构化交付
            </button>
            <button onClick={() => { downloadStructuredReport().catch(() => {}); }} className="btn btn-secondary px-3 py-2 text-xs">
              下载结构化交付
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[20px] border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] p-4">
              <div className="meta-label mb-2">已完成事项</div>
              <div className="whitespace-pre-wrap text-[12px] leading-6 text-[var(--text-secondary)]">{structuredReport.completed || '暂无'}</div>
            </div>
            <div className="rounded-[20px] border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] p-4">
              <div className="meta-label mb-2">注意事项</div>
              <div className="whitespace-pre-wrap text-[12px] leading-6 text-[var(--text-secondary)]">{structuredReport.cautions || '暂无'}</div>
            </div>
            <div className="rounded-[20px] border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] p-4">
              <div className="meta-label mb-2">后续迭代建议</div>
              <div className="whitespace-pre-wrap text-[12px] leading-6 text-[var(--text-secondary)]">{structuredReport.nextSteps || '暂无'}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Agent Avatar =====
function AgentAvatar({ agent, size = 'md' }: { agent: ChainAgent; size?: 'sm' | 'md' }) {
  const s = size === 'sm' ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm';
  return (
    <div
      className={`${s} flex flex-shrink-0 items-center justify-center rounded-2xl border`}
      style={{ backgroundColor: `${agent.color}1f`, color: agent.color, borderColor: `${agent.color}44` }}
    >
      {agent.icon}
    </div>
  );
}

// ===== Turn Bubble =====
function TurnBubble({ turn, agent }: { turn: ChainTurn; agent?: ChainAgent }) {
  const role = turn.role || 'assistant';
  const isUser = role === 'user';
  const isSystem = role === 'system';

  if (isSystem) {
    return (
      <div id={`chain-turn-${turn.id}`} className="rounded-[22px] border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] px-4 py-3 animate-fade-in">
        <div className="mb-2 flex items-center gap-2">
          <span className="chip chip-cool !px-2 !py-1">系统提示</span>
          {turn.stage && <span className="chip chip-muted !px-2 !py-1">{stageLabel(turn.stage)}</span>}
        </div>
        <div className="whitespace-pre-wrap text-sm leading-7 text-[var(--text-secondary)]">{turn.content}</div>
      </div>
    );
  }

  return (
    <div id={`chain-turn-${turn.id}`} className={`group flex gap-3 animate-fade-in ${isUser ? 'flex-row-reverse' : ''}`}>
      {isUser ? (
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-2xl border border-[rgba(255,239,232,0.18)] bg-[linear-gradient(180deg,var(--brand-primary-hover),var(--brand-primary))] text-xs font-semibold text-white">你</div>
      ) : agent ? (
        <AgentAvatar agent={agent} />
      ) : null}
      <div className="flex-1 min-w-0">
        <div className={`mb-2 flex items-center gap-2 ${isUser ? 'justify-end' : ''}`}>
          <span className="text-xs font-semibold" style={{ color: isUser ? 'var(--brand-cream)' : (agent?.color || '#999') }}>
            {turn.agentName}
          </span>
          {turn.model ? <span className="chip chip-muted !px-2 !py-1 font-mono">{turn.model}</span> : null}
          {turn.stage && <span className="chip chip-muted !px-2 !py-1">{stageLabel(turn.stage)}</span>}
        </div>
        <div className={`rounded-[24px] border px-4 py-3 text-sm leading-7 break-words text-[var(--text-primary)] shadow-[var(--shadow-sm)] ${isUser ? 'rounded-tr-md border-[rgba(255,239,232,0.18)] bg-[linear-gradient(180deg,var(--brand-primary-hover),var(--brand-primary))] text-white' : 'rounded-tl-md border-[var(--border-secondary)] bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.025))]'}`}>
          {isUser ? (
            <div className="whitespace-pre-wrap">{turn.content}</div>
          ) : (
            <ChainMarkdown content={turn.content} />
          )}
          {turn.isStreaming && (
            <span className="inline-block w-1.5 h-4 bg-[var(--brand-primary)] ml-0.5 animate-pulse rounded-sm" />
          )}
        </div>
        {turn.error && <div className="mt-2 rounded-2xl border border-[rgba(251,113,133,0.22)] bg-[rgba(251,113,133,0.08)] px-3 py-2 text-[11px] text-[#ffbeca]">{turn.error}</div>}
        {!turn.isStreaming && turn.latencyMs > 0 && (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--text-tertiary)]">
            {turn.tokenCount ? `${turn.tokenCount} tokens · ` : ''}{turn.latencyMs}ms
          </div>
        )}
      </div>
    </div>
  );
}

// ===== Agent Config Card =====
function AgentCard({
  agent,
  onUpdate,
  onRemove,
  onEnhanceRole,
  enhancingRole,
}: {
  agent: ChainAgent;
  onUpdate: (a: ChainAgent) => void;
  onRemove: () => void;
  onEnhanceRole: () => void;
  enhancingRole: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const allModels = [
    ...MODEL_OPTIONS.claude,
    ...MODEL_OPTIONS.openai,
    ...MODEL_OPTIONS.gemini,
  ];

  return (
    <div className="group rounded-[22px] border border-[var(--border-secondary)] bg-[linear-gradient(180deg,rgba(20,27,39,0.94),rgba(10,14,22,0.94))] p-3">
      <div className="flex items-center gap-2">
        <AgentAvatar agent={agent} size="sm" />
        <input
          value={agent.name}
          onChange={(e) => onUpdate({ ...agent, name: e.target.value })}
          className="flex-1 min-w-0 bg-transparent text-xs font-medium text-[var(--text-primary)] outline-none"
          placeholder="智能体名称"
        />
        <button onClick={() => setExpanded(!expanded)} className="btn btn-ghost btn-icon border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] p-1 text-[10px]">
          {expanded ? '▲' : '▼'}
        </button>
        <button onClick={onRemove} className="btn btn-ghost btn-icon p-1 text-red-300 opacity-0 group-hover:opacity-100">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>
      {expanded && (
        <div className="mt-3 space-y-3 border-t border-[var(--border-secondary)] pt-3">
          <div>
            <label className="meta-label mb-2 block">模型</label>
            <select
              value={agent.model}
              onChange={(e) => onUpdate({ ...agent, model: e.target.value, provider: detectProvider(e.target.value) })}
              className="input text-[11px]"
            >
              {allModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="meta-label block">智能体描述（角色）</label>
              <button
                onClick={onEnhanceRole}
                disabled={enhancingRole || !agent.role.trim()}
                className="text-[11px] text-[var(--brand-secondary)] transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {enhancingRole ? '优化中...' : '✨ AI补全'}
              </button>
            </div>
            <textarea
              value={agent.role}
              onChange={(e) => onUpdate({ ...agent, role: e.target.value })}
              rows={3}
              placeholder="例如：全栈工程师，负责前后端实现与联调"
              className="input resize-none text-[11px]"
            />
          </div>
          <div>
            <label className="meta-label mb-2 block">任务目标（可选）</label>
            <textarea
              value={agent.task || ''}
              onChange={(e) => onUpdate({ ...agent, task: e.target.value })}
              rows={2}
              placeholder="例如：重点评估安全风险并给出优先级最高的3条修复建议"
              className="input resize-none text-[11px]"
            />
          </div>
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-[11px] text-[var(--text-tertiary)] transition hover:text-[var(--text-primary)]"
            >
              {showAdvanced ? '收起高级设置' : '高级设置'}
            </button>
            <span className="text-[11px] text-[var(--text-tertiary)]">默认: 安全沙箱 + 自动压缩</span>
          </div>
          {showAdvanced && (
            <div className="space-y-3 rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] p-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="meta-label mb-2 block">温度</label>
                  <input
                    type="number"
                    min={0} max={1} step={0.1}
                    value={agent.temperature}
                    onChange={(e) => onUpdate({ ...agent, temperature: parseFloat(e.target.value) || 0.6 })}
                    className="input text-[11px]"
                  />
                </div>
                <div>
                  <label className="meta-label mb-2 block">最大Token</label>
                  <input
                    type="number"
                    min={512} max={65536} step={256}
                    value={agent.maxTokens}
                    onChange={(e) => onUpdate({ ...agent, maxTokens: parseInt(e.target.value, 10) || 4096 })}
                    className="input text-[11px]"
                  />
                </div>
              </div>

              <div>
                <label className="meta-label mb-2 block">执行模式</label>
                <select
                  value={agent.sandboxMode || 'safe'}
                  onChange={(e) => onUpdate({ ...agent, sandboxMode: (e.target.value as 'safe' | 'project') })}
                  className="input text-[11px]"
                >
                  <option value="safe">安全沙箱（/tmp，每个智能体独立）</option>
                  <option value="project">项目模式（可改前端/后端文件）</option>
                </select>
              </div>

              <label className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={agent.autoCompress !== false}
                  onChange={(e) => onUpdate({ ...agent, autoCompress: e.target.checked })}
                />
                自动压缩会话上下文（避免长对话卡死）
              </label>

              <div>
                <label className="meta-label mb-2 block">工具权限（默认全开）</label>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_AGENT_TOOLS.map((tool) => {
                    const active = agent.tools.includes(tool.name);
                    return (
                      <button
                        key={tool.name}
                        onClick={() => {
                          const next = active
                            ? agent.tools.filter((t) => t !== tool.name)
                            : [...agent.tools, tool.name];
                          onUpdate({ ...agent, tools: next as AgentToolName[] });
                        }}
                        className={`px-2 py-1 rounded-xl text-[10px] transition border ${
                          active
                            ? 'bg-[var(--brand-primary-light)] border-[var(--border-primary)] text-[var(--text-primary)]'
                            : 'bg-[var(--bg-secondary)] border-[var(--border-secondary)] text-[var(--text-tertiary)] hover:border-[var(--border-hover)]'
                        }`}
                        title={tool.description}
                      >
                        {tool.icon} {tool.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ===== Create Discussion Dialog =====
function CreateDialog({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (topic: string, agents: ChainAgent[], rounds: number, workflowId?: string) => void;
}) {
  const [topic, setTopic] = useState('');
  const [agents, setAgents] = useState<ChainAgent[]>([]);
  const [rounds, setRounds] = useState(2);
  const [selectedWorkflow, setSelectedWorkflow] = useState('guided-collaboration');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftModel, setDraftModel] = useState(DEFAULT_PROVIDER_MODEL.openai);
  const [draftDescription, setDraftDescription] = useState('');
  const [draftTask, setDraftTask] = useState('');
  const [isOptimizingDraft, setIsOptimizingDraft] = useState(false);
  const [optimizingAgentId, setOptimizingAgentId] = useState<string | null>(null);

  const getKey = useApiKeyStore((s) => s.getKey);
  const baseUrls = useApiKeyStore((s) => s.baseUrls);
  const storedKeys = useApiKeyStore((s) => s.keys);
  const discoveredModels = useApiKeyStore((s) => s.discoveredModels);

  const allModels = Array.from(new Set([
    ...MODEL_OPTIONS.claude,
    ...MODEL_OPTIONS.openai,
    ...MODEL_OPTIONS.gemini,
    ...discoveredModels.claude,
    ...discoveredModels.openai,
    ...discoveredModels.gemini,
  ]));

  const buildRecommendedAgents = useCallback(() => {
    const configuredProviders = (['claude', 'openai', 'gemini'] as AIProvider[]).filter((provider) => Boolean(storedKeys[provider]));
    const discoveredPool = configuredProviders.length > 0
      ? configuredProviders.flatMap((provider) => discoveredModels[provider] || [])
      : [...discoveredModels.claude, ...discoveredModels.openai, ...discoveredModels.gemini];
    const models = discoveredPool.length > 0
      ? Array.from(new Set(discoveredPool))
      : collectAvailableModels(configuredProviders.length > 0 ? configuredProviders : ['claude', 'openai', 'gemini']);
    return buildGuidedWorkflowAgents(models).map((agent, index) => ({
      ...agent,
      id: genId('agent'),
      color: AGENT_COLORS[index % AGENT_COLORS.length],
    }));
  }, [discoveredModels, storedKeys]);

  useEffect(() => {
    if (agents.length > 0) return;
    setAgents(buildRecommendedAgents());
    setRounds(2);
  }, [agents.length, buildRecommendedAgents]);

  const getAnyCredentials = useCallback(async (): Promise<{ apiKey: string; provider: AIProvider; baseUrl: string } | null> => {
    const providers: AIProvider[] = ['claude', 'openai', 'gemini'];
    for (const p of providers) {
      const key = await getKey(p);
      if (key) {
        return { apiKey: key, provider: p, baseUrl: baseUrls[p] };
      }
    }
    return null;
  }, [getKey, baseUrls]);

  const runPromptEnhance = useCallback(async (description: string, task?: string) => {
    const creds = await getAnyCredentials();
    if (!creds) {
      throw new Error('请先在工作台配置可用模型密钥');
    }

    const prompt = `你是一位资深 AI Agent 系统提示词专家。

用户给出的智能体描述：${description}
用户补充任务：${task?.trim() || '无'}

请将这个简短描述扩写成真实研发场景可直接使用的「智能体角色设定」。要求：
1) 明确身份与职责边界；
2) 明确输入输出格式（给出结构化输出要求）；
3) 包含工程化约束（稳定性/可维护性/可验证）；
4) 包含协作要求（如何与其他智能体衔接）；
5) 中文输出，控制在 180-260 字；
6) 只输出最终角色设定正文，不要解释。`;

    let result = '';
    await streamChatRequest(
      {
        provider: creds.provider,
        model: creds.provider === 'claude' ? 'claude-sonnet-4-6' : DEFAULT_PROVIDER_MODEL.openai,
        apiKey: creds.apiKey,
        baseUrl: creds.baseUrl,
        systemPrompt: '你是提示词工程专家。',
        userPrompt: prompt,
        temperature: 0.4,
        maxTokens: 1024,
        effort: 'medium',
        enableMetaPrompt: false,
      },
      {
        onChunk: (chunk) => {
          if (chunk.type === 'text') {
            result += chunk.content;
          }
        },
      }
    );

    return result.trim() || description;
  }, [getAnyCredentials]);

  // Optimize topic prompt using AI
  const handleOptimize = useCallback(async () => {
    if (!topic.trim() || isOptimizing) return;
    setIsOptimizing(true);
    try {
      const creds = await getAnyCredentials();
      if (!creds) {
        setIsOptimizing(false);
        return;
      }

      const optimizePrompt = `你是一位专业的提示词工程师。请优化以下需求描述，使其：
1. 更加清晰和具体，包含必要的技术细节
2. 明确期望的输出和约束条件
3. 消除歧义，补充关键上下文
4. 保持简洁，不要过度冗长

请直接输出优化后的需求描述，不要解释。

原始需求：
${topic}`;

      let result = '';
      await streamChatRequest(
        {
          provider: creds.provider,
          model: creds.provider === 'claude' ? 'claude-sonnet-4-6' : DEFAULT_PROVIDER_MODEL.openai,
          apiKey: creds.apiKey,
          baseUrl: creds.baseUrl,
          systemPrompt: '你是提示词优化专家。',
          userPrompt: optimizePrompt,
          temperature: 0.5,
          maxTokens: 2048,
          effort: 'medium',
          enableMetaPrompt: false,
        },
        {
          onChunk: (chunk) => {
            if (chunk.type === 'text') {
              result += chunk.content;
              setTopic(result);
            }
          },
        }
      );
    } catch { /* ignore */ }
    setIsOptimizing(false);
  }, [topic, isOptimizing, getAnyCredentials]);

  const handleGenerateAgent = useCallback(() => {
    if (!draftDescription.trim()) return;
    const next = createAgentFromDraft({
      name: draftName,
      description: draftDescription,
      task: draftTask,
      model: draftModel,
      index: agents.length + 1,
    });
    setAgents((prev) => [...prev, next]);
    setDraftName('');
    setDraftDescription('');
    setDraftTask('');
  }, [draftName, draftDescription, draftTask, draftModel, agents.length]);

  const handleOptimizeDraft = useCallback(async () => {
    if (!draftDescription.trim() || isOptimizingDraft) return;
    setIsOptimizingDraft(true);
    try {
      const enhanced = await runPromptEnhance(draftDescription, draftTask);
      setDraftDescription(enhanced);
    } catch {
      // Keep original description on failure.
    }
    setIsOptimizingDraft(false);
  }, [draftDescription, draftTask, isOptimizingDraft, runPromptEnhance]);

  const handleEnhanceAgentRole = useCallback(async (agentId: string) => {
    const target = agents.find((a) => a.id === agentId);
    if (!target || !target.role.trim()) return;

    setOptimizingAgentId(agentId);
    try {
      const enhanced = await runPromptEnhance(target.role, target.task);
      setAgents((prev) => prev.map((a) => a.id === agentId ? { ...a, role: enhanced } : a));
    } catch {
      // Keep original role on failure.
    }
    setOptimizingAgentId(null);
  }, [agents, runPromptEnhance]);

  const updateAgent = (idx: number, a: ChainAgent) => {
    const next = [...agents];
    next[idx] = a;
    setAgents(next);
  };

  const removeAgent = (idx: number) => {
    setAgents(agents.filter((_, i) => i !== idx));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md animate-fade-in" onClick={onClose}>
      <div
        className="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-[36px] border border-[var(--border-secondary)] bg-[linear-gradient(180deg,rgba(18,16,20,0.98),rgba(8,8,10,0.98))] shadow-[var(--shadow-lg)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border-secondary)] px-6 py-5">
          <div>
            <div className="section-kicker">AI team setup</div>
            <h2 className="mt-4 text-2xl font-semibold text-[var(--text-primary)]">创建 AI 团队链式讨论</h2>
            <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">默认按“专业客服接待 → 方案选择 → 专家评审 → 总监派单 → 团队并行执行 → 交叉验证 → 汇报评分”运行，适合让小白也能跟上整个协作链路。</p>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon border border-[var(--border-secondary)] bg-[var(--bg-tertiary)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="meta-label">讨论主题 / 需求描述</label>
              <button
                onClick={handleOptimize}
                disabled={!topic.trim() || isOptimizing}
                className="text-[11px] text-[var(--brand-secondary)] transition disabled:cursor-not-allowed disabled:opacity-40 flex items-center gap-1"
              >
                {isOptimizing ? (
                  <><span className="w-3 h-3 border-2 border-[var(--brand-primary)] border-t-transparent rounded-full animate-spin" /> 优化中...</>
                ) : (
                  <><span>✨</span> AI优化提示词</>
                )}
              </button>
            </div>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={3}
              placeholder="描述你的需求，例如：设计一个高并发的订单系统，需要支持每秒10万笔交易..."
              className="input resize-none text-xs leading-7"
            />
          </div>

          {/* Workflow template selector */}
          <div>
            <label className="meta-label mb-3 block">工作流模板</label>
            <div className="grid gap-2 md:grid-cols-3">
              {[
                { id: 'guided-collaboration', name: '引导式协作', desc: '7阶段：需求→方案→评审→分配→执行→验证→报告' },
                { id: 'parallel-research', name: '并行研究', desc: '分解问题→多路并发调研→综合结论' },
                { id: 'code-review', name: '代码审查', desc: '代码分析→安全检查→性能评估→改进建议' },
              ].map((wf) => (
                <button
                  key={wf.id}
                  onClick={() => setSelectedWorkflow(wf.id)}
                  className={`rounded-[18px] border p-3 text-left transition ${
                    selectedWorkflow === wf.id
                      ? 'border-[var(--border-primary)] bg-[var(--brand-primary-soft)]'
                      : 'border-[var(--border-secondary)] bg-[var(--bg-tertiary)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  <div className="text-xs font-semibold text-[var(--text-primary)]">{wf.name}</div>
                  <div className="mt-1 text-[10px] leading-5 text-[var(--text-tertiary)]">{wf.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="meta-label mb-3 block">交叉验证深度</label>
            <div className="flex items-center gap-2">
              {[1, 2, 3].map((r) => (
                <button
                  key={r}
                  onClick={() => setRounds(r)}
                  className={`px-4 py-2 rounded-2xl text-xs transition ${
                    rounds === r
                      ? 'bg-[var(--brand-primary-light)] text-[var(--text-primary)] border border-[var(--border-primary)]'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-secondary)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  {r} 层
                </button>
              ))}
            </div>
            <p className="mt-2 text-[12px] leading-6 text-[var(--text-tertiary)]">用于决定最终交叉验证调用多少个审稿模型。一般 2 层即可兼顾速度与质量。</p>
            <p className="mt-2 text-[12px] leading-6 text-[var(--text-tertiary)]">当前推荐团队会优先使用已探测并缓存的真实可用模型；若还没有缓存，则回退到系统内置模型池。</p>
          </div>

          <div className="rounded-[28px] border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="meta-label">默认模型编组</div>
                <div className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">参考 OpenClaw Bot 的 control hub 逻辑，直接把免费模型线和 GPT 主力线排进默认团队。</div>
              </div>
              <span className="chip chip-warm">已预配置</span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {agents.filter((agent) => agent.workflowRole).slice(0, 6).map((agent) => (
                <div key={`lineup-${agent.id}`} className="rounded-[22px] border border-[var(--border-secondary)] bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-[var(--text-primary)]">{agent.name}</div>
                      <div className="mt-1 text-[12px] text-[var(--text-tertiary)]">{WORKFLOW_ROLE_LABELS[agent.workflowRole || 'director'] || '执行角色'}</div>
                    </div>
                    <span className={`chip !px-2 !py-1 ${isFreeFriendlyModel(agent.model) ? 'chip-cool' : 'chip-warm'}`}>
                      {isFreeFriendlyModel(agent.model) ? '免费/低成本' : '高性能'}
                    </span>
                  </div>
                  <div className="mt-3 font-mono text-[11px] text-[var(--text-tertiary)]">{agent.model}</div>
                  <div className="mt-3 text-[12px] leading-6 text-[var(--text-secondary)]">{describeModelFocus(agent.model)}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <label className="meta-label">添加智能体</label>
              <button
                onClick={() => {
                  setAgents(buildRecommendedAgents());
                }}
                className="text-[11px] text-[var(--brand-secondary)] transition hover:text-white"
              >
                一键重置为推荐团队
              </button>
            </div>
            <div className="rounded-[26px] border border-[var(--border-secondary)] bg-[linear-gradient(180deg,rgba(20,27,39,0.94),rgba(10,14,22,0.94))] p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="智能体名称（可选）"
                  className="input text-xs"
                />
                <select
                  value={draftModel}
                  onChange={(e) => setDraftModel(e.target.value)}
                  className="input text-xs"
                >
                  {allModels.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <textarea
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
                rows={3}
                placeholder="智能体描述，例如：全栈工程师，擅长 Next.js + Go，负责需求落地与联调"
                className="input resize-none text-xs"
              />

              <textarea
                value={draftTask}
                onChange={(e) => setDraftTask(e.target.value)}
                rows={2}
                placeholder="任务目标（可选），例如：优先输出可直接执行的改造步骤"
                className="input resize-none text-xs"
              />

              <div className="flex gap-2">
                <button
                  onClick={handleOptimizeDraft}
                  disabled={!draftDescription.trim() || isOptimizingDraft}
                  className="btn btn-secondary text-xs px-4 py-2 disabled:opacity-40"
                >
                  {isOptimizingDraft ? '优化中...' : '✨ AI补全描述'}
                </button>
                <button
                  onClick={handleGenerateAgent}
                  disabled={!draftDescription.trim()}
                  className="btn btn-primary text-xs px-4 py-2 disabled:opacity-40"
                >
                  生成智能体
                </button>
              </div>
            </div>

            <div className="mt-4 mb-3 flex items-center justify-between">
              <label className="meta-label">参与智能体 ({agents.length})</label>
            </div>
            <div className="space-y-2">
              {agents.length === 0 && (
                <div className="rounded-2xl border border-dashed border-[var(--border-secondary)] px-4 py-4 text-[12px] text-[var(--text-tertiary)]">
                  先生成至少一个智能体，然后开始讨论。
                </div>
              )}
              {agents.map((a, i) => (
                <AgentCard
                  key={a.id}
                  agent={a}
                  onUpdate={(updated) => updateAgent(i, updated)}
                  onRemove={() => removeAgent(i)}
                  onEnhanceRole={() => handleEnhanceAgentRole(a.id)}
                  enhancingRole={optimizingAgentId === a.id}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border-secondary)] px-6 py-4">
          <span className="text-[12px] text-[var(--text-tertiary)]">
            {agents.length} 个智能体 · {rounds} 层交叉验证 · 客服接待 / 专家评审 / 团队执行 / 汇报评分
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn btn-secondary text-xs px-4 py-2">取消</button>
            <button
              onClick={() => { if (topic.trim() && agents.length >= 1) onCreate(topic.trim(), agents, rounds, selectedWorkflow); }}
              disabled={!topic.trim() || agents.length < 1}
              className="btn btn-primary text-xs px-4 py-2 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              开始讨论
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== Main Chain Panel =====
export default function ChainPanel() {
  const {
    discussions, activeDiscussionId, globalAdaptiveProfile, loaded,
    loadDiscussions, createDiscussion,
    addTurn, updateTurn, setDiscussionStatus, setCurrentRound, updateDiscussion, setGlobalAdaptiveProfile, saveDiscussions,
  } = useChainStore();

  const getKey = useApiKeyStore((s) => s.getKey);
  const baseUrls = useApiKeyStore((s) => s.baseUrls);

  const [showCreate, setShowCreate] = useState(false);
  const [chainReply, setChainReply] = useState('');
  const [ratingDraft, setRatingDraft] = useState<ChainStageRatings>({ intake: 3, review: 3, delivery: 3 });
  const [ratingNote, setRatingNote] = useState('');
  const [autoCascadeRefresh, setAutoCascadeRefresh] = useState(true);
  const [autoRetryFailed, setAutoRetryFailed] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const rerunVerificationRef = useRef<((agent?: ChainAgent, opts?: { autoReport?: boolean; announce?: boolean }) => Promise<boolean>) | null>(null);
  const rerunFinalReportRef = useRef<((opts?: { announce?: boolean }) => Promise<boolean>) | null>(null);
  const userIsNearBottomRef = useRef(true);

  useEffect(() => {
    if (!loaded) loadDiscussions();
  }, [loaded, loadDiscussions]);

  // Track scroll position — only auto-scroll if user is near bottom (Gemini-style)
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 120;
    userIsNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  // Auto-scroll only when near bottom
  useEffect(() => {
    if (userIsNearBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [discussions, activeDiscussionId]);

  const activeDisc = discussions.find((d) => d.id === activeDiscussionId);

  useEffect(() => {
    setChainReply('');
    setRatingDraft({ intake: 3, review: 3, delivery: 3 });
    setRatingNote('');
  }, [activeDiscussionId, activeDisc?.stage]);

  // Get API key with provider fallback (same logic as ChatPanel)
  const getApiKeyWithFallback = useCallback(async (): Promise<{ key: string; provider: AIProvider; baseUrl: string } | null> => {
    const providers: AIProvider[] = ['claude', 'openai', 'gemini'];
    for (const p of providers) {
      const k = await getKey(p);
      if (k) return { key: k, provider: p, baseUrl: baseUrls[p] };
    }
    return null;
  }, [getKey, baseUrls]);

  const buildInternalHeaders = useCallback(async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      const token = await window.electronAPI?.getExecToken?.();
      if (token) headers['x-exec-token'] = token;
    } catch {
      // ignore
    }
    return headers;
  }, []);

  const ensureSandboxCwd = useCallback(async (discId: string, agentId: string) => {
    const dir = `/tmp/chainmind-agent-sandboxes/${discId}/${agentId}`;
    try {
      await fetch('/api/files', {
        method: 'POST',
        headers: await buildInternalHeaders(),
        body: JSON.stringify({ action: 'write', path: `${dir}/.chainmind-sandbox`, content: 'sandbox' }),
      });
    } catch {
      // fallback handled by tool executor if sandbox cannot be initialized.
    }
    return dir;
  }, [buildInternalHeaders]);

  const runStructuredTurn = useCallback(async (
    disc: ChainDiscussion,
    agent: ChainAgent,
    stage: ChainWorkflowStage | undefined,
    userPrompt: string,
    signal: AbortSignal,
    contextTurns: ChainTurn[],
  ): Promise<ChainTurn> => {
    const turnId = genId('turn');
    const preferredProvider = detectProvider(agent.model);
    const preferredKey = await getKey(preferredProvider);
    const creds = preferredKey
      ? { key: preferredKey, provider: preferredProvider, baseUrl: baseUrls[preferredProvider] }
      : await getApiKeyWithFallback();

    if (!creds) {
      const errorTurn: ChainTurn = {
        id: turnId,
        agentId: agent.id,
        agentName: agent.name,
        model: agent.model,
        content: '',
        tokenCount: 0,
        latencyMs: 0,
        error: '未找到可用 API 密钥，请先配置模型后重试。',
        isStreaming: false,
        timestamp: Date.now(),
        stage,
        role: 'assistant',
      };
      addTurn(disc.id, errorTurn);
      return errorTurn;
    }

    const runtimeProvider = creds.provider;
    const runtimeModel = runtimeProvider === preferredProvider
      ? agent.model
      : MODEL_OPTIONS[runtimeProvider][0] || agent.model;

    const turn: ChainTurn = {
      id: turnId,
      agentId: agent.id,
      agentName: agent.name,
      model: runtimeModel,
      content: '',
      tokenCount: 0,
      latencyMs: 0,
      isStreaming: true,
      timestamp: Date.now(),
      stage,
      role: 'assistant',
    };
    addTurn(disc.id, turn);

    const autoCompress = agent.autoCompress !== false;
    const contextWindow = buildContextWindow(contextTurns, autoCompress);
    const compressionHint = contextWindow.compressed
      ? '\n\n## 上下文说明\n历史上下文已自动压缩，请主动重复关键结论与待办，避免信息丢失。'
      : '';
    const contextBlock = contextWindow.text
      ? `\n\n## 已有上下文\n${contextWindow.text}${compressionHint}`
      : '';

    const toolCwd = agent.sandboxMode === 'project'
      ? undefined
      : await ensureSandboxCwd(disc.id, agent.id);

    const sandboxHint = agent.sandboxMode === 'project'
      ? '你当前运行在项目模式，可直接读写项目文件并执行项目内命令。'
      : `你当前运行在安全沙箱模式，仅允许在 ${toolCwd || '/tmp'} 下进行改动。`;

    const executionHint = `\n\n## 执行环境\n${sandboxHint}\n如需操控电脑，请优先使用工具调用块并给出可复现步骤。`;
    const systemPrompt = agent.tools.length > 0
      ? `${agent.role}${executionHint}${buildToolPrompt(agent.tools)}`
      : `${agent.role}${executionHint}`;

    const startTime = performance.now();

    try {
      let fullContent = '';
      let streamError = '';

      await streamChatRequest(
        {
          provider: runtimeProvider,
          model: runtimeModel,
          apiKey: creds.key,
          baseUrl: creds.baseUrl,
          systemPrompt,
          userPrompt: `${userPrompt}${contextBlock}`,
          temperature: agent.temperature,
          maxTokens: agent.maxTokens,
          effort: 'medium',
          enableMetaPrompt: false,
        },
        {
          signal,
          onChunk: (chunk) => {
            if (chunk.type === 'text' && chunk.content) {
              fullContent += chunk.content;
              updateTurn(disc.id, turnId, { content: fullContent });
            } else if (chunk.type === 'error' && chunk.content) {
              streamError = chunk.content;
            }
          },
        }
      );

      if (streamError) {
        const errorTurn = {
          ...turn,
          content: fullContent,
          error: streamError,
          isStreaming: false,
          latencyMs: Math.round(performance.now() - startTime),
        };
        updateTurn(disc.id, turnId, errorTurn);
        return errorTurn;
      }

      const latencyMs = Math.round(performance.now() - startTime);
      const toolCalls = parseToolCalls(fullContent);
      if (toolCalls.length > 0 && agent.tools.length > 0) {
        updateTurn(disc.id, turnId, { content: fullContent + '\n\n⏳ 正在执行工具调用...' });
        const { summary } = await executeAllTools(fullContent, agent.tools, toolCwd);
        if (summary) {
          fullContent += `\n\n---\n📋 **工具执行结果**\n\n${summary}`;
        }
      }

      const finalTurn: ChainTurn = { ...turn, content: fullContent, isStreaming: false, latencyMs };
      updateTurn(disc.id, turnId, { content: fullContent, isStreaming: false, latencyMs });
      return finalTurn;
    } catch (err: unknown) {
      if (signal.aborted) {
        updateTurn(disc.id, turnId, { content: turn.content || '(已中止)', isStreaming: false });
        throw err;
      }
      const errorMsg = err instanceof Error ? err.message : '未知错误';
      updateTurn(disc.id, turnId, { error: errorMsg, isStreaming: false, latencyMs: Math.round(performance.now() - startTime) });
      return { ...turn, error: errorMsg, isStreaming: false };
    }
  }, [addTurn, updateTurn, getKey, baseUrls, getApiKeyWithFallback, ensureSandboxCwd]);

  const runAgentTurn = useCallback(async (
    disc: ChainDiscussion,
    agent: ChainAgent,
    roundNum: number,
    contextTurns: ChainTurn[],
    signal: AbortSignal,
  ): Promise<ChainTurn> => {
    const taskSection = agent.task?.trim()
      ? `\n\n## 你的任务目标\n${agent.task.trim()}\n\n请优先围绕该任务输出，并保持可执行。`
      : '';

    const userPrompt = contextTurns.length > 0
      ? `## 讨论主题\n${disc.topic}\n\n## 当前是第 ${roundNum} 轮讨论\n${taskSection}\n\n请基于上下文继续讨论，并从你的角色角度给出观点、建议与可执行结论。`
      : `## 讨论主题\n${disc.topic}\n\n这是第一轮讨论。${taskSection}\n\n请从你的角色角度给出初始观点和分析。`;

    return runStructuredTurn(disc, agent, undefined, userPrompt, signal, contextTurns);
  }, [runStructuredTurn]);

  const executeGuidedDiscussion = useCallback(async (
    discId: string,
    reply?: string,
    ratings?: ChainStageRatings,
  ) => {
    const getLatestDiscussion = () => useChainStore.getState().discussions.find((item) => item.id === discId);
    let disc = getLatestDiscussion();
    if (!disc) return;

    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    const currentStage = disc.stage || 'intake';

    if (reply?.trim()) {
      addTurn(discId, createUserTurn(reply.trim(), currentStage));
    }

    const contextTurns = () => (getLatestDiscussion()?.turns || []).filter((turn) => turn.role !== 'system');
    const getAgent = (workflowRole: string, fallbackIndex = 0) => {
      const latest = getLatestDiscussion();
      return latest?.agents.find((item) => item.workflowRole === workflowRole) || latest?.agents[fallbackIndex];
    };

    try {
      if (currentStage === 'intake' || (currentStage === 'waiting_plan_selection' && reply && !parsePlanSelection(reply, disc.planOptions?.length || 3))) {
        updateDiscussion(discId, {
          status: 'running',
          stage: 'intake',
          pendingAction: null,
          currentRound: 1,
          planOptions: [],
          selectedPlanIndex: null,
          selectedPlanSummary: '',
          teamAssignments: [],
        });
        disc = getLatestDiscussion();
        if (!disc) return;

        const intakeAgent = getAgent('customer_service', 0);
        if (!intakeAgent) return;

        const adaptiveHint = buildAdaptiveStageHint(disc.adaptiveProfile, 'intake');
        const intakePrompt = `## 用户需求\n${disc.topic}\n\n你现在处在客服接待阶段。请完成以下目标：\n1. 先识别是否还缺关键信息；\n2. 给出 2-3 个编号方案；\n3. 逐项告诉小白每个方案适合什么情况、优缺点和大致成本；\n4. 使用清晰中文，尽量避免术语。${adaptiveHint}\n\n请严格使用以下结构输出：\n## 必要信息\n- 如无缺失就写“信息已足够，可直接选方案”。\n\n## 方案选项\n1. 方案名称\n- 适用场景：\n- 核心做法：\n- 给小白的解释：\n- 风险与代价：\n\n2. 方案名称 ...\n3. 方案名称 ...\n\n## 选择指引\n告诉用户回复 1 / 2 / 3，或者继续补充信息。`;

        const intakeTurn = await runStructuredTurn(disc, intakeAgent, 'intake', intakePrompt, signal, contextTurns());
        const planOptions = parsePlanOptions(intakeTurn.content);
        updateDiscussion(discId, {
          status: 'paused',
          stage: 'waiting_plan_selection',
          planOptions,
          pendingAction: {
            type: 'provide_info_or_select_plan',
            prompt: '请输入 1 / 2 / 3 选择方案，或者继续补充必要信息。',
            placeholder: '例如：2，或者补充你的限制条件/预算/技术栈。',
          },
        });
        saveDiscussions();
        return;
      }

      if (currentStage === 'waiting_plan_selection') {
        const latest = getLatestDiscussion();
        if (!latest || !reply?.trim()) return;
        const selected = parsePlanSelection(reply, latest.planOptions?.length || 3);
        if (!selected) return;

        const selectedPlan = latest.planOptions?.find((item) => item.index === selected);
        updateDiscussion(discId, {
          status: 'running',
          stage: 'expert_review',
          pendingAction: null,
          selectedPlanIndex: selected,
          selectedPlanSummary: selectedPlan?.summary || `用户选择了方案 ${selected}`,
          currentRound: 2,
        });

        const refreshed = getLatestDiscussion();
        if (!refreshed) return;
        const expertAgent = getAgent('solution_expert', 1);
        const directorAgent = getAgent('director', 2);
        const reporterAgent = getAgent('reporter', refreshed.agents.length - 1);
        if (!expertAgent || !directorAgent || !reporterAgent) return;

        const reviewHint = buildAdaptiveStageHint(refreshed.adaptiveProfile, 'review');
        const reviewPrompt = `## 用户原始需求\n${refreshed.topic}\n\n## 用户已选择方案\n${selectedPlan?.summary || `方案 ${selected}`}\n\n你现在处在专家评审阶段。请：\n1. 评审这个方案是否合理；\n2. 补齐遗漏的前提、风险、依赖与边界条件；\n3. 告诉小白为什么这样改更稳妥；\n4. 输出最终建议方案。${reviewHint}`;
        await runStructuredTurn(refreshed, expertAgent, 'expert_review', reviewPrompt, signal, contextTurns());

        const afterReview = getLatestDiscussion();
        if (!afterReview) return;
        const assignments = buildExecutionAssignments(afterReview.agents, afterReview.selectedPlanSummary || afterReview.topic);
        updateDiscussion(discId, { stage: 'team_assignment', teamAssignments: assignments, currentRound: 3 });

        const assignmentPrompt = `## 当前方案\n${afterReview.selectedPlanSummary || afterReview.topic}\n\n你是团队总监，请根据当前方案与模型特性确认团队分工。系统建议的分工如下：\n\n${formatAssignmentList(assignments)}\n\n请输出：\n1. 你确认后的任务分配；\n2. 每个角色为什么这样分工；\n3. 任务执行优先级；\n4. 你预计最终交付包含哪些内容。`;
        await runStructuredTurn(afterReview, directorAgent, 'team_assignment', assignmentPrompt, signal, contextTurns());

        const afterAssignment = getLatestDiscussion();
        if (!afterAssignment) return;
        updateDiscussion(discId, { stage: 'team_execution', currentRound: 4 });

        const assignmentMap = afterAssignment.teamAssignments || assignments;
        const executionAgents = assignmentMap
          .map((assignment) => afterAssignment.agents.find((item) => item.id === assignment.agentId))
          .filter((item): item is ChainAgent => Boolean(item));

        await Promise.all(executionAgents.map((agent) => {
          const assignment = assignmentMap.find((item) => item.agentId === agent.id);
          return runStructuredTurn(afterAssignment, agent, 'team_execution', buildAssignmentExecutionPrompt(afterAssignment, assignment, agent), signal, contextTurns());
        }));

        const afterExecution = getLatestDiscussion();
        if (!afterExecution) return;
        const verifierAgents = afterExecution.agents.filter((item) => item.workflowRole === 'verifier_a' || item.workflowRole === 'verifier_b');
        const verifierCount = Math.max(1, Math.min(afterExecution.rounds || 1, verifierAgents.length || 1));
        for (const verifier of verifierAgents.slice(0, verifierCount)) {
          await runStructuredTurn(afterExecution, verifier, 'team_execution', buildVerificationPrompt(afterExecution), signal, contextTurns());
        }

        const afterVerify = getLatestDiscussion();
        if (!afterVerify) return;
        updateDiscussion(discId, { stage: 'report', currentRound: 5 });
        await runStructuredTurn(afterVerify, reporterAgent, 'report', buildStructuredReportPrompt(afterVerify), signal, contextTurns());

        updateDiscussion(discId, {
          status: 'paused',
          stage: 'waiting_rating',
          pendingAction: createRatingPendingAction(),
          currentRound: 6,
        });
        saveDiscussions();
        return;
      }

      if (currentStage === 'waiting_rating') {
        const latest = getLatestDiscussion();
        if (!latest) return;
        const parsedRatings = ratings || (reply ? parseStageRatings(reply) : null);
        if (!parsedRatings) {
          addTurn(discId, createSystemTurn('请按“环节1 环节2 环节3”的顺序给出 1-3 分，例如：3 2 3。', 'waiting_rating'));
          saveDiscussions();
          return;
        }

        const nextProfile = mergeAdaptiveProfile(globalAdaptiveProfile, {
          ...parsedRatings,
          notes: ratings?.notes,
        });
        updateDiscussion(discId, {
          adaptiveProfile: nextProfile,
          ratingHistory: [...(latest.ratingHistory || []), { ...parsedRatings, notes: ratings?.notes }],
          pendingAction: null,
          stage: 'completed',
          status: 'completed',
        });
        setGlobalAdaptiveProfile(nextProfile);

        addTurn(discId, createSystemTurn(
          `已记录评分：客服 ${parsedRatings.intake} 分 / 评审 ${parsedRatings.review} 分 / 交付 ${parsedRatings.delivery} 分。\n\n后续我会按以下方向自动调整：\n- ${nextProfile.notes.join('\n- ')}`,
          'completed',
          parsedRatings,
        ));
        saveDiscussions();
      }
    } catch {
      if (abortRef.current?.signal.aborted) {
        setDiscussionStatus(discId, 'paused');
      } else {
        setDiscussionStatus(discId, 'error');
      }
      saveDiscussions();
    }
  }, [addTurn, getKey, baseUrls, getApiKeyWithFallback, globalAdaptiveProfile, runStructuredTurn, saveDiscussions, setDiscussionStatus, setGlobalAdaptiveProfile, updateDiscussion]);

  const executeLegacyChain = useCallback(async (discId: string) => {
    const disc = useChainStore.getState().discussions.find((d) => d.id === discId);
    if (!disc) return;

    abortRef.current = new AbortController();
    setDiscussionStatus(discId, 'running');

    try {
      const allTurns: ChainTurn[] = [];

      for (let round = 1; round <= (disc.rounds ?? disc.totalRounds); round++) {
        setCurrentRound(discId, round);

        for (const agent of disc.agents) {
          if (abortRef.current.signal.aborted) throw new Error('aborted');

          const resultTurn = await runAgentTurn(disc, agent, round, allTurns, abortRef.current.signal);
          if (!resultTurn.error) {
            allTurns.push(resultTurn);
          }
        }
      }

      setDiscussionStatus(discId, 'completed');
    } catch {
      if (abortRef.current?.signal.aborted) {
        setDiscussionStatus(discId, 'paused');
      } else {
        setDiscussionStatus(discId, 'error');
      }
    }

    saveDiscussions();
  }, [runAgentTurn, saveDiscussions, setDiscussionStatus, setCurrentRound]);

  const executeChain = useCallback(async (discId: string, reply?: string, ratings?: ChainStageRatings) => {
    const disc = useChainStore.getState().discussions.find((d) => d.id === discId);
    if (!disc) return;
    if ((disc.workflow || 'legacy-roundtable') === 'guided-collaboration') {
      await executeGuidedDiscussion(discId, reply, ratings);
      return;
    }
    await executeLegacyChain(discId);
  }, [executeGuidedDiscussion, executeLegacyChain]);

  // New execution engine hook
  const engine = useExecutionEngine();

  const handleCreate = useCallback(async (topic: string, agents: ChainAgent[], rounds: number, workflowId?: string) => {
    const id = createDiscussion(topic.slice(0, 30), topic, agents, rounds, 'sequential');
    setShowCreate(false);

    // If using a non-default workflow, run through the new execution engine
    if (workflowId && workflowId !== 'guided-collaboration') {
      // Collect API keys
      const apiKeys: Record<string, string> = {};
      const providers = ['claude', 'openai', 'gemini'] as const;
      for (const p of providers) {
        const key = await getKey(p);
        if (key) apiKeys[p] = key;
      }
      engine.execute(id, workflowId, topic, apiKeys).catch(() => {});
    } else {
      setTimeout(() => executeChain(id), 100);
    }
  }, [createDiscussion, executeChain, engine, getKey]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const STATUS_LABELS: Record<ChainDiscussion['status'], { text: string; color: string }> = {
    idle: { text: '待开始', color: 'text-[var(--text-tertiary)]' },
    running: { text: '讨论中', color: 'text-cyan-400' },
    paused: { text: '已暂停', color: 'text-amber-400' },
    completed: { text: '已完成', color: 'text-emerald-400' },
    error: { text: '出错', color: 'text-red-400' },
  };

  // Empty state
  if (!activeDisc) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-8 text-center animate-fade-in">
        <div className="panel-shell w-full max-w-3xl rounded-[30px] p-6 md:p-8">
          <div className="section-kicker justify-center">AI team workflow</div>
          <h3 className="font-display mt-5 text-4xl text-[var(--text-primary)]">把复杂问题交给 AI 团队链路推进</h3>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
            适合先由专业客服帮你梳理需求，再由专家评审、团队执行、交叉验证和最终汇报，尤其适合小白用户一步步推进复杂任务。
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <span className="chip chip-cool">编号选方案</span>
            <span className="chip chip-muted">模型分工</span>
            <span className="chip">交叉验证</span>
          </div>
          <button onClick={() => setShowCreate(true)} className="btn btn-primary mt-8 px-6 py-3 text-sm">
            创建链式讨论
          </button>
        </div>
        {showCreate && <CreateDialog onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
      </div>
    );
  }

  const statusInfo = STATUS_LABELS[activeDisc.status];
  const isGuidedWorkflow = (activeDisc.workflow || 'legacy-roundtable') === 'guided-collaboration';
  const activeStageLabel = stageLabel(activeDisc.stage);
  const workflowStages: ChainWorkflowStage[] = ['intake', 'expert_review', 'team_assignment', 'team_execution', 'report', 'waiting_rating', 'completed'];
  const currentStageIndex = activeDisc.stage ? workflowStages.indexOf(activeDisc.stage) : -1;

  const handleSendReply = async () => {
    if (!activeDisc || !chainReply.trim()) return;
    const content = chainReply.trim();
    setChainReply('');
    await executeChain(activeDisc.id, content);
  };

  const handleSubmitRatings = async () => {
    if (!activeDisc) return;
    const replyText = `${ratingDraft.intake} ${ratingDraft.review} ${ratingDraft.delivery}${ratingNote.trim() ? `\n${ratingNote.trim()}` : ''}`;
    setRatingNote('');
    await executeChain(activeDisc.id, replyText, { ...ratingDraft, notes: ratingNote.trim() || undefined });
  };

  const handleRestartDiscussion = async () => {
    if (!activeDisc) return;
    if (isGuidedWorkflow) {
      updateDiscussion(activeDisc.id, {
        turns: [],
        stage: 'intake',
        pendingAction: null,
        planOptions: [],
        selectedPlanIndex: null,
        selectedPlanSummary: '',
        teamAssignments: [],
        currentRound: 0,
        status: 'idle',
      });
      await executeChain(activeDisc.id);
      return;
    }
    await executeChain(activeDisc.id);
  };

  const runAgentStageWithRetry = useCallback(async (
    disc: ChainDiscussion,
    agent: ChainAgent,
    stage: ChainWorkflowStage,
    prompt: string,
    signal: AbortSignal,
    retryLabel: string,
  ) => {
    const maxAttempts = autoRetryFailed ? 2 : 1;
    let lastTurn: ChainTurn | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const latest = useChainStore.getState().discussions.find((item) => item.id === disc.id) || disc;
      lastTurn = await runStructuredTurn(
        latest,
        agent,
        stage,
        prompt,
        signal,
        latest.turns.filter((turn) => turn.role !== 'system')
      );

      if (!lastTurn.error) {
        if (attempt > 1) {
          addTurn(disc.id, createSystemTurn(`${retryLabel} 已在第 ${attempt} 次尝试后恢复成功。`, stage));
        }
        return { ok: true, turn: lastTurn };
      }

      if (attempt < maxAttempts) {
        addTurn(disc.id, createSystemTurn(`${retryLabel} 失败，系统自动重试第 ${attempt + 1} 次。`, stage));
      }
    }

    return { ok: false, turn: lastTurn };
  }, [addTurn, autoRetryFailed, runStructuredTurn]);

  const rerunExecutionAssignment = useCallback(async (assignment: ChainTeamAssignment, opts?: { cascade?: boolean; announce?: boolean }) => {
    const disc = useChainStore.getState().discussions.find((item) => item.id === activeDiscussionId);
    if (!disc) return false;
    const agent = disc.agents.find((item) => item.id === assignment.agentId);
    if (!agent) return false;

    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    const shouldCascade = opts?.cascade ?? autoCascadeRefresh;
    if (opts?.announce !== false) {
      addTurn(disc.id, createSystemTurn(`已触发任务重跑：${assignment.agentName}。${shouldCascade ? '系统会在完成后自动刷新下游验证与最终汇报。' : '完成后可手动刷新交叉验证与最终汇报。'}`, 'team_execution'));
    }
    updateDiscussion(disc.id, { status: 'running', stage: 'team_execution', pendingAction: null });

    try {
      const latest = useChainStore.getState().discussions.find((item) => item.id === disc.id) || disc;
      const result = await runAgentStageWithRetry(
        latest,
        agent,
        'team_execution',
        buildAssignmentExecutionPrompt(latest, assignment, agent),
        signal,
        `任务 ${assignment.agentName}`
      );
      if (!result.ok) {
        setDiscussionStatus(disc.id, 'error');
        return false;
      }

      if (shouldCascade) {
        addTurn(disc.id, createSystemTurn(`任务 ${assignment.agentName} 已重跑完成，系统将自动刷新交叉验证与最终汇报。`, 'team_execution'));
        const verified = await rerunVerificationRef.current?.(undefined, { autoReport: true, announce: false });
        return Boolean(verified);
      } else {
        updateDiscussion(disc.id, { status: 'paused', stage: 'team_execution', pendingAction: null });
        addTurn(disc.id, createSystemTurn(`任务 ${assignment.agentName} 已重跑完成。建议你再点击“重跑此环节”更新交叉验证与最终汇报。`, 'team_execution'));
        return true;
      }
    } catch {
      if (abortRef.current?.signal.aborted) {
        updateDiscussion(disc.id, { status: 'paused', stage: 'team_execution', pendingAction: null });
      } else {
        setDiscussionStatus(disc.id, 'error');
      }
      return false;
    } finally {
      saveDiscussions();
    }
  }, [activeDiscussionId, addTurn, autoCascadeRefresh, runAgentStageWithRetry, saveDiscussions, setDiscussionStatus, updateDiscussion]);

  const rerunVerification = useCallback(async (agent?: ChainAgent, opts?: { autoReport?: boolean; announce?: boolean }) => {
    const disc = useChainStore.getState().discussions.find((item) => item.id === activeDiscussionId);
    if (!disc) return false;

    const verifierAgents = agent
      ? [agent]
      : disc.agents.filter((item) => item.workflowRole === 'verifier_a' || item.workflowRole === 'verifier_b');
    if (verifierAgents.length === 0) return false;

    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    if (opts?.announce !== false) {
      addTurn(disc.id, createSystemTurn(`已触发交叉验证重跑：${agent ? agent.name : '全部验证模型'}。${opts?.autoReport ? '完成后会自动重生最终汇报。' : '完成后建议重新生成最终汇报。'}`, 'team_execution'));
    }
    updateDiscussion(disc.id, { status: 'running', stage: 'team_execution', pendingAction: null });

    try {
      for (const verifier of verifierAgents) {
        const latest = useChainStore.getState().discussions.find((item) => item.id === disc.id) || disc;
        const result = await runAgentStageWithRetry(
          latest,
          verifier,
          'team_execution',
          buildVerificationPrompt(latest),
          signal,
          `交叉验证 ${verifier.name}`
        );
        if (!result.ok) {
          setDiscussionStatus(disc.id, 'error');
          return false;
        }
      }
      if (opts?.autoReport) {
        addTurn(disc.id, createSystemTurn('交叉验证已更新，系统将自动重生最终汇报。', 'report'));
        const reported = await rerunFinalReportRef.current?.({ announce: false });
        return Boolean(reported);
      } else {
        updateDiscussion(disc.id, { status: 'paused', stage: 'report', pendingAction: null });
        addTurn(disc.id, createSystemTurn('交叉验证已更新。建议点击“重跑此环节”重新生成最终汇报。', 'report'));
        return true;
      }
    } catch {
      if (abortRef.current?.signal.aborted) {
        updateDiscussion(disc.id, { status: 'paused', stage: 'team_execution', pendingAction: null });
      } else {
        setDiscussionStatus(disc.id, 'error');
      }
      return false;
    } finally {
      saveDiscussions();
    }
  }, [activeDiscussionId, addTurn, runAgentStageWithRetry, saveDiscussions, setDiscussionStatus, updateDiscussion]);

  const rerunFinalReport = useCallback(async (opts?: { announce?: boolean }) => {
    const disc = useChainStore.getState().discussions.find((item) => item.id === activeDiscussionId);
    if (!disc) return false;
    const reporter = disc.agents.find((item) => item.workflowRole === 'reporter');
    if (!reporter) return false;

    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    if (opts?.announce !== false) {
      addTurn(disc.id, createSystemTurn('已触发最终汇报重跑。系统会按最新执行结果重新整理交付说明。', 'report'));
    }
    updateDiscussion(disc.id, { status: 'running', stage: 'report', pendingAction: null });

    try {
      const latest = useChainStore.getState().discussions.find((item) => item.id === disc.id) || disc;
      const result = await runAgentStageWithRetry(
        latest,
        reporter,
        'report',
        buildStructuredReportPrompt(latest),
        signal,
        `最终汇报 ${reporter.name}`
      );
      if (!result.ok) {
        setDiscussionStatus(disc.id, 'error');
        return false;
      }

      const refreshed = useChainStore.getState().discussions.find((item) => item.id === disc.id) || latest;
      if ((refreshed.ratingHistory?.length || 0) > 0) {
        updateDiscussion(disc.id, { status: 'completed', stage: 'completed', pendingAction: null });
      } else {
        updateDiscussion(disc.id, { status: 'paused', stage: 'waiting_rating', pendingAction: createRatingPendingAction() });
      }
      return true;
    } catch {
      if (abortRef.current?.signal.aborted) {
        updateDiscussion(disc.id, { status: 'paused', stage: 'report', pendingAction: null });
      } else {
        setDiscussionStatus(disc.id, 'error');
      }
      return false;
    } finally {
      saveDiscussions();
    }
  }, [activeDiscussionId, addTurn, runAgentStageWithRetry, saveDiscussions, setDiscussionStatus, updateDiscussion]);

  useEffect(() => {
    rerunVerificationRef.current = rerunVerification;
    rerunFinalReportRef.current = rerunFinalReport;
  }, [rerunVerification, rerunFinalReport]);

  const rerunFailedOnly = useCallback(async () => {
    const disc = useChainStore.getState().discussions.find((item) => item.id === activeDiscussionId);
    if (!disc) return;

    const failedAssignments = (disc.teamAssignments || []).filter((assignment) => {
      const turn = getLatestAgentTurn(disc.turns, assignment.agentId, 'team_execution');
      return Boolean(turn?.error);
    });
    const failedVerifiers = disc.agents.filter((agent) => {
      if (agent.workflowRole !== 'verifier_a' && agent.workflowRole !== 'verifier_b') return false;
      const turn = getLatestAgentTurn(disc.turns, agent.id, 'team_execution');
      return Boolean(turn?.error);
    });
    const reporter = disc.agents.find((agent) => agent.workflowRole === 'reporter');
    const failedReport = reporter ? getLatestAgentTurn(disc.turns, reporter.id, 'report')?.error : false;

    if (failedAssignments.length === 0 && failedVerifiers.length === 0 && !failedReport) {
      addTurn(disc.id, createSystemTurn('当前没有失败项，无需重跑失败任务。', disc.stage));
      saveDiscussions();
      return;
    }

    addTurn(disc.id, createSystemTurn('开始仅重跑失败项。', 'team_execution'));

    for (const assignment of failedAssignments) {
      const ok = await rerunExecutionAssignment(assignment, { cascade: false, announce: false });
      if (!ok) {
        addTurn(disc.id, createSystemTurn(`失败项重跑中断：${assignment.agentName} 仍未恢复成功。`, 'team_execution'));
        saveDiscussions();
        return;
      }
    }

    for (const agent of failedVerifiers) {
      const ok = await rerunVerification(agent, { autoReport: false, announce: false });
      if (!ok) {
        addTurn(disc.id, createSystemTurn(`失败项重跑中断：${agent.name} 验证仍未恢复成功。`, 'team_execution'));
        saveDiscussions();
        return;
      }
    }

    if (failedReport) {
      const ok = await rerunFinalReport({ announce: false });
      if (!ok) {
        addTurn(disc.id, createSystemTurn('失败项重跑中断：最终汇报仍未恢复成功。', 'report'));
        saveDiscussions();
        return;
      }
    }

    addTurn(disc.id, createSystemTurn('失败项重跑完成。', failedReport ? 'report' : 'team_execution'));
    saveDiscussions();
  }, [activeDiscussionId, addTurn, rerunExecutionAssignment, rerunFinalReport, rerunVerification, saveDiscussions]);

  const refreshDownstreamChain = useCallback(async () => {
    const disc = useChainStore.getState().discussions.find((item) => item.id === activeDiscussionId);
    if (!disc) return;

    addTurn(disc.id, createSystemTurn('开始刷新整条下游链路：执行任务 -> 交叉验证 -> 最终汇报。', 'team_execution'));

    for (const assignment of disc.teamAssignments || []) {
      const ok = await rerunExecutionAssignment(assignment, { cascade: false, announce: false });
      if (!ok) {
        addTurn(disc.id, createSystemTurn(`下游链路刷新中断：${assignment.agentName} 执行失败。`, 'team_execution'));
        saveDiscussions();
        return;
      }
    }

    const verificationOk = await rerunVerification(undefined, { autoReport: false, announce: false });
    if (!verificationOk) {
      addTurn(disc.id, createSystemTurn('下游链路刷新中断：交叉验证失败。', 'team_execution'));
      saveDiscussions();
      return;
    }

    const reportOk = await rerunFinalReport({ announce: false });
    if (!reportOk) {
      addTurn(disc.id, createSystemTurn('下游链路刷新中断：最终汇报生成失败。', 'report'));
      saveDiscussions();
      return;
    }

    addTurn(disc.id, createSystemTurn('整条下游链路已刷新完成。', 'report'));
    saveDiscussions();
  }, [activeDiscussionId, addTurn, rerunExecutionAssignment, rerunFinalReport, rerunVerification, saveDiscussions]);

  return (
    <div className="flex flex-1 flex-col min-h-0 animate-fade-in">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-[var(--border-secondary)] px-5 py-4">
        <div className="flex items-center gap-3">
            <div className="glass-light flex h-11 w-11 items-center justify-center rounded-2xl border-[var(--border-secondary)] text-[var(--brand-cream)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 7h4v4H7z" />
              <path d="M13 13h4v4h-4z" />
              <path d="M11 9h2" />
              <path d="M9 11v2" />
              <path d="M15 13v-2" />
            </svg>
          </div>
          <div>
            <div className="meta-label">AI team thread</div>
            <div className="mt-1 text-sm font-medium text-[var(--text-primary)]">{activeDisc.topic.slice(0, 60)}{activeDisc.topic.length > 60 ? '...' : ''}</div>
            <div className="mt-2 flex items-center gap-2 text-[11px]">
              <span className={`chip chip-muted !px-2 !py-1 ${statusInfo.color}`}>{statusInfo.text}</span>
              {isGuidedWorkflow && <span className="chip chip-cool !px-2 !py-1">{activeStageLabel}</span>}
              <span className="text-[var(--text-tertiary)]">
                {activeDisc.agents.length} 个智能体 · {activeDisc.turns.length} 条发言{isGuidedWorkflow ? ` · ${activeDisc.ratingHistory?.length || 0} 次评分` : ` · 第 ${activeDisc.currentRound}/${activeDisc.rounds} 轮`}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeDisc.status === 'running' && (
            <button onClick={handleStop} className="btn btn-danger text-xs px-3 py-2">
              停止
            </button>
          )}
          {(activeDisc.status === 'completed' || activeDisc.status === 'error' || (!isGuidedWorkflow && activeDisc.status === 'paused')) && (
            <button onClick={() => { handleRestartDiscussion().catch(() => {}); }} className="btn btn-secondary text-xs px-3 py-2 text-[var(--text-primary)]">
              重新开始
            </button>
          )}
          <button onClick={() => setShowCreate(true)} className="btn btn-primary text-xs px-4 py-2">
            新讨论
          </button>
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2 overflow-x-auto border-b border-[var(--border-secondary)] px-5 py-3">
        {activeDisc.agents.map((a) => (
          <div key={a.id} className="flex flex-shrink-0 items-center gap-2 rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] px-3 py-2">
            <span className="text-xs">{a.icon}</span>
            <span className="text-[11px] text-[var(--text-primary)]">{a.name}</span>
            <span className="font-mono text-[10px] text-[var(--text-tertiary)]">{a.model.split('-').slice(-2).join('-')}</span>
          </div>
        ))}
      </div>

      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
          <div className="rounded-[28px] border border-[var(--border-secondary)] bg-[linear-gradient(180deg,var(--bg-secondary),var(--bg-primary))] p-5 backdrop-blur-2xl">
            <div className="meta-label mb-2 text-[var(--brand-secondary)]">讨论主题</div>
            <div className="whitespace-pre-wrap text-sm leading-7 text-[var(--text-primary)]">{activeDisc.topic}</div>
          </div>

          {isGuidedWorkflow && (
            <div className="rounded-[24px] border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="meta-label">协作流程</div>
                  <div className="mt-1 text-sm text-[var(--text-secondary)]">从客服接待到交付评分的全链路</div>
                </div>
                <span className="chip chip-cool !px-2 !py-1">当前：{activeStageLabel}</span>
              </div>
              <div className="flex items-center gap-0 overflow-x-auto pb-1">
                {workflowStages.map((stage, index) => {
                  const active = stage === activeDisc.stage;
                  const completed = currentStageIndex >= 0 && index < currentStageIndex;
                  return (
                    <React.Fragment key={stage}>
                      {index > 0 && (
                        <div className={`h-[2px] flex-1 min-w-[12px] transition-colors ${completed ? 'bg-[var(--brand-primary)]' : 'bg-white/10'}`} />
                      )}
                      <div className={`flex flex-col items-center gap-1.5 flex-shrink-0 px-1`}>
                        <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-[11px] font-bold transition-all ${
                          active ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white scale-110 shadow-[0_0_12px_rgba(255,107,87,0.4)]'
                          : completed ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]'
                          : 'border-white/15 bg-transparent text-[var(--text-tertiary)]'
                        }`}>
                          {completed ? '✓' : index + 1}
                        </div>
                        <span className={`text-[10px] text-center leading-tight max-w-[64px] ${active ? 'text-[var(--brand-cream)] font-semibold' : completed ? 'text-[var(--text-secondary)]' : 'text-[var(--text-tertiary)]'}`}>
                          {stageLabel(stage)}
                        </span>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}

          {isGuidedWorkflow && activeDisc.pendingAction && (
            <div className="rounded-[24px] border border-[var(--border-primary)] bg-[var(--brand-primary-soft)] px-5 py-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="chip chip-cool !px-2 !py-1">当前动作</span>
                <span className="chip chip-muted !px-2 !py-1">{activeStageLabel}</span>
              </div>
              <div className="text-sm leading-7 text-[var(--text-secondary)]">{formatPendingPrompt(activeDisc.pendingAction)}</div>
            </div>
          )}

          {activeDisc?.pendingAction?.type === 'approval' && (
            <HumanApprovalCard
              stageId={activeDisc.stage}
              stageName={activeDisc.pendingAction.prompt || '审批'}
              agentName="系统"
              output={activeDisc.turns[activeDisc.turns.length - 1]?.content || ''}
              onApprove={(stageId) => {
                engine.approve(stageId);
              }}
              onEdit={(stageId, edited) => {
                console.log('Edited stage:', stageId, edited);
              }}
              onReject={(stageId, feedback) => {
                engine.reject(stageId, feedback);
              }}
            />
          )}

          {/* New engine approval gate */}
          {engine.state.pendingApproval && (
            <HumanApprovalCard
              stageId={engine.state.pendingApproval.stageId}
              stageName={`阶段审批: ${engine.state.pendingApproval.stageId}`}
              agentName="执行引擎"
              output={engine.state.pendingApproval.output}
              onApprove={(stageId) => engine.approve(stageId)}
              onEdit={() => {}}
              onReject={(stageId, feedback) => engine.reject(stageId, feedback)}
            />
          )}

          {isGuidedWorkflow && activeDisc.selectedPlanSummary && (
            <div className="rounded-[24px] border border-[var(--border-primary)] bg-[var(--brand-primary-soft)] p-5">
              <div className="mb-2 flex items-center gap-2">
                <span className="chip chip-cool !px-2 !py-1">已选方案</span>
                {activeDisc.selectedPlanIndex ? <span className="chip chip-muted !px-2 !py-1">方案 {activeDisc.selectedPlanIndex}</span> : null}
              </div>
              <div className="whitespace-pre-wrap text-sm leading-7 text-[var(--text-secondary)]">{activeDisc.selectedPlanSummary}</div>
            </div>
          )}

          {isGuidedWorkflow && globalAdaptiveProfile.count > 0 && (
            <div className="rounded-[24px] border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] p-5">
              <div className="mb-3 flex items-center gap-2">
                <span className="chip chip-cool !px-2 !py-1">全局偏好记忆</span>
                <span className="text-[11px] text-[var(--text-tertiary)]">新讨论会自动继承这些调优方向</span>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="panel-card-muted p-4 text-center">
                  <div className="meta-label">客服阶段</div>
                  <div className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">{globalAdaptiveProfile.intakeAvg.toFixed(1)}</div>
                </div>
                <div className="panel-card-muted p-4 text-center">
                  <div className="meta-label">评审阶段</div>
                  <div className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">{globalAdaptiveProfile.reviewAvg.toFixed(1)}</div>
                </div>
                <div className="panel-card-muted p-4 text-center">
                  <div className="meta-label">交付阶段</div>
                  <div className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">{globalAdaptiveProfile.deliveryAvg.toFixed(1)}</div>
                </div>
              </div>
              {globalAdaptiveProfile.notes.length > 0 && (
                <div className="mt-4 rounded-[20px] border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] px-4 py-3 text-sm leading-7 text-[var(--text-secondary)]">
                  {globalAdaptiveProfile.notes.map((note, index) => (
                    <div key={`${note}-${index}`}>- {note}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {isGuidedWorkflow && activeDisc.teamAssignments && activeDisc.teamAssignments.length > 0 && (
            <GuidedTaskBoard
              disc={activeDisc}
              onRerunAssignment={(assignment) => { rerunExecutionAssignment(assignment).catch(() => {}); }}
              onRerunVerification={(agent) => { rerunVerification(agent).catch(() => {}); }}
              onRerunReport={() => { rerunFinalReport().catch(() => {}); }}
              onRerunFailedOnly={() => { rerunFailedOnly().catch(() => {}); }}
              onRefreshDownstream={() => { refreshDownstreamChain().catch(() => {}); }}
              autoCascadeRefresh={autoCascadeRefresh}
              autoRetryFailed={autoRetryFailed}
              onToggleAutoCascade={() => setAutoCascadeRefresh((prev) => !prev)}
              onToggleAutoRetry={() => setAutoRetryFailed((prev) => !prev)}
            />
          )}

          {isGuidedWorkflow && activeDisc.adaptiveProfile && (
            <div className="rounded-[24px] border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] p-5">
              <div className="mb-3 flex items-center gap-2">
                <span className="chip chip-muted !px-2 !py-1">评分记忆</span>
                <span className="text-[11px] text-[var(--text-tertiary)]">后续阶段会参考这些反馈自动调整</span>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="panel-card-muted p-4 text-center">
                  <div className="meta-label">客服阶段</div>
                  <div className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">{activeDisc.adaptiveProfile.intakeAvg.toFixed(1)}</div>
                </div>
                <div className="panel-card-muted p-4 text-center">
                  <div className="meta-label">评审阶段</div>
                  <div className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">{activeDisc.adaptiveProfile.reviewAvg.toFixed(1)}</div>
                </div>
                <div className="panel-card-muted p-4 text-center">
                  <div className="meta-label">交付阶段</div>
                  <div className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">{activeDisc.adaptiveProfile.deliveryAvg.toFixed(1)}</div>
                </div>
              </div>
            </div>
          )}

          {isGuidedWorkflow && activeDisc.workflow === 'guided-collaboration' && activeDisc.status === 'running' && (
            <div className="mb-4 rounded-2xl border border-[var(--border-tertiary)] bg-[var(--bg-secondary)] p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-3">执行进度</div>
              <ExecutionTimeline
                stages={[
                  { id: 'intake', name: '需求收集', agentName: '客服接待', status: activeDisc.stage === 'intake' ? 'running' : (activeDisc.turns.some(t => t.stage === 'intake') ? 'success' : 'pending') },
                  { id: 'planning', name: '方案设计', agentName: '方案专家', status: activeDisc.stage === 'waiting_plan_selection' ? 'waiting_approval' : activeDisc.stage === 'expert_review' || activeDisc.turns.some(t => t.stage === 'expert_review') ? 'success' : activeDisc.stage === 'intake' ? 'pending' : 'pending' },
                  { id: 'review', name: '专家评审', agentName: '验证专家', status: activeDisc.stage === 'expert_review' ? 'running' : activeDisc.turns.some(t => t.stage === 'expert_review') ? 'success' : 'pending' },
                  { id: 'assignment', name: '任务分配', agentName: '项目总监', status: activeDisc.stage === 'team_assignment' ? 'running' : activeDisc.turns.some(t => t.stage === 'team_assignment') ? 'success' : 'pending' },
                  { id: 'execution', name: '团队执行', agentName: '专家团队', status: activeDisc.stage === 'team_execution' ? 'running' : activeDisc.turns.some(t => t.stage === 'team_execution') ? 'success' : 'pending' },
                  { id: 'report', name: '报告交付', agentName: '报告撰写', status: activeDisc.stage === 'report' ? 'running' : activeDisc.stage === 'waiting_rating' || activeDisc.stage === 'completed' ? 'success' : 'pending' },
                ]}
                currentStageId={activeDisc.stage === 'waiting_plan_selection' ? 'planning' : activeDisc.stage === 'waiting_rating' ? 'report' : activeDisc.stage}
              />
            </div>
          )}

          {isGuidedWorkflow ? (
            activeDisc.turns.map((turn, index) => {
              const prevStage = index > 0 ? activeDisc.turns[index - 1].stage : undefined;
              const agent = activeDisc.agents.find((a) => a.id === turn.agentId);
              return (
                <React.Fragment key={turn.id}>
                  {turn.stage && turn.stage !== prevStage && (
                    <div className="flex items-center gap-3 py-1">
                      <div className="h-px flex-1 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)]" />
                      <span className="chip chip-muted">{stageLabel(turn.stage)}</span>
                      <div className="h-px flex-1 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)]" />
                    </div>
                  )}
                  <TurnBubble turn={turn} agent={agent} />
                </React.Fragment>
              );
            })
          ) : (() => {
            const elements: React.ReactNode[] = [];
            let turnIdx = 0;

            for (let r = 1; r <= (activeDisc.rounds ?? activeDisc.totalRounds); r++) {
              const roundTurns = activeDisc.turns.slice(turnIdx, turnIdx + activeDisc.agents.length);
              if (roundTurns.length === 0 && r > activeDisc.currentRound) break;

              elements.push(
                <div key={`round-${r}`} className="flex items-center gap-3 py-1">
                  <div className="h-px flex-1 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)]" />
                  <span className="chip chip-muted">第 {r} 轮</span>
                  <div className="h-px flex-1 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)]" />
                </div>
              );

              for (const turn of roundTurns) {
                const agent = activeDisc.agents.find((a) => a.id === turn.agentId);
                elements.push(
                  <TurnBubble key={turn.id} turn={turn} agent={agent} />
                );
              }

              turnIdx += roundTurns.length;
            }

            return elements;
          })()}

          {activeDisc.status === 'running' && (
            <div className="flex items-center gap-3 rounded-2xl border border-[var(--border-primary)] bg-[var(--brand-primary-soft)] px-4 py-3 text-sm text-[var(--text-primary)]">
              <div className="h-2.5 w-2.5 rounded-full bg-[var(--brand-secondary)] animate-pulse" />
              <span>{isGuidedWorkflow ? '协作流程推进中，新的阶段结果会实时追加到当前线程。' : '讨论进行中，新的轮次会实时追加到当前线程中。'}</span>
            </div>
          )}
        </div>
      </div>

      {isGuidedWorkflow && activeDisc.pendingAction && (
        <div className="border-t border-[var(--border-secondary)] bg-[var(--bg-primary)] px-5 py-4 backdrop-blur-xl">
          <div className="mx-auto w-full max-w-4xl">
            {activeDisc.pendingAction.type === 'rate_stages' ? (
              <div className="rounded-[28px] border border-[var(--border-secondary)] bg-[var(--bg-elevated)] p-4 shadow-[var(--shadow-md)]">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="meta-label">评分反馈</div>
                    <div className="mt-1 text-sm text-[var(--text-secondary)]">请为 3 个环节分别打 1-3 分，帮助团队自动调整表现。</div>
                  </div>
                  <span className="chip chip-muted">1 = 需改进 · 3 = 很满意</span>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  {[
                    { key: 'intake', label: '环节 1 · 客服接待' },
                    { key: 'review', label: '环节 2 · 专家评审' },
                    { key: 'delivery', label: '环节 3 · 最终交付' },
                  ].map((item) => (
                    <div key={item.key} className="rounded-[22px] border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] p-4">
                      <div className="text-sm font-medium text-[var(--text-primary)]">{item.label}</div>
                      <div className="mt-3 flex gap-2">
                        {[1, 2, 3].map((score) => (
                          <button
                            key={score}
                            onClick={() => setRatingDraft((prev) => ({ ...prev, [item.key]: score } as ChainStageRatings))}
                            className={`flex-1 rounded-2xl px-3 py-2 text-sm transition ${ratingDraft[item.key as keyof ChainStageRatings] === score ? 'border border-[var(--border-primary)] bg-[var(--brand-primary-soft)] text-[var(--text-primary)]' : 'border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}
                          >
                            {score}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <textarea
                  value={ratingNote}
                  onChange={(e) => setRatingNote(e.target.value)}
                  rows={2}
                  placeholder="可选：补充一句你最在意的改进点。"
                  className="input mt-4 resize-none text-sm"
                />

                <div className="mt-4 flex justify-end">
                  <button onClick={handleSubmitRatings} className="btn btn-primary px-5 py-2 text-sm">提交评分</button>
                </div>
              </div>
            ) : (
              <div className="rounded-[28px] border border-[var(--border-secondary)] bg-[var(--bg-elevated)] p-4 shadow-[var(--shadow-md)]">
                <div className="mb-3 flex flex-wrap gap-2">
                  <span className="chip chip-cool">等待你的输入</span>
                  <span className="chip chip-muted">支持继续补充信息或直接选方案编号</span>
                </div>

                {activeDisc.planOptions && activeDisc.planOptions.length > 0 && (
                  <div className="mb-4 grid gap-3 md:grid-cols-3">
                    {activeDisc.planOptions.map((option) => (
                      <div key={option.index} className={`rounded-[22px] border p-4 transition ${activeDisc.selectedPlanIndex === option.index ? 'border-[var(--border-primary)] bg-[var(--brand-primary-soft)]' : 'border-[var(--border-secondary)] bg-[var(--bg-tertiary)]'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="chip chip-muted !px-2 !py-1">方案 {option.index}</span>
                          <button
                            onClick={() => {
                              setChainReply(String(option.index));
                              executeChain(activeDisc.id, String(option.index)).catch(() => {});
                            }}
                            className="btn btn-secondary px-3 py-2 text-xs"
                          >
                            直接选这个
                          </button>
                        </div>
                        <div className="mt-3 text-sm font-semibold text-[var(--text-primary)]">{option.title}</div>
                        <div className="mt-2 whitespace-pre-wrap text-[12px] leading-6 text-[var(--text-secondary)]">
                          {option.summary}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="glass-light flex items-end gap-3 rounded-[24px] border-[var(--border-secondary)] px-3 py-3 transition focus-within:border-[var(--border-primary)]">
                  <textarea
                    value={chainReply}
                    onChange={(e) => setChainReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendReply().catch(() => {});
                      }
                    }}
                    placeholder={activeDisc.pendingAction.placeholder || '继续补充信息，或输入 1 / 2 / 3 选择方案。'}
                    rows={1}
                    className="min-h-[28px] max-h-[140px] flex-1 resize-none bg-transparent text-sm leading-7 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
                  />
                  <button onClick={() => { handleSendReply().catch(() => {}); }} disabled={!chainReply.trim()} className="btn btn-primary h-11 w-11 rounded-2xl px-0 disabled:opacity-30">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showCreate && <CreateDialog onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
    </div>
  );
}

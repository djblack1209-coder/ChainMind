// Dual-mode Agent Execution Engine
// Sequential (with approval gates + @router branching), Parallel (DAG fan-out/fan-in),
// Hierarchical (coordinator decompose → delegate → synthesize → re-delegate)

import type { AIProvider, StreamChunk, ChatRequestBody } from './types';
import { topologicalLayers, executeLayerWithConcurrency } from './dag-engine';
import { streamChatRequest } from './llm-client';
import type { Node, Edge } from 'reactflow';

// ─── Config ─────────────────────────────────────────────────

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  provider: AIProvider;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
}

export interface StageConfig {
  id: string;
  agentId: string;
  promptTemplate: string; // {{input}}, {{stages.<id>.output}}, {{var.<name>}}
  humanApproval?: boolean;
  maxRetries?: number;
  router?: (output: string, ctx: ExecutionContext) => string | null;
  isCoordinator?: boolean;
  maxRedelegations?: number;
}

export interface WorkflowConfig {
  id: string;
  mode: 'sequential' | 'parallel' | 'hierarchical';
  stages: StageConfig[];
  edges: Array<{ source: string; target: string }>;
  concurrency?: number;
}

// ─── Runtime Types ──────────────────────────────────────────

export interface StageOutput {
  stageId: string;
  agentId: string;
  content: string;
  tokenCount: number;
  latencyMs: number;
  status: 'success' | 'error' | 'skipped';
  error?: string;
}

export interface ExecutionContext {
  workflowId: string;
  input: string;
  variables: Record<string, unknown>;
  stageOutputs: Map<string, StageOutput>;
  status: 'running' | 'paused' | 'completed' | 'error';
  currentStageId: string | null;
  startedAt: number;
  pendingApproval: { stageId: string; output: string } | null;
}

export type ExecutionEvent =
  | { type: 'stage_start'; stageId: string; agentId: string }
  | { type: 'stage_chunk'; stageId: string; content: string }
  | { type: 'stage_complete'; stageId: string; output: StageOutput }
  | { type: 'stage_error'; stageId: string; error: string }
  | { type: 'approval_needed'; stageId: string; output: string }
  | { type: 'workflow_complete'; outputs: Map<string, StageOutput> }
  | { type: 'workflow_error'; error: string };

// ─── Engine ─────────────────────────────────────────────────

export class ExecutionEngine {
  private context: ExecutionContext;
  private listeners: Array<(e: ExecutionEvent) => void> = [];
  private abortController: AbortController;
  private approvalResolvers = new Map<string, (ok: boolean, fb?: string) => void>();
  private pausePromise: Promise<void> | null = null;
  private pauseResolve: (() => void) | null = null;
  private workflow: WorkflowConfig;
  private agentMap: Map<string, AgentConfig>;
  private apiKeys: Record<string, string> = {};

  constructor(workflow: WorkflowConfig, agents: AgentConfig[]) {
    this.workflow = workflow;
    this.agentMap = new Map(agents.map((a) => [a.id, a]));
    this.abortController = new AbortController();
    this.context = {
      workflowId: workflow.id, input: '', variables: {},
      stageOutputs: new Map(), status: 'running',
      currentStageId: null, startedAt: Date.now(), pendingApproval: null,
    };
  }

  // Event bus (AgentScope MsgHub pattern)
  on(listener: (e: ExecutionEvent) => void): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter((l) => l !== listener); };
  }

  private emit(event: ExecutionEvent) {
    for (const l of this.listeners) { try { l(event); } catch {} }
  }

  // Human-in-the-loop
  approve(stageId: string) {
    this.approvalResolvers.get(stageId)?.(true);
    this.approvalResolvers.delete(stageId);
    this.context.pendingApproval = null;
  }

  reject(stageId: string, feedback: string) {
    this.approvalResolvers.get(stageId)?.(false, feedback);
    this.approvalResolvers.delete(stageId);
    this.context.pendingApproval = null;
  }

  private waitForApproval(stageId: string, output: string): Promise<{ approved: boolean; feedback?: string }> {
    this.context.pendingApproval = { stageId, output };
    this.emit({ type: 'approval_needed', stageId, output });
    return new Promise((resolve) => {
      this.approvalResolvers.set(stageId, (approved, feedback) => resolve({ approved, feedback }));
    });
  }

  // Flow control
  pause() {
    if (this.context.status !== 'running') return;
    this.context.status = 'paused';
    this.pausePromise = new Promise((r) => { this.pauseResolve = r; });
  }

  resume() {
    if (this.context.status !== 'paused') return;
    this.context.status = 'running';
    this.pauseResolve?.();
    this.pausePromise = null;
    this.pauseResolve = null;
  }

  abort() {
    this.context.status = 'error';
    this.abortController.abort();
    this.approvalResolvers.forEach((resolver) => resolver(false, 'Workflow aborted'));
    this.approvalResolvers.clear();
  }

  getContext(): ExecutionContext {
    return { ...this.context, stageOutputs: new Map(this.context.stageOutputs) };
  }

  private async checkPause() { if (this.pausePromise) await this.pausePromise; }
  private checkAbort() { if (this.abortController.signal.aborted) throw new Error('Workflow aborted'); }

  // ── Main entry ─────────────────────────────────────────

  async execute(input: string, apiKeys: Record<string, string>): Promise<void> {
    this.context.input = input;
    this.context.startedAt = Date.now();
    this.context.status = 'running';
    this.apiKeys = apiKeys;

    try {
      if (this.workflow.mode === 'sequential') await this.executeSequential();
      else if (this.workflow.mode === 'parallel') await this.executeParallel();
      else await this.executeHierarchical();

      this.context.status = 'completed';
      this.emit({ type: 'workflow_complete', outputs: new Map(this.context.stageOutputs) });
    } catch (err) {
      this.context.status = 'error';
      const msg = err instanceof Error ? err.message : String(err);
      if (msg !== 'Workflow aborted') this.emit({ type: 'workflow_error', error: msg });
    }
  }

  // ── Sequential mode ────────────────────────────────────

  private async executeSequential() {
    const { stages } = this.workflow;
    let i = 0;
    while (i < stages.length) {
      this.checkAbort();
      await this.checkPause();
      const stage = stages[i];
      const output = await this.runStage(stage);

      if (output.status === 'success' && stage.router) {
        const target = stage.router(output.content, this.context);
        if (target) {
          const idx = stages.findIndex((s) => s.id === target);
          if (idx !== -1) { i = idx; continue; }
        }
      }
      if (output.status === 'success' && stage.humanApproval) {
        const { approved, feedback } = await this.waitForApproval(stage.id, output.content);
        if (!approved) {
          this.context.variables[`${stage.id}_feedback`] = feedback;
          continue;
        }
      }
      i++;
    }
  }

  // ── Parallel mode (DAG fan-out/fan-in) ─────────────────

  private async executeParallel() {
    const nodes: Node[] = this.workflow.stages.map((s) => ({ id: s.id, position: { x: 0, y: 0 }, data: {} }));
    const edges: Edge[] = this.workflow.edges.map((e, i) => ({ id: `e${i}`, source: e.source, target: e.target }));
    const layers = topologicalLayers(nodes, edges);
    const concurrency = this.workflow.concurrency ?? 3;

    for (const layer of layers) {
      this.checkAbort();
      await this.checkPause();
      const tasks: Array<() => Promise<StageOutput>> = layer
        .map((id) => this.workflow.stages.find((s) => s.id === id))
        .filter((s): s is StageConfig => !!s)
        .map((stage) => () => this.runStage(stage));
      await executeLayerWithConcurrency(tasks, concurrency);
    }
  }

  // ── Hierarchical mode (CAMEL Workforce) ────────────────

  private async executeHierarchical() {
    const coordinator = this.workflow.stages.find((s) => s.isCoordinator);
    if (!coordinator) throw new Error('Hierarchical mode requires a coordinator stage');
    const workers = this.workflow.stages.filter((s) => !s.isCoordinator);
    const maxRounds = coordinator.maxRedelegations ?? 1;
    const concurrency = this.workflow.concurrency ?? 3;

    const decomposition = await this.runStage(coordinator);
    if (decomposition.status !== 'success') return;

    let round = 0;
    let needsRedo = true;
    while (needsRedo && round <= maxRounds) {
      this.checkAbort();
      await this.checkPause();
      await executeLayerWithConcurrency(workers.map((s) => () => this.runStage(s)), concurrency);

      const synthStage: StageConfig = {
        id: `${coordinator.id}_synth_${round}`,
        agentId: coordinator.agentId,
        promptTemplate: this.buildSynthesisPrompt(workers),
        maxRetries: coordinator.maxRetries,
      };
      const synthesis = await this.runStage(synthStage);
      const hasFailures = workers.some((w) => this.context.stageOutputs.get(w.id)?.status === 'error');
      needsRedo = hasFailures && round < maxRounds;
      if (needsRedo) this.context.variables['redelegation_feedback'] = synthesis.content;
      round++;
    }
  }

  private buildSynthesisPrompt(workers: StageConfig[]): string {
    const parts = workers.map((w) => {
      const o = this.context.stageOutputs.get(w.id);
      return `## ${w.id} [${o?.status ?? 'not_run'}]\n${o?.content ?? '(no output)'}`;
    });
    return `Synthesize the following worker results. Note any failures.\n\n${parts.join('\n\n')}`;
  }

  // ── Core stage runner with retry ───────────────────────

  private async runStage(stage: StageConfig): Promise<StageOutput> {
    const agent = this.agentMap.get(stage.agentId);
    if (!agent) {
      const err = `Agent ${stage.agentId} not found`;
      const output: StageOutput = { stageId: stage.id, agentId: stage.agentId, content: '', tokenCount: 0, latencyMs: 0, status: 'error', error: err };
      this.context.stageOutputs.set(stage.id, output);
      this.emit({ type: 'stage_error', stageId: stage.id, error: err });
      return output;
    }

    this.context.currentStageId = stage.id;
    this.emit({ type: 'stage_start', stageId: stage.id, agentId: agent.id });
    const maxRetries = stage.maxRetries ?? 0;
    let lastError = '';

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.callAgent(stage, agent);
        this.context.stageOutputs.set(stage.id, result);
        this.emit({ type: 'stage_complete', stageId: stage.id, output: result });
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    const output: StageOutput = { stageId: stage.id, agentId: agent.id, content: '', tokenCount: 0, latencyMs: 0, status: 'error', error: lastError };
    this.context.stageOutputs.set(stage.id, output);
    this.emit({ type: 'stage_error', stageId: stage.id, error: lastError });
    return output;
  }

  // ── LLM call with streaming ────────────────────────────

  private async callAgent(stage: StageConfig, agent: AgentConfig): Promise<StageOutput> {
    const prompt = this.resolveTemplate(stage.promptTemplate);
    const startTime = Date.now();
    let content = '';
    let tokenCount = 0;

    const payload: ChatRequestBody = {
      provider: agent.provider, model: agent.model,
      apiKey: this.apiKeys[agent.provider] || '',
      systemPrompt: agent.systemPrompt, userPrompt: prompt,
      temperature: agent.temperature, maxTokens: agent.maxTokens, effort: 'medium',
    };

    await streamChatRequest(payload, {
      signal: this.abortController.signal,
      onChunk: (chunk: StreamChunk) => {
        if (chunk.type === 'text') {
          content += chunk.content;
          tokenCount++;
          this.emit({ type: 'stage_chunk', stageId: stage.id, content: chunk.content });
        } else if (chunk.type === 'error') {
          throw new Error(chunk.content);
        }
      },
    });

    return { stageId: stage.id, agentId: agent.id, content, tokenCount, latencyMs: Date.now() - startTime, status: 'success' };
  }

  // ── Template resolution ────────────────────────────────

  private resolveTemplate(tpl: string): string {
    return tpl
      .replace(/\{\{input\}\}/g, this.context.input)
      .replace(/\{\{stages\.(\w+)\.output\}\}/g, (_, id) => this.context.stageOutputs.get(id)?.content ?? '')
      .replace(/\{\{var\.(\w+)\}\}/g, (_, k) => String(this.context.variables[k] ?? ''));
  }
}

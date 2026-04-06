// useExecutionEngine — React hook bridging ExecutionEngine to chain-store
// Converts engine events into ChainTurn entries and manages lifecycle.

import { useState, useRef, useCallback } from 'react';
import { ExecutionEngine, type AgentConfig as EngineAgentConfig, type WorkflowConfig as EngineWorkflowConfig, type ExecutionEvent, type StageOutput } from '@/lib/execution-engine';
import { getBuiltinAgents, getBuiltinWorkflows, buildSystemPrompt, type AgentConfig, type WorkflowConfig } from '@/lib/agent-config';
import { useChainStore } from '@/stores/chain-store';
import type { ChainTurn } from '@/lib/types';

function genId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Convert agent-config AgentConfig → execution-engine AgentConfig */
function toEngineAgent(agent: AgentConfig): EngineAgentConfig {
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    provider: agent.provider,
    model: agent.model,
    systemPrompt: buildSystemPrompt(agent),
    temperature: agent.temperature,
    maxTokens: agent.maxTokens,
  };
}

/** Convert agent-config WorkflowConfig → execution-engine WorkflowConfig */
function toEngineWorkflow(wf: WorkflowConfig, agents: AgentConfig[]): EngineWorkflowConfig {
  const agentByRole = new Map(agents.map((a) => [a.role, a]));
  return {
    id: wf.id,
    mode: wf.executionMode,
    stages: wf.stages.map((s) => ({
      id: s.id,
      agentId: agentByRole.get(s.agentRole)?.id || s.agentRole,
      promptTemplate: '{{input}}' + (s.dependsOn.length > 0
        ? '\n\n前序阶段输出：\n' + s.dependsOn.map((d) => `{{stages.${d}.output}}`).join('\n\n')
        : ''),
      humanApproval: s.humanApproval,
      maxRetries: s.maxRetries,
    })),
    edges: wf.stages.flatMap((s) =>
      s.dependsOn.map((dep) => ({ source: dep, target: s.id }))
    ),
    concurrency: 3,
  };
}

export interface EngineState {
  running: boolean;
  currentStageId: string | null;
  stageOutputs: Map<string, StageOutput>;
  pendingApproval: { stageId: string; output: string } | null;
  error: string | null;
  completed: boolean;
}

export function useExecutionEngine() {
  const engineRef = useRef<ExecutionEngine | null>(null);
  const [state, setState] = useState<EngineState>({
    running: false,
    currentStageId: null,
    stageOutputs: new Map(),
    pendingApproval: null,
    error: null,
    completed: false,
  });

  const { addTurn, updateTurn, setDiscussionStatus } = useChainStore.getState();

  // Track turn IDs for streaming updates
  const stageTurnMap = useRef<Map<string, string>>(new Map());

  const execute = useCallback(async (
    discId: string,
    workflowId: string,
    input: string,
    apiKeys: Record<string, string>,
  ) => {
    const agents = getBuiltinAgents();
    const workflows = getBuiltinWorkflows();
    const workflow = workflows.find((w) => w.id === workflowId) || workflows[0];

    const engineAgents = agents.map(toEngineAgent);
    const engineWorkflow = toEngineWorkflow(workflow, agents);

    const engine = new ExecutionEngine(engineWorkflow, engineAgents);
    engineRef.current = engine;
    stageTurnMap.current.clear();

    setState({
      running: true, currentStageId: null,
      stageOutputs: new Map(), pendingApproval: null,
      error: null, completed: false,
    });
    setDiscussionStatus(discId, 'running');

    // Map agent IDs to names for turn display
    const agentNames = new Map(agents.map((a) => [a.id, a]));

    const unsub = engine.on((event: ExecutionEvent) => {
      switch (event.type) {
        case 'stage_start': {
          const agent = agentNames.get(event.agentId);
          const turnId = genId('turn');
          stageTurnMap.current.set(event.stageId, turnId);
          const turn: ChainTurn = {
            id: turnId,
            agentId: event.agentId,
            agentName: agent?.name || event.agentId,
            model: agent?.model || '',
            content: '',
            tokenCount: 0,
            latencyMs: 0,
            timestamp: Date.now(),
            role: 'assistant',
            isStreaming: true,
          };
          addTurn(discId, turn);
          setState((s) => ({ ...s, currentStageId: event.stageId }));
          break;
        }
        case 'stage_chunk': {
          const turnId = stageTurnMap.current.get(event.stageId);
          if (turnId) {
            // Accumulate content — get current from store
            const disc = useChainStore.getState().discussions.find((d) => d.id === discId);
            const turn = disc?.turns.find((t) => t.id === turnId);
            const newContent = (turn?.content || '') + event.content;
            updateTurn(discId, turnId, { content: newContent });
          }
          break;
        }
        case 'stage_complete': {
          const turnId = stageTurnMap.current.get(event.stageId);
          if (turnId) {
            updateTurn(discId, turnId, {
              content: event.output.content,
              tokenCount: event.output.tokenCount,
              latencyMs: event.output.latencyMs,
              isStreaming: false,
              error: event.output.error,
            });
          }
          setState((s) => {
            const outputs = new Map(s.stageOutputs);
            outputs.set(event.stageId, event.output);
            return { ...s, stageOutputs: outputs };
          });
          break;
        }
        case 'stage_error': {
          const turnId = stageTurnMap.current.get(event.stageId);
          if (turnId) {
            updateTurn(discId, turnId, { isStreaming: false, error: event.error });
          }
          break;
        }
        case 'approval_needed': {
          setState((s) => ({ ...s, pendingApproval: { stageId: event.stageId, output: event.output } }));
          break;
        }
        case 'workflow_complete': {
          setState((s) => ({ ...s, running: false, completed: true, currentStageId: null }));
          setDiscussionStatus(discId, 'completed');
          break;
        }
        case 'workflow_error': {
          setState((s) => ({ ...s, running: false, error: event.error, currentStageId: null }));
          setDiscussionStatus(discId, 'error');
          break;
        }
      }
    });

    try {
      await engine.execute(input, apiKeys);
    } finally {
      unsub();
    }
  }, [addTurn, updateTurn, setDiscussionStatus]);

  const approve = useCallback((stageId: string) => {
    engineRef.current?.approve(stageId);
    setState((s) => ({ ...s, pendingApproval: null }));
  }, []);

  const reject = useCallback((stageId: string, feedback: string) => {
    engineRef.current?.reject(stageId, feedback);
    setState((s) => ({ ...s, pendingApproval: null }));
  }, []);

  const abort = useCallback(() => {
    engineRef.current?.abort();
    setState((s) => ({ ...s, running: false, error: 'Aborted by user' }));
  }, []);

  const pause = useCallback(() => { engineRef.current?.pause(); }, []);
  const resume = useCallback(() => { engineRef.current?.resume(); }, []);

  return { state, execute, approve, reject, abort, pause, resume };
}

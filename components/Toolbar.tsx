"use client";

import React, { useState } from 'react';
import { useFlowStore } from '@/stores/flow-store';
import { useApiKeyStore } from '@/stores/api-key-store';
import { detectCycles, topologicalLayers, getParentIds, executeLayerWithConcurrency } from '@/lib/dag-engine';
import { renderTemplate, buildTemplateVars, buildL2Context } from '@/lib/prompt-engine';
import { countTokens } from '@/lib/token-manager';
import { streamChatRequest } from '@/lib/llm-client';
import type { AINodeData } from '@/lib/types';

interface ToolbarProps {
  onOpenApiKeys: () => void;
  onSave: () => void;
}

export default function Toolbar({ onOpenApiKeys: _onOpenApiKeys, onSave: _onSave }: ToolbarProps) {
  const { nodes, edges, addNode, isExecuting, setIsExecuting, updateNodeData, resetAllNodeStatus, globalFacts, userInput, setUserInput } = useFlowStore();
  const getKey = useApiKeyStore((s) => s.getKey);
  const baseUrls = useApiKeyStore((s) => s.baseUrls);
  const [executionLog, setExecutionLog] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);

  const handleAddNode = () => {
    const x = 150 + Math.random() * 400;
    const y = 100 + Math.random() * 300;
    addNode({ x, y });
  };

  const handleExecute = async () => {
    if (isExecuting) return;

    const cycles = detectCycles(nodes, edges);
    if (cycles.size > 0) {
      cycles.forEach((id) => updateNodeData(id, { status: 'error', error: '检测到循环依赖' }));
      return;
    }

    setIsExecuting(true);
    resetAllNodeStatus();
    setExecutionLog([]);
    setShowLog(true);
    const log = (msg: string) => setExecutionLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

    try {
      const layers = topologicalLayers(nodes, edges);
      log(`拓扑排序完成: ${layers.length} 层, ${nodes.length} 个节点`);

      const nodeOutputs: Record<string, string> = {};

      for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
        const layerIds = layers[layerIdx];
        log(`执行第 ${layerIdx + 1} 层: ${layerIds.length} 个节点并行`);

        const tasks = layerIds.map((nodeId) => async () => {
          const node = nodes.find((n) => n.id === nodeId);
          if (!node) return;

          const data = node.data as AINodeData;
          updateNodeData(nodeId, { status: 'running' });

          const apiKey = await getKey(data.provider);
          if (!apiKey) {
            updateNodeData(nodeId, { status: 'error', error: `未配置 ${data.provider} API密钥` });
            return;
          }
          const baseUrl = baseUrls[data.provider];

          const parentIds = getParentIds(nodeId, edges);
          const parentOutputs = parentIds.map((pid) => nodeOutputs[pid] || '').filter(Boolean);
          const l2 = buildL2Context(parentOutputs);
          const vars = buildTemplateVars({ l1: '', l2, l3: globalFacts }, userInput, data.label);
          const resolvedPrompt = renderTemplate(data.userPromptTemplate, vars);

          const startTime = performance.now();
          let fullOutput = '';

          try {
            let streamError = '';
            await streamChatRequest(
              {
                provider: data.provider,
                model: data.model,
                apiKey,
                baseUrl,
                systemPrompt: data.systemPrompt,
                userPrompt: resolvedPrompt,
                temperature: data.temperature,
                maxTokens: data.maxTokens,
                effort: data.effort,
                enableMetaPrompt: data.enableMetaPrompt,
              },
              {
                onChunk: (chunk) => {
                  if (chunk.type === 'text') {
                    fullOutput += chunk.content;
                    updateNodeData(nodeId, { output: fullOutput });
                  } else if (chunk.type === 'error') {
                    streamError = chunk.content;
                  }
                },
              }
            );

            if (streamError) {
              updateNodeData(nodeId, { status: 'error', error: streamError.slice(0, 200) });
              return;
            }

            const latencyMs = Math.round(performance.now() - startTime);
            const tokenCount = await countTokens(fullOutput);
            nodeOutputs[nodeId] = fullOutput;
            updateNodeData(nodeId, { status: 'success', output: fullOutput, tokenCount, latencyMs });
            log(`节点 "${data.label}" 完成 (${tokenCount} tokens, ${latencyMs}ms)`);
          } catch (err) {
            updateNodeData(nodeId, { status: 'error', error: String(err) });
          }
        });

        await executeLayerWithConcurrency(tasks, 5);
      }
      log('所有节点执行完成');
    } catch (err) {
      log(`执行错误: ${err}`);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="flex flex-col flex-shrink-0 gap-3">
      <div className="panel-shell rounded-[28px] p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="section-kicker">Flow controls</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="chip chip-muted">{nodes.length} 节点</span>
              <span className="chip chip-muted">{edges.length} 连线</span>
              {isExecuting && <span className="chip chip-cool">Executing</span>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={handleAddNode} className="btn btn-secondary px-4 py-2 text-xs">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
              添加节点
            </button>

            <button
              onClick={handleExecute}
              disabled={isExecuting || nodes.length === 0}
              className={`btn ${isExecuting ? 'btn-secondary' : 'btn-success'} px-5 py-2 text-xs`}
            >
              {isExecuting ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin"><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>
                  执行中...
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                  执行流水线
                </>
              )}
            </button>

            {executionLog.length > 0 && (
              <button
                onClick={() => setShowLog(!showLog)}
                className={`btn ${showLog ? 'btn-secondary border-[rgba(10,132,255,0.2)] bg-[rgba(10,132,255,0.08)] text-[#d7efff]' : 'btn-secondary'} px-4 py-2 text-xs`}
                title="执行日志"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
                执行日志
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.04] p-3">
          <label className="meta-label mb-2 block">用户输入</label>
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="通过 {{user.input}} 注入到节点..."
            className="input text-xs"
          />
        </div>
      </div>

      {showLog && executionLog.length > 0 && (
        <div className="panel-shell max-h-[180px] overflow-y-auto rounded-[24px] px-4 py-4 animate-slide-down">
          <div className="mb-3 flex items-center justify-between">
            <div className="meta-label">Execution log</div>
            <span className="chip chip-muted !px-2 !py-1">{executionLog.length} entries</span>
          </div>
          <div className="space-y-2 font-mono text-[11px] text-[var(--text-tertiary)]">
            {executionLog.map((msg, i) => (
              <div key={i} className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 leading-6">
                {msg}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import React, { useCallback, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type NodeTypes,
  type OnSelectionChangeParams,
} from 'reactflow';
import 'reactflow/dist/style.css';
import AINodeComponent from './AINode';
import { useFlowStore } from '@/stores/flow-store';

const nodeTypes: NodeTypes = {
  aiNode: AINodeComponent,
};

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
      <div className="text-center animate-fade-in pointer-events-auto max-w-md">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-cyan-500/10 border border-[var(--border-primary)] flex items-center justify-center">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="url(#grad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <defs>
              <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>
            </defs>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v8M8 12h8" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">开始构建你的 AI 流水线</h3>
        <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-xs mx-auto leading-relaxed">
          添加 AI 节点，拖拽连线构建协作链路，让多个模型接力思考
        </p>
        <div className="flex flex-col items-center gap-4">
          <button onClick={onAdd} className="btn btn-primary text-sm py-2.5 px-6">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
            添加第一个节点
          </button>

          {/* Quick tips */}
          <div className="mt-2 p-4 rounded-xl bg-[var(--bg-secondary)]/80 border border-[var(--border-secondary)] text-left w-full max-w-sm">
            <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 font-medium">快速上手</p>
            <div className="space-y-2">
              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-indigo-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[10px] text-indigo-400 font-bold">1</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">点击上方「添加节点」创建 AI 节点</p>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-indigo-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[10px] text-indigo-400 font-bold">2</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  从节点底部<span className="inline-block w-2 h-2 rounded-full bg-green-400 mx-0.5 align-middle"></span>拖到另一节点顶部<span className="inline-block w-2 h-2 rounded-full bg-indigo-400 mx-0.5 align-middle"></span>建立连线
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-indigo-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[10px] text-indigo-400 font-bold">3</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">点击绿色「执行流水线」按钮运行</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FlowCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, setSelectedNode, addNode } = useFlowStore();

  const onSelectionChange = useCallback(
    ({ nodes: sel }: OnSelectionChangeParams) => {
      setSelectedNode(sel.length === 1 ? sel[0].id : null);
    },
    [setSelectedNode]
  );

  const handleAddCenter = useCallback(() => {
    addNode({ x: 300, y: 200 });
  }, [addNode]);

  const styledEdges = useMemo(() => {
    return edges.map((e) => ({
      ...e,
      style: { stroke: 'rgba(99,102,241,0.4)', strokeWidth: 2 },
      animated: true,
    }));
  }, [edges]);

  return (
    <div className="flex-1 h-full relative">
      {nodes.length === 0 && <EmptyState onAdd={handleAddCenter} />}
      <ReactFlow
        nodes={nodes}
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        onPaneClick={() => setSelectedNode(null)}
        nodeTypes={nodeTypes}
        fitView
        className="bg-[var(--bg-root)]"
        defaultEdgeOptions={{ animated: true }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="rgba(99,102,241,0.08)" gap={24} size={1} />
        <Controls className="!bg-[var(--bg-secondary)] !border-[var(--border-primary)] !rounded-xl !shadow-lg" />
        <MiniMap
          className="!bg-[var(--bg-secondary)] !border-[var(--border-primary)] !rounded-xl"
          nodeColor={(node) => {
            const s = (node.data as { status?: string })?.status;
            if (s === 'running') return '#6366f1';
            if (s === 'success') return '#22c55e';
            if (s === 'error') return '#ef4444';
            return '#334155';
          }}
          maskColor="rgba(0,0,0,0.6)"
        />
      </ReactFlow>
    </div>
  );
}

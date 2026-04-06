// Agent-as-Tool — Wrap any agent as a callable tool for other agents
// Inspired by AutoGen's AgentTool pattern
// Allows agents to delegate subtasks through a uniform tool interface

import type { AgentConfig } from './execution-engine';
import type { ChatRequestBody, StreamChunk } from './types';
import { streamChatRequest } from './llm-client';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
  execute: (params: Record<string, unknown>) => Promise<string>;
}

// ── Agent-as-Tool wrapper ─────────────────────────────────

export function agentAsTool(
  agent: AgentConfig,
  apiKeys: Record<string, string>,
  baseUrls?: Record<string, string>,
): ToolDefinition {
  return {
    name: `ask_${agent.role}`,
    description: `Delegate a task to ${agent.name} (${agent.role}). ${agent.systemPrompt.slice(0, 100)}`,
    parameters: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'The task to delegate' },
        context: { type: 'string', description: 'Additional context for the task' },
      },
      required: ['task'],
    },
    execute: async (params) => {
      const task = String(params.task ?? '');
      const context = params.context ? String(params.context) : '';
      const userPrompt = context ? `Context: ${context}\n\nTask: ${task}` : task;

      const payload: ChatRequestBody = {
        provider: agent.provider,
        model: agent.model,
        apiKey: apiKeys[agent.provider] || '',
        baseUrl: baseUrls?.[agent.provider],
        systemPrompt: agent.systemPrompt,
        userPrompt,
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
        effort: 'medium',
      };

      let content = '';
      await streamChatRequest(payload, {
        onChunk: (chunk: StreamChunk) => {
          if (chunk.type === 'text') content += chunk.content;
          else if (chunk.type === 'error') throw new Error(chunk.content);
        },
      });
      return content;
    },
  };
}

// ── Built-in tool stubs ───────────────────────────────────

function stubTool(name: string, desc: string, params: Record<string, string>, exec: (p: Record<string, unknown>) => Promise<string>): ToolDefinition {
  const properties: Record<string, { type: string; description: string }> = {};
  for (const [k, v] of Object.entries(params)) properties[k] = { type: 'string', description: v };
  return { name, description: desc, parameters: { type: 'object', properties, required: [Object.keys(params)[0]] }, execute: exec };
}

export const webSearchTool = () => stubTool('web_search', 'Search the web for current information',
  { query: 'Search query' }, async (p) => `[web_search stub] No results for: ${p.query}`);

export const codeExecTool = () => stubTool('code_exec', 'Execute a code snippet and return output',
  { code: 'Code to execute', language: 'Programming language' }, async (p) => `[code_exec stub] Would execute ${p.language ?? 'unknown'} code`);

export const fileReadTool = () => stubTool('file_read', 'Read the contents of a local file',
  { path: 'File path to read' }, async (p) => `[file_read stub] Would read: ${p.path}`);

export const calculatorTool = () => stubTool('calculator', 'Evaluate a mathematical expression',
  { expression: 'Math expression to evaluate' }, async (p) => {
    try {
      const expr = String(p.expression).replace(/[^0-9+\-*/().%\s]/g, '');
      if (!expr) return 'Invalid expression';
      return String(Function(`"use strict"; return (${expr})`)());
    } catch { return `Cannot evaluate: ${p.expression}`; }
  });

// ── Tool Registry ─────────────────────────────────────────

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** Register all agents as callable tools */
  registerAgents(
    agents: AgentConfig[],
    apiKeys: Record<string, string>,
    baseUrls?: Record<string, string>,
  ): void {
    for (const agent of agents) {
      this.register(agentAsTool(agent, apiKeys, baseUrls));
    }
  }

  /** Register built-in utility tools */
  registerBuiltins(): void {
    this.register(webSearchTool());
    this.register(codeExecTool());
    this.register(fileReadTool());
    this.register(calculatorTool());
  }

  /** Build a tool description block for injection into system prompts */
  buildToolPrompt(): string {
    const tools = this.getAll();
    if (!tools.length) return '';

    const lines = tools.map((t) => {
      const params = Object.entries(t.parameters.properties)
        .map(([k, v]) => `${k}: ${v.description}`)
        .join(', ');
      return `- ${t.name}(${params}): ${t.description}`;
    });

    return `\nAvailable tools:\n${lines.join('\n')}`;
  }
}

/** Shared singleton registry */
export const toolRegistry = new ToolRegistry();

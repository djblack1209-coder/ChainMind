// Variable system for passing data between nodes
// Inspired by Dify's variable reference system: {{nodeId.portName}}

import type { Edge } from 'reactflow';

export interface FlowVariable {
  nodeId: string;
  portName: string;
  value: unknown;
}

export class VariableResolver {
  private variables = new Map<string, FlowVariable>();

  private key(nodeId: string, portName: string): string {
    return `${nodeId}.${portName}`;
  }

  /** Set output from a node */
  set(nodeId: string, portName: string, value: unknown): void {
    const k = this.key(nodeId, portName);
    this.variables.set(k, { nodeId, portName, value });
  }

  /** Get a single variable value */
  get(nodeId: string, portName: string): unknown {
    return this.variables.get(this.key(nodeId, portName))?.value;
  }

  /** Check if a variable exists */
  has(nodeId: string, portName: string): boolean {
    return this.variables.has(this.key(nodeId, portName));
  }

  /** Get all outputs from a specific node */
  getNodeOutputs(nodeId: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [, v] of this.variables) {
      if (v.nodeId === nodeId) result[v.portName] = v.value;
    }
    return result;
  }

  /**
   * Resolve template strings like "{{node1.response}}" or "{{input.text}}"
   * Supports nested references and fallback to empty string.
   */
  resolveTemplate(template: string): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (_match, ref: string) => {
      const trimmed = ref.trim();
      const dotIdx = trimmed.indexOf('.');
      if (dotIdx === -1) return '';

      const nodeId = trimmed.slice(0, dotIdx);
      const portName = trimmed.slice(dotIdx + 1);
      const val = this.get(nodeId, portName);

      if (val === undefined || val === null) return '';
      if (typeof val === 'object') {
        try { return JSON.stringify(val); } catch { return String(val); }
      }
      return String(val);
    });
  }

  /**
   * Get all available variables for a given node (from upstream connected nodes).
   * Walks edges backwards to find all ancestor outputs.
   */
  getAvailableVariables(nodeId: string, edges: Edge[]): FlowVariable[] {
    const upstreamIds = this.collectUpstream(nodeId, edges);
    const available: FlowVariable[] = [];
    for (const [, v] of this.variables) {
      if (upstreamIds.has(v.nodeId)) available.push(v);
    }
    return available;
  }

  /** BFS to collect all upstream node IDs */
  private collectUpstream(nodeId: string, edges: Edge[]): Set<string> {
    const visited = new Set<string>();
    const queue: string[] = [];

    // Direct parents
    for (const e of edges) {
      if (e.target === nodeId) queue.push(e.source);
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const e of edges) {
        if (e.target === current && !visited.has(e.source)) {
          queue.push(e.source);
        }
      }
    }
    return visited;
  }

  /** Clear all variables (for re-execution) */
  clear(): void {
    this.variables.clear();
  }

  /** Snapshot current state for debugging */
  snapshot(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of this.variables) out[k] = v.value;
    return out;
  }
}

// ─── Condition Evaluator ─────────────────────────────────

export type ConditionMode = 'contains' | 'regex' | 'llm_judge';

export interface ConditionResult {
  branch: 'true' | 'false';
  reason: string;
}

/** Evaluate a condition node synchronously (contains/regex) */
export function evaluateCondition(
  value: string,
  mode: ConditionMode,
  pattern: string
): ConditionResult {
  if (mode === 'contains') {
    const match = value.toLowerCase().includes(pattern.toLowerCase());
    return {
      branch: match ? 'true' : 'false',
      reason: match ? `包含 "${pattern}"` : `不包含 "${pattern}"`,
    };
  }

  if (mode === 'regex') {
    try {
      const re = new RegExp(pattern, 'i');
      const match = re.test(value);
      return {
        branch: match ? 'true' : 'false',
        reason: match ? `匹配正则 /${pattern}/` : `不匹配正则 /${pattern}/`,
      };
    } catch {
      return { branch: 'false', reason: `无效正则: ${pattern}` };
    }
  }

  // llm_judge is handled externally (requires async AI call)
  return { branch: 'false', reason: 'LLM 判断需要异步执行' };
}

// ─── Template Helpers ────────────────────────────────────

/** Build a variable reference string for use in templates */
export function varRef(nodeId: string, portName: string): string {
  return `{{${nodeId}.${portName}}}`;
}

/** Extract all variable references from a template string */
export function extractRefs(template: string): Array<{ nodeId: string; portName: string }> {
  const refs: Array<{ nodeId: string; portName: string }> = [];
  const re = /\{\{([^}]+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    const trimmed = m[1].trim();
    const dotIdx = trimmed.indexOf('.');
    if (dotIdx !== -1) {
      refs.push({ nodeId: trimmed.slice(0, dotIdx), portName: trimmed.slice(dotIdx + 1) });
    }
  }
  return refs;
}

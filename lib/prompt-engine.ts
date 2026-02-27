// Handlebars-style prompt template engine
// Supports: {{prev.output}}, {{global.facts}}, {{user.input}}, {{node.label}}

import type { MemoryContext } from './types';

interface TemplateVars {
  prev: { output: string };
  global: { facts: string };
  user: { input: string };
  node: { label: string };
  [key: string]: Record<string, string>;
}

// Replace all {{path.key}} patterns with corresponding values
export function renderTemplate(
  template: string,
  vars: TemplateVars
): string {
  return template.replace(/\{\{(\w+)\.(\w+)\}\}/g, (match, ns, key) => {
    const group = vars[ns];
    if (group && typeof group[key] === 'string') {
      return group[key];
    }
    return match; // leave unresolved placeholders as-is
  });
}

// Build template variables from memory context and runtime info
export function buildTemplateVars(
  memory: MemoryContext,
  userInput: string,
  nodeLabel: string
): TemplateVars {
  return {
    prev: { output: memory.l2 || '' },
    global: { facts: memory.l3 || '' },
    user: { input: userInput },
    node: { label: nodeLabel },
  };
}

// Summarize text by truncating to a token-budget-friendly length
// This is a simple heuristic; real summarization would call an LLM
export function truncateSummary(text: string, maxChars: number = 2000): string {
  if (text.length <= maxChars) return text;
  const truncated = text.slice(0, maxChars);
  const lastPeriod = truncated.lastIndexOf('。');
  const lastDot = truncated.lastIndexOf('. ');
  const cutoff = Math.max(lastPeriod, lastDot);
  if (cutoff > maxChars * 0.5) {
    return truncated.slice(0, cutoff + 1) + '\n[...已截断]';
  }
  return truncated + '\n[...已截断]';
}

// Build L2 context: merge and summarize all parent outputs
export function buildL2Context(parentOutputs: string[]): string {
  if (parentOutputs.length === 0) return '';
  const merged = parentOutputs
    .map((o, i) => `[上游节点 ${i + 1} 输出]:\n${o}`)
    .join('\n\n');
  return truncateSummary(merged, 4000);
}

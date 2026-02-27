// Tool Executor — parses AI responses for tool blocks and executes them
// Bridges the gap between AI "describing" tool use and actually running it

import type { AgentToolName } from './types';

// C-3: Build headers with exec token for internal API calls
let cachedExecToken: string | null = null;

async function buildInternalHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  // Prefer token from Electron preload API.
  if (typeof window !== 'undefined') {
    if (!cachedExecToken && window.electronAPI?.getExecToken) {
      try {
        const t = await window.electronAPI.getExecToken();
        if (typeof t === 'string' && t.length > 0) {
          cachedExecToken = t;
        }
      } catch {
        // ignore
      }
    }

    const token = cachedExecToken || (window as any).__CHAINMIND_EXEC_TOKEN__;
    if (token) headers['x-exec-token'] = token;
  }

  return headers;
}

export interface ToolCall {
  tool: AgentToolName;
  args: string;       // raw content inside the code block
  filePath?: string;  // for writeFile: path after the colon
}

export interface ToolResult {
  tool: AgentToolName;
  args: string;
  ok: boolean;
  output: string;
  error?: string;
}

// Parse tool blocks from AI response content
// Format: ```tool:toolName\n...args...\n```
// For writeFile: ```tool:writeFile:/path/to/file\n...content...\n```
export function parseToolCalls(content: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const regex = /```tool:(\w+)(?::([^\n]*))?\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const tool = match[1] as AgentToolName;
    const filePath = match[2]?.trim() || undefined;
    const args = match[3].trim();
    calls.push({ tool, args, filePath });
  }
  return calls;
}

// Execute a single tool call against the backend APIs
export async function executeTool(
  call: ToolCall,
  allowedTools: AgentToolName[],
  cwd?: string,
): Promise<ToolResult> {
  // Permission check
  if (!allowedTools.includes(call.tool)) {
    return {
      tool: call.tool,
      args: call.args,
      ok: false,
      output: '',
      error: `权限不足: 该智能体没有 ${call.tool} 工具的使用权限`,
    };
  }

  try {
    switch (call.tool) {
      case 'terminal': {
        const res = await fetch('/api/exec', {
          method: 'POST',
          headers: await buildInternalHeaders(),
          body: JSON.stringify({
            command: call.args,
            cwd,
            timeout: 30000,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          return { tool: 'terminal', args: call.args, ok: true, output: data.stdout || '(无输出)' };
        }
        return { tool: 'terminal', args: call.args, ok: false, output: data.stdout || '', error: data.stderr || '命令执行失败' };
      }

      case 'readFile': {
        const res = await fetch('/api/files', {
          method: 'POST',
          headers: await buildInternalHeaders(),
          body: JSON.stringify({ action: 'read', path: call.args }),
        });
        const data = await res.json();
        if (data.ok) {
          return { tool: 'readFile', args: call.args, ok: true, output: data.content };
        }
        return { tool: 'readFile', args: call.args, ok: false, output: '', error: data.error || '读取失败' };
      }

      case 'writeFile': {
        const filePath = call.filePath || call.args.split('\n')[0];
        const content = call.filePath ? call.args : call.args.split('\n').slice(1).join('\n');
        const res = await fetch('/api/files', {
          method: 'POST',
          headers: await buildInternalHeaders(),
          body: JSON.stringify({ action: 'write', path: filePath, content }),
        });
        const data = await res.json();
        if (data.ok) {
          return { tool: 'writeFile', args: filePath, ok: true, output: `已写入 ${data.bytesWritten} 字节到 ${filePath}` };
        }
        return { tool: 'writeFile', args: filePath, ok: false, output: '', error: data.error || '写入失败' };
      }

      case 'listDir': {
        const res = await fetch('/api/files', {
          method: 'POST',
          headers: await buildInternalHeaders(),
          body: JSON.stringify({ action: 'list', path: call.args }),
        });
        const data = await res.json();
        if (data.ok) {
          const listing = data.items.map((i: { type: string; name: string }) =>
            `${i.type === 'dir' ? '📁' : '📄'} ${i.name}`
          ).join('\n');
          return { tool: 'listDir', args: call.args, ok: true, output: listing || '(空目录)' };
        }
        return { tool: 'listDir', args: call.args, ok: false, output: '', error: data.error || '列目录失败' };
      }

      case 'search': {
        // Search uses terminal grep under the hood
        const res = await fetch('/api/exec', {
          method: 'POST',
          headers: await buildInternalHeaders(),
          body: JSON.stringify({
            command: call.args,
            cwd,
            timeout: 15000,
          }),
        });
        const data = await res.json();
        return {
          tool: 'search',
          args: call.args,
          ok: data.ok ?? false,
          output: (data.stdout || '').slice(0, 5000) || '(无结果)',
          error: data.ok ? undefined : (data.stderr || '搜索失败'),
        };
      }

      default:
        return { tool: call.tool, args: call.args, ok: false, output: '', error: `未知工具: ${call.tool}` };
    }
  } catch (err) {
    return {
      tool: call.tool,
      args: call.args,
      ok: false,
      output: '',
      error: `执行异常: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// Execute all tool calls in a response, return formatted results string
export async function executeAllTools(
  content: string,
  allowedTools: AgentToolName[],
  cwd?: string,
): Promise<{ results: ToolResult[]; summary: string }> {
  const calls = parseToolCalls(content);
  if (calls.length === 0) return { results: [], summary: '' };

  const results: ToolResult[] = [];
  for (const call of calls) {
    const result = await executeTool(call, allowedTools, cwd);
    results.push(result);
  }

  const summary = results.map((r) => {
    const status = r.ok ? '✅' : '❌';
    const toolLabel = r.tool === 'terminal' ? '终端' : r.tool === 'readFile' ? '读取' : r.tool === 'writeFile' ? '写入' : r.tool === 'listDir' ? '目录' : '搜索';
    const output = r.ok ? r.output.slice(0, 500) : (r.error || '失败');
    return `${status} [${toolLabel}] ${r.args.split('\n')[0].slice(0, 80)}\n${output}`;
  }).join('\n\n');

  return { results, summary };
}

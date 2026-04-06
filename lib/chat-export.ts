// Chat export utilities — screenshot conversation as PNG, export as text/markdown
// Uses html-to-image (already installed) for image export.

import { toPng } from 'html-to-image';
import type { ChatMessage } from '@/lib/types';

/** Export a DOM element as PNG image and trigger download */
export async function exportChatAsImage(
  element: HTMLElement,
  filename = 'chat-export.png'
): Promise<void> {
  const dataUrl = await toPng(element, {
    quality: 0.95,
    pixelRatio: 2,
    backgroundColor: '#1a1a2e', // match dark theme bg
    filter: (node) => {
      // Skip buttons, inputs, and interactive elements
      if (node instanceof HTMLElement) {
        const tag = node.tagName?.toLowerCase();
        if (tag === 'button' || tag === 'textarea' || tag === 'input') return false;
        if (node.dataset?.exportIgnore === 'true') return false;
      }
      return true;
    },
  });
  downloadDataUrl(dataUrl, filename);
}

/** Export conversation messages as Markdown text */
export function exportChatAsMarkdown(
  messages: ChatMessage[],
  title = '对话记录'
): string {
  const lines: string[] = [`# ${title}`, ''];
  for (const msg of messages) {
    if (!msg.content.trim()) continue;
    const role = msg.role === 'user' ? '用户' : msg.role === 'assistant' ? 'AI' : '系统';
    const time = new Date(msg.timestamp).toLocaleString('zh-CN');
    lines.push(`## ${role} (${time})`);
    lines.push('');
    lines.push(msg.content);
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  return lines.join('\n');
}

/** Export conversation as plain text */
export function exportChatAsText(
  messages: ChatMessage[],
  title = '对话记录'
): string {
  const lines: string[] = [title, '='.repeat(title.length), ''];
  for (const msg of messages) {
    if (!msg.content.trim()) continue;
    const role = msg.role === 'user' ? '用户' : msg.role === 'assistant' ? 'AI' : '系统';
    const time = new Date(msg.timestamp).toLocaleString('zh-CN');
    lines.push(`[${role}] ${time}`);
    lines.push(msg.content);
    lines.push('');
  }
  return lines.join('\n');
}

/** Download a text string as a file */
export function downloadText(content: string, filename: string, mimeType = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, filename);
  URL.revokeObjectURL(url);
}

/** Trigger browser download from a data URL or blob URL */
function downloadDataUrl(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

# ChainMind YOLO Takeover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a result-first developer workflow where users can launch a template and get a usable artifact within 3 minutes.

**Architecture:** Add a feature-flagged outcome launcher, explicit template auto-execution paths for chat/chain, persisted outcome runs with ratings and 7-day trend analytics, and a mounted summary panel with copy/export actions.

**Tech Stack:** Next.js 14, React 18, Zustand, TypeScript, Vitest.

---

## File Structure Map

- `lib/types.ts`: outcome types (`OutcomeTemplate`, `OutcomeRun`, `OutcomeTrendPoint`).
- `lib/outcome-templates.ts` (new): template catalog and lookup.
- `lib/outcome-session.ts` (new): active run/session keys.
- `lib/outcome-export.ts` (new): markdown formatter + copy/export helpers.
- `stores/outcome-store.ts` (new): run lifecycle, ratings, metrics, 7-day trend.
- `stores/chat-store.ts`: add `startConversationWithPrompt` action.
- `stores/chain-store.ts`: add `createTemplateDiscussion` action with pending kickoff prompt.
- `components/OutcomeLauncher.tsx` (new): template entry surface.
- `components/OutcomeSummaryPanel.tsx` (new): result-first panel (artifact + trend + rating + export).
- `components/ChatPanel.tsx`: auto-send `pendingStarterPrompt`; finish outcome on stream success.
- `components/ChainPanel.tsx`: consume `pendingTemplatePrompt`; finish outcome on report completion.
- `app/workspace/page.tsx`: render launcher + summary panel, wire feature flag.
- `components/SetupWizard.tsx`: reduce to 3-step fast setup and route to templates.
- `tests/outcome-store.test.ts` (new)
- `tests/outcome-export.test.ts` (new)
- `tests/chat-store.test.ts` (modify)
- `tests/chain-store.test.ts` (modify)

### Task 1: Define Outcome Domain Types and Template Catalog

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/outcome-templates.ts`
- Create: `tests/outcome-store.test.ts`

- [ ] **Step 1: Write failing tests for template lookup**

```ts
import { describe, expect, it } from 'vitest';
import { OUTCOME_TEMPLATES, getOutcomeTemplateById } from '../lib/outcome-templates';

describe('outcome templates', () => {
  it('contains required starter templates', () => {
    expect(OUTCOME_TEMPLATES.map((x) => x.id)).toEqual(
      expect.arrayContaining(['dev-bugfix', 'dev-plan', 'dev-delivery'])
    );
  });
  it('resolves template by id', () => {
    expect(getOutcomeTemplateById('dev-plan')?.mode).toBe('chat');
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `npm test -- tests/outcome-store.test.ts`
Expected: FAIL (missing module/types).

- [ ] **Step 3: Add types and template module**

```ts
// lib/types.ts
export type OutcomeTemplateId = 'dev-bugfix' | 'dev-plan' | 'dev-delivery';
export interface OutcomeTemplate { id: OutcomeTemplateId; title: string; subtitle: string; mode: 'chat' | 'chain'; starterPrompt: string; successDefinition: string; tags: string[]; }
export interface OutcomeRating { score: 1 | 2 | 3 | 4 | 5; note?: string; }
export interface OutcomeRun { id: string; templateId: OutcomeTemplateId; startedAt: number; endedAt?: number; artifactTitle?: string; artifactPreview?: string; rating?: OutcomeRating; }
export interface OutcomeTrendPoint { date: string; runs: number; avgScore: number; }
```

```ts
// lib/outcome-templates.ts
import type { OutcomeTemplate, OutcomeTemplateId } from './types';
export const OUTCOME_TEMPLATES: OutcomeTemplate[] = [/* three templates */];
export function getOutcomeTemplateById(id: OutcomeTemplateId) { return OUTCOME_TEMPLATES.find((x) => x.id === id); }
```

- [ ] **Step 4: Run tests and verify pass**

Run: `npm test -- tests/outcome-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/outcome-templates.ts tests/outcome-store.test.ts
git commit -m "feat: add outcome template domain types"
```

### Task 2: Implement Outcome Store with Metrics and 7-Day Trend

**Files:**
- Create: `stores/outcome-store.ts`
- Modify: `tests/outcome-store.test.ts`

- [ ] **Step 1: Write failing lifecycle + trend tests**

```ts
it('tracks run lifecycle and rating', async () => {
  const { useOutcomeStore } = await import('../stores/outcome-store');
  const id = useOutcomeStore.getState().startRun('dev-bugfix');
  useOutcomeStore.getState().finishRun(id, '交付', '摘要');
  useOutcomeStore.getState().rateRun(id, { score: 5 });
  expect(useOutcomeStore.getState().runs[0]?.rating?.score).toBe(5);
});

it('returns exactly 7 trend points', async () => {
  const { useOutcomeStore } = await import('../stores/outcome-store');
  expect(useOutcomeStore.getState().getRecentTrend(7)).toHaveLength(7);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/outcome-store.test.ts`
Expected: FAIL (store missing).

- [ ] **Step 3: Implement persisted store with trend API**

```ts
// stores/outcome-store.ts
// actions: loadRuns/startRun/finishRun/rateRun/getMetrics/getRecentTrend
// persistence key: outcome-runs
// getRecentTrend(days=7): fixed window day buckets
```

- [ ] **Step 4: Run tests and verify pass**

Run: `npm test -- tests/outcome-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add stores/outcome-store.ts tests/outcome-store.test.ts
git commit -m "feat: add outcome run store with 7-day trend"
```

### Task 3: Add One-Click Template Auto-Execution Contracts

**Files:**
- Modify: `stores/chat-store.ts`
- Modify: `stores/chain-store.ts`
- Modify: `tests/chat-store.test.ts`
- Modify: `tests/chain-store.test.ts`

- [ ] **Step 1: Add failing test for chat one-click start action**

```ts
it('creates conversation with pending starter prompt', async () => {
  const { useChatStore } = await import('../stores/chat-store');
  const id = useChatStore.getState().startConversationWithPrompt('openai', 'gpt-4o-mini', 'starter');
  const conv = useChatStore.getState().conversations.find((c) => c.id === id);
  expect(conv?.pendingStarterPrompt).toBe('starter');
});
```

- [ ] **Step 2: Add failing test for chain one-click start action**

```ts
it('creates template discussion with pending kickoff prompt', async () => {
  const { useChainStore } = await import('../stores/chain-store');
  const id = useChainStore.getState().createTemplateDiscussion('Title', 'Kickoff prompt');
  const d = useChainStore.getState().discussions.find((x) => x.id === id);
  expect(d?.pendingTemplatePrompt).toBe('Kickoff prompt');
});
```

- [ ] **Step 3: Run tests and verify failures**

Run: `npm test -- tests/chat-store.test.ts tests/chain-store.test.ts`
Expected: FAIL (actions/fields missing).

- [ ] **Step 4: Implement explicit auto-execution contracts**

```ts
// stores/chat-store.ts
// add Conversation optional field: pendingStarterPrompt?: string
// add action: startConversationWithPrompt(provider, model, prompt)

// stores/chain-store.ts
// add ChainDiscussion optional field: pendingTemplatePrompt?: string
// add action: createTemplateDiscussion(title, prompt)
```

- [ ] **Step 5: Run tests and verify pass**

Run: `npm test -- tests/chat-store.test.ts tests/chain-store.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add stores/chat-store.ts stores/chain-store.ts tests/chat-store.test.ts tests/chain-store.test.ts lib/types.ts
git commit -m "feat: add one-click template execution contracts"
```

### Task 4: Implement Feature-Flagged Outcome Launcher in Workspace

**Files:**
- Create: `components/OutcomeLauncher.tsx`
- Create: `lib/outcome-session.ts`
- Modify: `app/workspace/page.tsx`

- [ ] **Step 1: Write failing helper test for launcher gating**

```ts
it('enables launcher only when flag is v1', () => {
  expect(computeShouldShowLauncher({ flag: 'v1', hasAnyKey: true, conversations: 0, discussions: 0 })).toBe(true);
  expect(computeShouldShowLauncher({ flag: null, hasAnyKey: true, conversations: 0, discussions: 0 })).toBe(false);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/chat-store.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement launcher UI + flag + launch handlers**

```tsx
// app/workspace/page.tsx
// 1) read localStorage flag chainmind-outcome-launcher
// 2) render OutcomeLauncher when enabled and user is early-stage
// 3) on launch: startRun + setActiveOutcomeRunId
// 4) chat template => startConversationWithPrompt
// 5) chain template => createTemplateDiscussion
```

- [ ] **Step 4: Run tests and lint**

Run: `npm test -- tests/chat-store.test.ts tests/chain-store.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/OutcomeLauncher.tsx lib/outcome-session.ts app/workspace/page.tsx tests/chat-store.test.ts
git commit -m "feat: add feature-flagged outcome launcher"
```

### Task 5: Capture Results Deterministically in Chat and Chain

**Files:**
- Modify: `components/ChatPanel.tsx`
- Modify: `components/ChainPanel.tsx`
- Modify: `stores/outcome-store.ts`

- [ ] **Step 1: Write failing chat completion test**

```ts
it('finishes outcome run after successful assistant stream', async () => {
  // arrange active run id + successful stream mock
  // assert finishRun called with artifact preview
});
```

- [ ] **Step 2: Write failing chain completion test**

```ts
it('finishes outcome run when report stage completes', async () => {
  // arrange discussion enters report with reporter turn done
  // assert finishRun called once
});
```

- [ ] **Step 3: Run tests and verify failure**

Run: `npm test -- tests/chat-store.test.ts tests/chain-store.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement exact triggers**

```tsx
// ChatPanel trigger:
// after streamChatRequest resolves AND fullContent !== '' AND streamError === ''
// => finishRun(activeRunId, '对话交付摘要', fullContent.slice(0, 280))

// ChainPanel trigger:
// when stage === 'report' and latest reporter turn is completed (isStreaming !== true, !error)
// => finishRun(activeRunId, '链式交付摘要', reportContent.slice(0, 280))
```

- [ ] **Step 5: Run tests and verify pass**

Run: `npm test -- tests/chat-store.test.ts tests/chain-store.test.ts tests/outcome-store.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/ChatPanel.tsx components/ChainPanel.tsx stores/outcome-store.ts tests/chat-store.test.ts tests/chain-store.test.ts
git commit -m "feat: capture outcomes from chat and chain completion"
```

### Task 6: Build and Mount Result-First Summary Panel with Copy/Export

**Files:**
- Create: `components/OutcomeSummaryPanel.tsx`
- Create: `lib/outcome-export.ts`
- Create: `tests/outcome-export.test.ts`
- Modify: `app/workspace/page.tsx`

- [ ] **Step 1: Write failing export helper tests**

```ts
import { describe, expect, it } from 'vitest';
import { buildOutcomeMarkdown } from '../lib/outcome-export';

describe('outcome export', () => {
  it('builds markdown content', () => {
    const md = buildOutcomeMarkdown({ id: 'r1', templateId: 'dev-plan', startedAt: 1, artifactTitle: '交付', artifactPreview: '摘要' });
    expect(md).toContain('# 交付');
    expect(md).toContain('摘要');
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/outcome-export.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement panel and mount in workspace**

```tsx
// OutcomeSummaryPanel props:
// run, trend, onRate, onCopy, onExport
// UI sections:
// 1) artifact title/preview
// 2) rating controls
// 3) copy/export actions
// 4) last 7-day trend rows

// app/workspace/page.tsx:
// render panel near top of main content area, before detailed panels
```

- [ ] **Step 4: Run tests and lint**

Run: `npm test -- tests/outcome-export.test.ts tests/outcome-store.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/OutcomeSummaryPanel.tsx lib/outcome-export.ts tests/outcome-export.test.ts app/workspace/page.tsx
git commit -m "feat: add mounted result-first summary panel"
```

### Task 7: Simplify Setup Wizard and Route to Template Path

**Files:**
- Modify: `components/SetupWizard.tsx`
- Modify: `app/workspace/page.tsx`

- [ ] **Step 1: Write failing test for setup fast-path helper**

```ts
it('allows setup completion when at least one provider key exists', () => {
  expect(canFinishSetup({ claude: 'sk-12345678901', openai: '', gemini: '' })).toBe(true);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/chat-store.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement fast wizard and template CTA**

```tsx
// SetupWizard to 3 steps:
// 欢迎 -> API 配置 -> 开始使用
// finish step includes:
// - "直接进入工作台"
// - "用模板开始（推荐）" -> sets launcher flag + closes wizard
```

- [ ] **Step 4: Run tests/lint/build**

Run: `npm run lint && npm test -- tests/chat-store.test.ts && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/SetupWizard.tsx app/workspace/page.tsx tests/chat-store.test.ts
git commit -m "feat: simplify setup and route to outcome templates"
```

### Task 8: Make Process-Heavy Sections Collapsible by Default

**Files:**
- Modify: `app/workspace/page.tsx`
- Modify: `components/ChatPanel.tsx`
- Modify: `components/ChainPanel.tsx`

- [ ] **Step 1: Write failing helper test for default collapsed behavior**

```ts
it('defaults process sections to collapsed in result-first mode', () => {
  expect(getProcessPanelDefaultState({ resultFirst: true })).toBe('collapsed');
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/chat-store.test.ts tests/chain-store.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement collapsible process sections**

```tsx
// app/workspace/page.tsx
// add processPanelCollapsed state default true when result-first mode enabled

// ChatPanel.tsx / ChainPanel.tsx
// wrap process-heavy blocks with collapsible container
// header button: "展开过程细节 / 收起过程细节"
// keep result summary always visible
```

- [ ] **Step 4: Run tests/lint/build**

Run: `npm test -- tests/chat-store.test.ts tests/chain-store.test.ts && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/workspace/page.tsx components/ChatPanel.tsx components/ChainPanel.tsx tests/chat-store.test.ts tests/chain-store.test.ts
git commit -m "feat: add default-collapsed process panels for result-first layout"
```

## Verification Gate

- [ ] Run: `npm test --run`
- [ ] Run: `npm run lint`
- [ ] Run: `npm run build`
- [ ] Manual checks:
  - with `localStorage.chainmind-outcome-launcher='v1'`, launcher appears for early users
  - clicking a template immediately starts chat/chain execution path
  - summary panel is visible above deep workflow sections
  - process-heavy sections are collapsed by default and can be expanded
  - copy/export markdown works
  - 7-day trend renders and updates after ratings

## Rollout Notes

- Controlled release via `localStorage.chainmind-outcome-launcher='v1'`.
- Keep legacy chat-first path as fallback until metrics validate lift.
- Roll back by clearing the feature-flag key.

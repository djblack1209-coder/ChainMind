# ChainMind 升级设计文档

> 生成时间: 2026-03-22 | 基于代码审查 + GitHub调研

---

## 一、现状短板（已确认）

| 模块 | 问题 | 严重性 |
|------|------|--------|
| `tool-executor.ts` | 正则解析工具调用，无JSON Schema验证，静默失败 | 🔴 高 |
| `memory-system.ts` | 向量未持久化，无去重合并，记忆无限膨胀 | 🔴 高 |
| `llm-client.ts` | 无fallback/重试/成本路由，provider挂掉直接报错 | 🔴 高 |
| `ChainPanel.tsx` | 48KB+单文件，状态+渲染+业务全混，技术债 | 🟡 中 |
| 工具调用协议 | 自定义 ```tool:xxx``` 格式，不兼容OpenAI/Anthropic原生规范 | 🟡 中 |
| 流式UI | 无打字机节奏控制，长流输出体验差 | 🟡 中 |

---

## 二、可搬运的高星项目清单

### 🔴 第一优先级（核心可靠性）

#### 1. Vercel AI SDK (`ai` + `@ai-sdk/react`) — 12k stars
- **搬运内容**: `streamText` 流式层 + 原生tool_call schema验证 + `useChat` 钩子
- **替换目标**: `llm-client.ts` 手写SSE + `tool-executor.ts` 正则解析
- **安装**: `npm install ai @ai-sdk/openai @ai-sdk/anthropic`
- **收益**: 工具调用100%兼容OpenAI/Anthropic规范，内置流式节流，内置重试

#### 2. 记忆去重合并算法（移植自mem0 Python核心逻辑）
- **搬运内容**: `mem0/memory/main.py` 的 `_add_to_vector_store` + `_update_memory` 算法
- **核心逻辑**: ADD时先搜索相似记忆（cosine > 0.9则更新，< 0.7才新增），用LLM判断合并策略
- **实现量**: ~120行TS，替换现有 `addMemory` 方法
- **配合**: 把向量存储持久化写入SQLite（WAL模式已有，加一张 `memories` 表）

### 🟡 第二优先级（LLM路由层）

#### 3. litellm路由模式（借鉴设计，TS重写）
- **不引入Python依赖**，只借鉴 `litellm/router.py` 的设计模式
- **实现内容**:
  ```
  ModelRouter {
    primary: { provider, model }
    fallbacks: [{ provider, model }, ...]
    retryConfig: { maxRetries: 3, backoff: 'exponential' }
    healthCheck: 每5分钟ping，自动标记不可用
  }
  ```
- **实现量**: ~150行，新建 `lib/model-router.ts`，`llm-client.ts` 接入

### 🟢 第三优先级（UI体验）

#### 4. `assistant-ui` — YC支持，专为AI对话UI
- **安装**: `npm install @assistant-ui/react`
- **搬运内容**: 工具调用三态可视化（调用中/成功/失败），替换现有emoji状态显示
- **headless**: 样式完全受控，兼容现有暗色主题

#### 5. `shiki` — 18k stars 语法高亮
- **安装**: `npm install shiki`
- **替换**: 检查 `MarkdownRenderer.tsx` 当前高亮方案，换成shiki的 `github-dark` 主题
- **收益**: 更多语言支持，主题更美，支持行高亮

#### 6. `cmdk` — 命令面板
- **安装**: `npm install cmdk`
- **用途**: 斜杠命令做成真正的VSCode风格命令面板
- **实现量**: ~80行，替换现有简单下拉

### 🔵 第四优先级（DAG增强）

#### 7. `elkjs` — ReactFlow官方推荐自动布局
- **安装**: `npm install elkjs web-worker`
- **用途**: FlowCanvas一键自动排版DAG，解决节点手动摆放问题
- **实现量**: ~50行，接入ReactFlow的 `useLayoutEffect`

---

## 三、方案选择

### 方案A：全面升级（4-6周）
按优先级全部推进，彻底解决技术债。风险：ChainPanel重构风险高。

### 方案B：精准手术（1-2周）★推荐★
三个独立改动，不破坏主流程：
1. Vercel AI SDK替换工具调用层（工具可靠性）
2. 记忆去重合并算法（记忆质量）
3. assistant-ui工具可视化 + shiki高亮（体验）

### 方案C：单点突破（3-5天）
只做工具调用协议迁移到OpenAI原生function calling，解锁后续所有升级的基础。

---

## 四、实现顺序（方案B细化）

```
Task 1: 工具调用协议迁移
  - lib/tool-executor.ts → 支持OpenAI tool_call格式
  - lib/llm-client.ts → 接入ai SDK的streamText
  - 验证: 现有工具（terminal/readFile/writeFile/search）全部通过

Task 2: 记忆系统重构
  - lib/memory-system.ts → addMemory加去重合并
  - electron/db.ts → 新增memories持久化表
  - lib/vector-store.ts → 向量数据写入SQLite
  - 验证: 重复信息不再重复存储，重启后记忆不丢失

Task 3: UI体验升级
  - components/chat/MarkdownRenderer.tsx → 换shiki
  - components/chain/ToolCallBlock.tsx → 新建，用assistant-ui
  - components/SlashCommandPalette.tsx → 换cmdk
  - 验证: 代码块高亮正常，工具调用有三态

Task 4: LLM路由层（可选，独立）
  - lib/model-router.ts → 新建
  - lib/llm-client.ts → 接入路由
  - 验证: 主provider宕机时自动fallback
```

---

## 五、风险评估

| 改动 | 风险 | 缓解措施 |
|------|------|----------|
| 工具调用协议迁移 | 中：影响所有工具使用路径 | 保留旧格式解析作为fallback，渐进迁移 |
| 记忆系统重构 | 低：独立模块，接口不变 | 接口保持兼容，内部替换 |
| UI组件替换 | 低：视觉层变更，不影响业务 | 逐组件替换，可随时回滚 |
| LLM路由层 | 低：新增层，不改现有逻辑 | 路由器默认透传，降级到直连 |

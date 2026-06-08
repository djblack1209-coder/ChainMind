# ChainMind 当前项目全景地图与推进报告

生成日期：2026-06-04  
工作区：`/Users/blackdj/Desktop/AI Chain Discussion`  
定位：基于当前工作区源码、git 状态、历史文档和静态验证结果的产品/项目状态报告

## 1. 一句话结论

ChainMind 是一个本地优先的 AI 协作桌面应用，目标是把「多模型对话、链式多智能体协作、工作流执行、本地知识库、MCP/插件、后台管理、备份更新」集中在一个 Electron + Next.js 工作台里。

但当前仓库不是稳定可运行态，而是一次大规模改造后的中间态。核心入口、Electron preload、core IPC、共享类型文件等关键文件在当前工作区被删除，导致主工作台和桌面能力链路断裂。下一步最佳方向不是继续扩展功能，而是先恢复可运行主线。

## 2. 当前用户侧地图

从使用者角度，这个项目设计上应该是一套「AI Chain IDE」：

```text
启动应用
  |
  v
工作台 /workspace
  |
  +-- API 设置：配置 Claude / OpenAI / Gemini / Ollama / 中转服务
  +-- 单模型对话：流式聊天、图片、文件引用、记忆、导出
  +-- 链式讨论：多个 AI 角色按阶段协作，产出方案、任务、报告
  +-- 模型对比：同一问题并行比较多个模型输出
  +-- 本地知识库：选择目录、索引文件、搜索上下文
  +-- 终端/工具：执行命令、读写文件、搜索代码
  +-- MCP/插件：连接外部 MCP server 或本地插件
  +-- 后台管理：用户、配置、日志、插件、版本、备份等
```

当前实际状态：

```text
启动应用
  |
  v
/ 页面
  |
  v
跳转 /workspace
  |
  v
断裂：app/workspace/page.tsx 当前被删除
```

因此，项目的产品能力在代码层大量存在，但当前用户入口没有接上。

## 3. 系统分层地图

### 3.1 桌面壳层

核心文件：

- `electron/main.js`
- `electron/server-manager.js`
- `electron/window-manager.js`
- `electron/llm-proxy.js`
- `electron/database.js`
- `electron/db-service.js`
- `electron/ipc-db-handlers.js`

能力：

- 启动内置 Next.js server。
- 创建 Electron BrowserWindow。
- 初始化 SQLite、认证、插件、MCP、文件索引、WebDAV、自动更新。
- 提供数据库 IPC。

当前问题：

- `electron/main.js` 仍然 `require('./ipc-core-handlers')`。
- 但 `electron/ipc-core-handlers.js` 当前被删除。
- `electron/window-manager.js` 仍引用 `preload.js`。
- 但 `electron/preload.js` 当前被删除。

结论：

桌面壳的设计是完整的，但当前 Electron 启动链路处于断裂状态。

### 3.2 前端页面层

当前实际存在的页面：

- `app/page.tsx`
- `app/admin/page.tsx`
- `app/admin/config/page.tsx`
- `app/admin/profile/page.tsx`
- `app/api/chat/route.ts`
- `app/api/exec/route.ts`
- `app/api/files/route.ts`
- `app/api/probe-models/route.ts`

历史/设计中存在但当前缺失：

- `app/workspace/page.tsx`
- `app/login/page.tsx`
- `app/admin/user/page.tsx`
- `app/admin/role/page.tsx`
- `app/admin/menu/page.tsx`
- `app/admin/api/page.tsx`
- `app/admin/dict/page.tsx`
- `app/admin/params/page.tsx`
- `app/admin/tools/*`

结论：

当前前端页面只保留了极简后台和 API 路由，主产品工作台缺失。历史报告中提到的 17 个后台页面在当前工作区并不成立。

### 3.3 AI 对话层

核心文件：

- `components/ChatPanel.tsx`
- `components/chat/*`
- `stores/chat-store.ts`
- `stores/api-key-store.ts`
- `lib/llm-client.ts`
- `app/api/chat/route.ts`
- `lib/llm-core.js`
- `lib/chat-controller.ts`
- `lib/chat-export.ts`

已具备能力：

- 多 provider 模型配置。
- 流式输出。
- 中止 streaming。
- 会话 IndexedDB 持久化。
- 标签、置顶、归档、文件夹管理。
- 图片上传。
- 代码块 artifact 面板。
- Markdown/图片导出。
- 记忆注入。
- 文件引用搜索。

当前问题：

- `ChatPanel` 没有主工作台挂载入口。
- 多处依赖 `@/lib/types`，但 `lib/types.ts` 当前缺失。
- API Key 管理 UI 文件 `components/ApiKeyManager.tsx` 当前被删除。

结论：

聊天能力接近可闭环，但入口和共享类型缺失使它当前不可用。

### 3.4 链式讨论层

核心文件：

- `stores/chain-store.ts`
- `lib/chain-workflow.ts`
- `lib/agent-config.ts`
- `lib/use-execution-engine.ts`
- `lib/execution-engine.ts`
- `components/chain/ExecutionTimeline.tsx`
- `components/chain/HumanApprovalCard.tsx`

历史核心 UI：

- `components/ChainPanel.tsx`

已具备能力：

- 创建链式讨论。
- 多智能体角色定义。
- 引导式协作阶段。
- 方案解析与选择。
- 团队任务分配。
- 评分记忆与自适应 profile。
- 顺序/并行/层级执行引擎。
- 人工审批节点。

当前问题：

- `components/ChainPanel.tsx` 当前被删除。
- 链式讨论无法从 UI 使用。
- 工具调用仍依赖自定义 ```tool:xxx``` 协议。

结论：

链式讨论的业务模型和引擎仍在，但用户侧闭环断在 UI。

### 3.5 工作流/DAG 层

核心文件：

- `stores/flow-store.ts`
- `stores/workflow-store.ts`
- `lib/dag-engine.ts`
- `lib/flow-nodes.ts`
- `lib/flow-variables.ts`
- `components/flow/*`
- `components/AINode.tsx`
- `components/NodeConfigPanel.tsx`
- `components/ExecutionPanel.tsx`

已具备能力：

- ReactFlow 节点/边状态。
- AI 节点、条件节点、人工审核节点、代码节点、HTTP 节点、循环节点。
- 多工作流保存、加载、重命名、复制、删除。
- 节点执行结果面板。

当前问题：

- 当前没有可见页面挂载 FlowCanvas/工作流编辑界面。
- `lib/types.ts` 缺失会影响节点数据类型。

结论：

DAG 的底层能力存在，但产品入口没有闭合。

### 3.6 本地知识库层

核心文件：

- `components/KnowledgeBasePanel.tsx`
- `electron/file-indexer.js`
- `lib/file-indexer-client.ts`

已具备能力：

- Electron 模式选择目录。
- 文件监听与增量索引。
- 文本 chunk。
- 本地关键词/近似搜索。
- 搜索结果复制。

当前问题：

- `KnowledgeBasePanel` 调用了 `window.electronAPI?.showOpenDialog`，但 preload 历史 API 是 `openDirectory` / `openFile` / `saveFile`，存在 API 名称不匹配。
- 没有主工作台挂载入口。
- 不是语义向量搜索，更接近本地文本索引搜索。

结论：

文件索引后台闭环较完整，但 UI 接口和入口需要修正。

### 3.7 MCP 与插件层

核心文件：

- `electron/mcp-client.js`
- `stores/mcp-store.ts`
- `components/MCPConfigPanel.tsx`
- `electron/plugin-manager.js`
- `electron/plugin-worker.js`
- `electron/plugin-template/*`

已具备能力：

- MCP stdio transport。
- MCP 初始化、工具列表、工具调用。
- 自动重连。
- pending request timeout。
- 插件 Worker 沙箱。
- 插件 load/unload/list/call。

当前问题：

- `MCPConfigPanel` 是本地 mock 状态，显示 URL server，但后台只支持 stdio command/args/env。
- `stores/mcp-store.ts` 有真实连接逻辑，但当前面板未充分接入。
- 插件系统缺少完整用户界面。

结论：

后台能力明显强于前端产品化程度。MCP/插件适合下一阶段重点打磨。

### 3.8 后台管理层

核心文件：

- `app/admin/layout.tsx`
- `app/admin/page.tsx`
- `app/admin/config/page.tsx`
- `app/admin/profile/page.tsx`
- `electron/db-service.js`
- `electron/ipc-db-handlers.js`

当前可见页面：

- 管理概览
- 系统配置
- 个人中心

底层数据库能力：

- 用户
- 角色/权限
- 菜单
- API
- 字典
- 参数
- 配置
- 操作日志
- 登录日志
- 错误日志
- 公告
- 版本
- 插件注册
- 导出模板
- API Token

当前问题：

- 大量 DB/IPC 能力没有页面入口。
- Admin dashboard 仍有跳转到不存在路径的卡片，例如 `/admin/user`、`/admin/role`、`/admin/menu`、`/admin/api`。
- `返回工作台` 指向 `/workspace`，当前也不存在。

结论：

后台管理底座较完整，但 UI 当前只剩一小部分，且存在死链接。

## 4. 功能状态矩阵

| 功能域 | 用户价值 | 当前状态 | 判断 |
|---|---|---|---|
| 主工作台 | 所有核心能力入口 | 断裂 | P0 修复 |
| API Key 设置 | 接入模型 | 逻辑存在，UI 文件被删 | P0 修复 |
| 单模型对话 | 日常 AI 使用 | 逻辑接近完整，入口断裂 | P0/P1 |
| 流式输出 | 体验核心 | HTTP/Electron 双路径存在 | 已接近闭环 |
| 会话管理 | 长期使用 | store 完整 | 已接近闭环 |
| 对话导出 | 交付输出 | 代码存在 | 待入口验证 |
| 记忆系统 | 越用越懂用户 | localStorage/Orama，非 SQLite | 可用但需增强 |
| 文件引用 | 本地上下文 | 文件索引存在 | 入口/API 需修 |
| 链式讨论 | 核心差异化 | 引擎/store 存在，UI 被删 | P1 恢复 |
| 多模型比较 | 评估模型 | 组件存在 | 待入口挂载 |
| DAG 工作流 | 高级自动化 | store/节点/引擎存在 | 待产品化 |
| MCP | 外部工具扩展 | 后台存在，UI 未接实 | P1 打磨 |
| 插件 | 可扩展能力 | 沙箱存在，UI 缺 | P2 |
| 后台配置 | 系统维护 | 3 页可用 | 局部闭环 |
| 用户/权限管理 | 管理后台 | 底层有，页面缺 | 待恢复/裁剪 |
| WebDAV 备份 | 数据安全 | 后台有，UI 缺 | P2 |
| 自动更新 | 分发能力 | 后台有，需发行配置 | P2 |
| 测试/验证 | 质量保障 | 脚本有，依赖缺失 | P0 环境修复 |

## 5. 已完成闭环

这些能力从代码结构看已经具备较完整链路，恢复入口后可优先验证：

1. LLM 流式请求链路

   - 前端：`lib/llm-client.ts`
   - API：`app/api/chat/route.ts`
   - 核心适配：`lib/llm-core.js`
   - Electron：`electron/llm-proxy.js`

2. 对话数据持久化

   - `stores/chat-store.ts`
   - `lib/storage.ts`
   - IndexedDB 前缀 `aichain:`

3. API Key 加密存储

   - `stores/api-key-store.ts`
   - `lib/crypto.ts`
   - Electron secure secret fallback 控制

4. SQLite 后台数据服务

   - `electron/database.js`
   - `electron/db-service.js`
   - `electron/ipc-db-handlers.js`

5. MCP 后台连接能力

   - `electron/mcp-client.js`
   - 支持 connect / disconnect / list tools / call tool

6. 插件沙箱

   - `electron/plugin-manager.js`
   - `electron/plugin-worker.js`
   - Worker 隔离和超时终止

7. 文件索引后台

   - `electron/file-indexer.js`
   - `lib/file-indexer-client.ts`

## 6. 当前关键断裂点

### 6.1 主入口断裂

`app/page.tsx` 会跳转到 `/workspace`，但 `app/workspace/page.tsx` 当前被删除。

影响：

- 用户无法进入主产品。
- ChatPanel、ChainPanel、ModelCompare、Terminal、KnowledgeBase 等核心组件无法使用。
- Admin 的「返回工作台」也会跳到不存在页面。

### 6.2 Electron 桥接断裂

当前被删除：

- `electron/preload.js`
- `electron/ipc-core-handlers.js`
- `lib/electron-api.d.ts`

影响：

- `window.electronAPI` 无法暴露。
- 桌面端认证、文件选择、LLM proxy、MCP、插件、数据库、WebDAV、更新等前端调用都会失效。
- `electron/main.js` 启动时 require 缺失模块，可能直接崩溃。

### 6.3 共享类型断裂

当前缺失：

- `lib/types.ts`

但大量文件仍导入：

- `stores/chat-store.ts`
- `stores/api-key-store.ts`
- `stores/chain-store.ts`
- `stores/flow-store.ts`
- `components/ChatPanel.tsx`
- `components/SetupWizard.tsx`
- `components/ModelCompare.tsx`
- `lib/llm-client.ts`
- `lib/execution-engine.ts`
- 以及更多模块

影响：

- TypeScript 编译无法通过。
- Next.js 构建无法稳定完成。
- 模型/provider/message/workflow/tool 类型全局失去定义源。

### 6.4 依赖环境缺失

验证结果：

- `npm run lint`：`eslint: command not found`
- `npm test`：`vitest: command not found`
- `npx tsc --noEmit`：误触发安装非目标 `tsc@2.0.4`

影响：

- 当前无法证明 lint/test/typecheck 通过。
- 历史报告中的测试通过结论不能直接套用到当前工作区。

### 6.5 历史报告与当前状态不一致

历史报告声称：

- 工作台存在。
- ChainPanel 存在。
- ApiKeyManager 存在。
- preload 存在。
- 17 个后台页面存在。

当前工作区实际：

- 上述多项文件被删除。
- 后台只剩 3 个页面。

结论：

当前项目不能按历史报告判断可用性，必须按当前 git 状态重新收敛。

## 7. 哪些功能适合细致拆解打磨

### 7.1 工作台重建

这是第一优先级，因为它决定所有功能是否能被用户触达。

建议拆为：

- 顶部模型/状态栏
- 左侧会话/功能导航
- 主区 Chat / Chain / Compare 三模式
- 右侧可选上下文/Artifacts/知识库面板
- 底部 Terminal/日志抽屉
- 弹窗：API Key、MCP、Prompt 模板、设置向导

### 7.2 `lib/types.ts` 重构

不要只机械恢复旧文件。建议拆成更清晰的类型域：

- `lib/types/model.ts`
- `lib/types/chat.ts`
- `lib/types/chain.ts`
- `lib/types/flow.ts`
- `lib/types/tools.ts`
- `lib/types/index.ts`

但短期为了恢复构建，可以先恢复单文件 `lib/types.ts`，之后再拆。

### 7.3 链式讨论体验

`ChainPanel` 历史上体积很大，适合拆成：

- 需求接待区
- 方案候选/选择区
- 阶段时间线
- 团队执行看板
- 交叉验证区
- 最终报告区
- 评分和自适应记忆区

这会让「AI 链式讨论平台」真正成为产品核心，而不是一个长组件。

### 7.4 MCP 管理

当前后端支持 stdio MCP，但 UI 写的是 URL server。建议统一为：

- command
- args
- env
- status
- tools list
- test connect
- call sample
- reconnect status

如果未来要 HTTP/SSE MCP，再作为新 transport 增加，不要混在现有 stdio 配置里。

### 7.5 工具调用协议

当前 `lib/tool-executor.ts` 解析 ```tool:xxx``` 代码块。这能跑 demo，但不适合作为长期工具协议。

建议路线：

- 短期保留旧格式，确保已有链路可用。
- 中期增加 JSON Schema tool call。
- 长期接 OpenAI/Anthropic/Vercel AI SDK 原生工具调用格式。

### 7.6 后台管理范围裁剪

这里需要做一个产品判断：

- 如果 ChainMind 是个人/小团队 AI 工作台，完整 GVA 后台可能过重。
- 如果 ChainMind 是可分发企业工具，用户/权限/日志/插件/版本/Token 管理就有价值。

建议当前先保留：

- 系统配置
- API Key/模型配置
- 插件/MCP 管理
- 日志/错误日志
- 备份恢复
- 个人中心

用户/角色/菜单/API/字典/参数可以后置，避免后台牵引主产品。

## 8. 推荐推进路线

### 阶段 0：恢复项目可验证状态

目标：让项目能安装依赖、跑 typecheck、跑 lint/test。

具体动作：

1. 确认 `node_modules` 当前缺失或不完整，执行依赖安装。
2. 恢复 `lib/types.ts`。
3. 恢复 `electron/preload.js`。
4. 恢复 `electron/ipc-core-handlers.js`。
5. 恢复 `lib/electron-api.d.ts`。
6. 恢复最小 `app/workspace/page.tsx`。
7. 执行：
   - `npm run lint`
   - `npx tsc --noEmit`
   - `npm test`

成功标准：

- `/workspace` 可访问。
- Electron 不因缺模块崩溃。
- TypeScript 无模块解析错误。
- 关键测试可跑。

### 阶段 1：最小产品闭环

目标：用户打开应用后可以完成一次真实 AI 使用。

闭环路径：

```text
打开应用
  -> 进入 /workspace
  -> 配置 API Key / Base URL
  -> 新建对话
  -> 发送消息
  -> 流式返回
  -> 保存会话
  -> 导出结果
```

优先接入：

- ApiKeyManager
- ChatPanel
- Chat store
- LLM API route
- Export

暂缓：

- 链式讨论
- DAG 工作流
- MCP
- 插件
- WebDAV
- 自动更新

原因：

如果单模型对话闭环不稳定，多智能体和插件只会放大问题。

### 阶段 2：恢复差异化能力

目标：让 ChainMind 区别于普通聊天工具。

优先接入：

- ChainPanel 或重构后的链式讨论 UI。
- ModelCompare。
- KnowledgeBasePanel。
- TerminalPanel。

成功标准：

- 能从一个模糊需求启动链式讨论。
- 能得到方案、任务拆分、执行输出、交付报告。
- 能把本地文件搜索结果注入对话。

### 阶段 3：工具生态产品化

目标：把 MCP/插件变成可配置、可诊断、可复用的扩展能力。

优先事项：

- MCP 配置 UI 接真实 stdio config。
- 展示 tools list。
- 提供连接测试和调用测试。
- 把工具调用结果以结构化 UI 展示。
- 插件 registry 与沙箱状态页。

成功标准：

- 用户能添加一个 MCP server。
- 能看到工具列表。
- 能在 AI 流程中调用工具。
- 失败时能看到清晰错误和重连状态。

### 阶段 4：产品化与分发

目标：从开发工具变成可交付应用。

优先事项：

- WebDAV 备份 UI。
- 自动更新 UI。
- 错误日志/诊断页。
- Apple 签名与公证。
- 首次启动引导。
- 用户文档。

## 9. 当前最佳单点行动

推荐立即做这件事：

恢复最小工作台和缺失基础文件，而不是继续开发新功能。

最小恢复范围：

- `app/workspace/page.tsx`
- `components/ApiKeyManager.tsx`
- `components/ChainPanel.tsx` 可先不完整恢复，但至少不要让引用断裂
- `electron/preload.js`
- `electron/ipc-core-handlers.js`
- `lib/electron-api.d.ts`
- `lib/types.ts`

如果要更保守：

- 先只恢复 `lib/types.ts`、`electron/preload.js`、`electron/ipc-core-handlers.js`、`lib/electron-api.d.ts`。
- 然后新建一个极简 `/workspace`，只挂 `ChatPanel` 和 `ApiKeyManager`。
- 链式讨论后置。

这是风险最低的路径，因为它先建立可运行基线，再逐步挂回高复杂度模块。

## 10. 验证记录

已执行检查：

- 初始化 Codegraph 索引：成功，索引 131 个文件，少量文件无法解析但不影响主体判断。
- `git status --short`：发现 6 个 tracked 文件被删除，新增 `.codegraph/`。
- `npm run lint`：失败，`eslint` 命令不存在。
- `npx tsc --noEmit`：失败，当前环境没有本地 TypeScript 编译器，`npx` 误拉 `tsc@2.0.4`。
- `npm test`：失败，`vitest` 命令不存在。

当前 git 状态关键项：

```text
D app/workspace/page.tsx
D components/ApiKeyManager.tsx
D components/ChainPanel.tsx
D electron/ipc-core-handlers.js
D electron/preload.js
D lib/electron-api.d.ts
?? .codegraph/
```

## 11. 结论

这个项目的底层野心和技术铺垫都很大：它不是一个简单聊天应用，而是一个本地 AI 协作工作台。代码里已经有很多有价值的模块，包括 LLM 网关、会话存储、链式协作模型、执行引擎、MCP、插件沙箱、文件索引、SQLite 管理和备份更新。

当前最大问题不是缺想法，也不是缺模块，而是主线被中间态改造打断了。应该先把「启动、进入工作台、配置模型、完成一轮对话」恢复成稳定闭环，再把链式讨论、知识库、MCP 和插件逐层挂回。

如果要把它推进成真正可用的产品，下一步最有效的工作不是新增功能，而是恢复可运行基线并收紧产品入口。

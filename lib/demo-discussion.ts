import type { ChainWorkflowStage } from "./types";

// Authored teaching material, never presented as a live model run or benchmark.
// This module deliberately has no API, Electron, storage, or credential imports.
export type DemoPlan = "local" | "cloud";
export type DemoLanguage = "en" | "zh";

export const DEMO_STAGES: {
  id: ChainWorkflowStage;
  en: string;
  zh: string;
  role: string;
}[] = [
  {
    id: "intake",
    en: "Frame the problem",
    zh: "澄清需求",
    role: "Product lead",
  },
  {
    id: "expert_review",
    en: "Review the trade-offs",
    zh: "评审方案",
    role: "Architect + reviewer",
  },
  {
    id: "team_assignment",
    en: "Divide the work",
    zh: "团队分工",
    role: "Technical lead",
  },
  {
    id: "team_execution",
    en: "Build a testable plan",
    zh: "制定可验证的实现",
    role: "Frontend + backend",
  },
  {
    id: "report",
    en: "Deliver a decision",
    zh: "交付决策报告",
    role: "Delivery lead",
  },
];

const PLAN_NAMES = {
  en: { local: "Local-first workspace", cloud: "Shared cloud workspace" },
  zh: { local: "本地优先工作台", cloud: "云端共享工作台" },
};

export function demoPlanName(plan: DemoPlan, language: DemoLanguage) {
  return PLAN_NAMES[language][plan];
}

export function demoContent(
  stage: number,
  plan: DemoPlan,
  language: DemoLanguage,
): string {
  const local = plan === "local";
  if (language === "zh") {
    return (
      [
        "### 先明确需要做出的决策\n为一个 3 人开发团队设计 AI 代码评审助手。成员希望引入不同角色的意见，并保留最终决策的依据。\n\n- **输入**：代码变更、需求与约束。\n- **输出**：风险清单、实现任务与验收标准。\n- **约束**：使用自己的模型账户；初期避免运维负担。\n\n**人工决策点**：优先满足本地隐私，还是跨设备共享？",
        local
          ? "### 方案 A · 先做好单机闭环\n使用 Electron 承载工作台；会话通过 IndexedDB 保存，桌面管理数据使用 SQLite。模型请求由本机转发。\n\n**评审意见**\n- 本地存储不代表模型推理离线：发送给云模型的内容会离开设备。\n- 文件和命令工具需要明确权限边界。\n- 团队同步暂缓，先验证需求 → 评审 → 交付流程。"
          : "### 方案 B · 共享优先，增加服务端边界\n引入经过认证的后端、持久化数据库和任务队列，团队成员通过浏览器共享讨论记录。\n\n**评审意见**\n- 需要租户隔离、配额、密钥托管和审计策略。\n- 请求取消与重试不能重复扣费或重复执行工具。\n- 这是方案演示；当前 ChainMind 尚未提供云端团队协作。",
        `### 把选择转化成明确责任\n| 角色 | 交付内容 | 验收依据 |\n| :--- | :--- | :--- |\n| 前端 | 阶段视图、流式输出、停止按钮 | 中止后不再追加文本 |\n| 后端 | ${local ? "桌面 IPC 与模型适配" : "认证 API 与任务队列"} | 错误可追踪，取消可传播 |\n| 评审 | ${local ? "本地数据与工具权限边界" : "租户隔离与配额边界"} | 拒绝未授权操作 |\n\n每个任务都对应可观察的结果，避免只得到一份泛泛的建议。`,
        `### 先验证最小用户路径\n1. 用户提交代码变更与约束。\n2. ${local ? "渲染进程通过 preload 调用主进程的模型适配器。" : "客户端通过认证 API 创建一个可追踪的评审任务。"}\n3. 角色按阶段产出意见，并在决策点等待用户选择。\n4. 用户停止生成时，取消信号传到实际请求。\n5. 保存讨论；重新打开并导出 Markdown。\n\n**建议测试**：分片 SSE、上游失败、用户取消、存储恢复。以上是示例验收计划，不是已完成的压测结果。`,
        `### 决策：${PLAN_NAMES.zh[plan]}\n${local ? "先交付单机可用的评审工作台，再根据使用反馈决定是否增加团队同步。" : "如果跨设备共享是硬性需求，先建立认证、隔离和任务持久化，再接入 AI 协作。"}\n\n**近期交付**\n- 一条可重复的评审流程。\n- 包含来源、分工与验收条件的报告。\n- 明确错误、取消与重试的用户反馈。\n\n**尚待验证**\n${local ? "真实模型质量、签名安装包、跨设备数据迁移。" : "租户隔离、队列恢复、配额控制与部署运维。当前产品未实现这些云端能力。"}\n\n> 本报告来自内置教学示例，未经实时模型生成。`,
      ][stage] ?? ""
    );
  }
  return (
    [
      "### Start with a decision, not another prompt\nDesign an AI code-review assistant for a three-person engineering team. Bring different perspectives into the review and keep the reasoning behind the final decision.\n\n- **Input:** a code change, requirements, and constraints.\n- **Output:** risks, implementation tasks, and acceptance criteria.\n- **Constraint:** bring your own model account; keep initial operations simple.\n\n**Human decision:** prioritize local ownership or cross-device collaboration?",
      local
        ? "### Plan A · Make the local loop work first\nUse Electron for the workspace, IndexedDB for conversations, and SQLite for desktop administration data. Route model requests through the local application.\n\n**Reviewer notes**\n- Local storage does not mean offline inference. Cloud models still receive the context you send.\n- File and command tools need explicit permission boundaries.\n- Defer team sync until the brief → review → delivery loop is useful."
        : "### Plan B · Sharing introduces a service boundary\nAdd an authenticated backend, persistent database, and job queue so team members can share review sessions in a browser.\n\n**Reviewer notes**\n- Define tenant isolation, quotas, secret storage, and audit policies.\n- Cancellation and retries must not duplicate charges or tool execution.\n- This is a design example. ChainMind does not currently implement cloud team collaboration.",
      `### Turn a decision into ownership\n| Role | Deliverable | Acceptance signal |\n| :--- | :--- | :--- |\n| Frontend | Stage view, streaming, stop control | No appended text after cancellation |\n| Backend | ${local ? "Desktop IPC and model adapters" : "Authenticated API and job queue"} | Traceable errors and propagated cancellation |\n| Reviewer | ${local ? "Local data and tool boundaries" : "Tenant and quota boundaries"} | Unauthorized operations rejected |\n\nEach task has an observable result, so the discussion can become an implementation plan.`,
      `### Verify one complete user journey\n1. Submit a code change with its constraints.\n2. ${local ? "Call the main-process model adapter through the preload bridge." : "Create a traceable review job through an authenticated API."}\n3. Produce role-specific reviews and pause at the human decision point.\n4. Propagate cancellation to the actual request when the user stops generation.\n5. Save the discussion, reopen it, and export Markdown.\n\n**Proposed tests:** split SSE chunks, upstream failure, user cancellation, and storage recovery. This is a sample acceptance plan, not a completed benchmark.`,
      `### Decision: ${PLAN_NAMES.en[plan]}\n${local ? "Deliver a usable single-machine review workspace first. Let actual usage determine whether team synchronization is worth adding." : "If cross-device sharing is essential, build authentication, isolation, and durable jobs before adding AI collaboration."}\n\n**Next deliverables**\n- One repeatable review workflow.\n- A report with context, ownership, and acceptance criteria.\n- Clear feedback for errors, cancellation, and retries.\n\n**Still to validate**\n${local ? "Live model quality, signed installers, and cross-device data migration." : "Tenant isolation, queue recovery, quotas, and deployment operations. These cloud capabilities are not implemented in the current product."}\n\n> This report uses authored sample content. No live model was called.`,
    ][stage] ?? ""
  );
}

export function exportDemoMarkdown(
  plan: DemoPlan,
  language: DemoLanguage,
): string {
  return [
    "# ChainMind · Sample discussion",
    "> Authored demo content · No live AI inference · Not a benchmark",
    `Selected plan: ${demoPlanName(plan, language)}`,
    ...DEMO_STAGES.map(
      (stage, index) =>
        `## ${stage[language]}\n\n${demoContent(index, plan, language)}`,
    ),
  ].join("\n\n---\n\n");
}

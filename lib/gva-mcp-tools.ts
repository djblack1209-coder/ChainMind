// GVA MCP Tool Definitions — ported from gin-vue-admin server/mcp/
// These tools can be exposed via ChainMind's MCP Client or used directly by agents

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

// All GVA MCP tools ported to TypeScript definitions
export const GVA_MCP_TOOLS: MCPToolDefinition[] = [
  {
    name: 'requirement_analyzer',
    description: '需求分析工具 — 将自然语言需求分解为结构化的模块设计方案，包括模块架构、字段设计、字典规划',
    inputSchema: {
      type: 'object',
      properties: {
        requirement: {
          type: 'string',
          description: '用户的自然语言需求描述',
        },
        context: {
          type: 'string',
          description: '项目上下文信息（可选）',
        },
      },
      required: ['requirement'],
    },
  },
  {
    name: 'gva_analyze',
    description: '项目分析工具 — 扫描现有代码包/模块、清理空包、扫描预设模块和插件目录，返回项目当前状态',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: '项目根目录路径',
        },
        scanPlugins: {
          type: 'boolean',
          description: '是否扫描插件目录',
        },
      },
      required: ['projectPath'],
    },
  },
  {
    name: 'gva_execute',
    description: '代码生成执行工具 — 根据执行计划生成完整的 CRUD 代码，包括模型、服务、API、路由、前端页面',
    inputSchema: {
      type: 'object',
      properties: {
        plan: {
          type: 'object',
          description: '执行计划，包含包信息、模块定义、字段、关联关系、字典定义',
          properties: {
            packageName: { type: 'string' },
            moduleName: { type: 'string' },
            fields: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: { type: 'string' },
                  comment: { type: 'string' },
                  dataSource: { type: 'string' },
                },
              },
            },
            dictionaries: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  values: { type: 'array', items: { type: 'object' } },
                },
              },
            },
          },
        },
      },
      required: ['plan'],
    },
  },
  {
    name: 'gva_review',
    description: '代码审查工具 — 审查生成的代码质量，检查分层架构合规性、Swagger注释完整性、类型一致性',
    inputSchema: {
      type: 'object',
      properties: {
        filePaths: {
          type: 'array',
          items: { type: 'string' },
          description: '待审查的文件路径列表',
        },
        checkSwagger: {
          type: 'boolean',
          description: '是否检查 Swagger 注释',
        },
        checkTypes: {
          type: 'boolean',
          description: '是否检查类型一致性',
        },
      },
      required: ['filePaths'],
    },
  },
  {
    name: 'create_api',
    description: 'API 创建工具 — 在系统中注册 API 权限记录（单个或批量）',
    inputSchema: {
      type: 'object',
      properties: {
        apis: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'API 路径' },
              method: { type: 'string', description: 'HTTP 方法' },
              apiGroup: { type: 'string', description: 'API 分组' },
              description: { type: 'string', description: 'API 描述' },
            },
            required: ['path', 'method', 'apiGroup', 'description'],
          },
        },
      },
      required: ['apis'],
    },
  },
  {
    name: 'create_menu',
    description: '菜单创建工具 — 创建前端侧边栏菜单，支持父子层级、图标、按钮权限',
    inputSchema: {
      type: 'object',
      properties: {
        parentId: { type: 'number', description: '父菜单 ID（0 为顶级）' },
        path: { type: 'string', description: '路由路径' },
        name: { type: 'string', description: '路由名称' },
        component: { type: 'string', description: '组件路径' },
        title: { type: 'string', description: '菜单标题' },
        icon: { type: 'string', description: '菜单图标' },
        sort: { type: 'number', description: '排序权重' },
        keepAlive: { type: 'boolean', description: '是否缓存' },
        buttons: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              desc: { type: 'string' },
            },
          },
        },
      },
      required: ['path', 'name', 'component', 'title'],
    },
  },
  {
    name: 'list_apis',
    description: 'API 列表工具 — 查询系统中已注册的所有 API 权限记录',
    inputSchema: {
      type: 'object',
      properties: {
        apiGroup: { type: 'string', description: '按分组过滤' },
        method: { type: 'string', description: '按 HTTP 方法过滤' },
      },
    },
  },
  {
    name: 'list_menus',
    description: '菜单列表工具 — 查询系统中已注册的所有菜单',
    inputSchema: {
      type: 'object',
      properties: {
        parentId: { type: 'number', description: '按父菜单过滤' },
      },
    },
  },
  {
    name: 'dictionary_generator',
    description: '字典生成工具 — 创建数据字典（枚举值集合），用于下拉选择等场景',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '字典名称' },
        type: { type: 'string', description: '字典类型标识' },
        description: { type: 'string', description: '字典描述' },
        values: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              value: { type: 'number' },
              sort: { type: 'number' },
            },
          },
        },
      },
      required: ['name', 'type', 'values'],
    },
  },
  {
    name: 'dictionary_query',
    description: '字典查询工具 — 查询已有的数据字典及其值',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: '字典类型标识' },
        keyword: { type: 'string', description: '关键词搜索' },
      },
    },
  },
];

// Helper: get tool by name
export function getMCPTool(name: string): MCPToolDefinition | undefined {
  return GVA_MCP_TOOLS.find((t) => t.name === name);
}

// Helper: build tool description for agent system prompt injection
export function buildMCPToolPrompt(toolNames?: string[]): string {
  const tools = toolNames
    ? GVA_MCP_TOOLS.filter((t) => toolNames.includes(t.name))
    : GVA_MCP_TOOLS;

  if (tools.length === 0) return '';

  const lines = tools.map((t) => `- **${t.name}**: ${t.description}`).join('\n');
  return `\n\n## GVA MCP 工具\n以下工具可通过 MCP 协议调用：\n${lines}`;
}

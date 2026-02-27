// ChainMind Plugin Template — reference implementation
// Place this folder in ~/Library/Application Support/chainmind/plugins/

module.exports = {
  // Called when plugin is loaded
  async register({ pluginDir }) {
    console.log(`[ExamplePlugin] Registered from ${pluginDir}`);
  },

  // Called when plugin is unloaded
  unregister() {
    console.log('[ExamplePlugin] Unregistered');
  },

  // Optional: expose MCP-compatible tools
  tools: [
    {
      name: 'example_greet',
      description: '示例工具 — 返回问候语',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '你的名字' },
        },
        required: ['name'],
      },
      async handler({ name }) {
        return { content: [{ type: 'text', text: `你好, ${name}! 这是来自示例插件的问候。` }] };
      },
    },
  ],
};

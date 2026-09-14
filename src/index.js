import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Store } from './store.js';
import { Bridge } from './bridge.js';
import { registerTools } from './tools.js';

const store = new Store();
const bridge = new Bridge(store);

const server = new McpServer({
  name: 'readdit-later',
  version: '1.1.0'
});

registerTools(server, store, bridge);

bridge.start();

const transport = new StdioServerTransport();
await server.connect(transport);

process.stderr.write('[readdit-mcp] MCP server running — waiting for extension connection\n');

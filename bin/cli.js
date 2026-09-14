#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir, platform } from 'os';
import { execSync } from 'child_process';

const args = process.argv.slice(2);

if (args[0] === 'setup') {
  setup();
} else {
  // Default: run the MCP server
  await import('../src/index.js');
}

function setup() {
  console.log('\n  Readdit Later MCP — Setup\n');

  const configs = getConfigPaths();
  let configured = false;

  for (const { name, path, key } of configs) {
    if (!path) continue;

    try {
      const dir = join(path, '..');
      if (!existsSync(dir)) continue;

      if (!existsSync(path)) writeFileSync(path, '{}');

      const raw = readFileSync(path, 'utf8');
      const config = JSON.parse(raw || '{}');

      if (!config.mcpServers) config.mcpServers = {};

      if (config.mcpServers['readdit-later']) {
        console.log(`  ✓ ${name} — already configured`);
        configured = true;
        continue;
      }

      // Find npx path
      const npxCmd = platform() === 'win32' ? 'npx.cmd' : 'npx';
      let npxPath;
      try {
        npxPath = execSync(`${platform() === 'win32' ? 'where' : 'which'} npx`, { encoding: 'utf8' }).trim().split('\n')[0].trim();
      } catch {
        npxPath = npxCmd;
      }

      config.mcpServers['readdit-later'] = {
        command: npxPath,
        args: ['readdit-later-mcp']
      };

      writeFileSync(path, JSON.stringify(config, null, 2));
      console.log(`  ✓ ${name} — configured at ${path}`);
      configured = true;
    } catch (err) {
      console.log(`  ✗ ${name} — failed: ${err.message}`);
    }
  }

  if (!configured) {
    console.log('  No AI tool config files found. Add this manually:\n');
    printManualConfig();
  }

  console.log('\n  Next steps:');
  console.log('  1. Restart your AI tool (Claude Desktop, Cursor, etc.)');
  console.log('  2. Open Chrome — the Readdit Later extension connects automatically');
  console.log('  3. Ask Claude: "Search my saved Reddit posts about TypeScript"\n');
}

function getConfigPaths() {
  const home = homedir();
  const p = platform();

  let claudeDir;
  if (p === 'win32') claudeDir = join(process.env.APPDATA || '', 'Claude');
  else if (p === 'darwin') claudeDir = join(home, 'Library', 'Application Support', 'Claude');
  else claudeDir = join(home, '.config', 'Claude');

  return [
    { name: 'Claude Desktop', path: join(claudeDir, 'claude_desktop_config.json'), key: 'mcpServers' },
    { name: 'Cursor', path: join(home, '.cursor', 'mcp.json'), key: 'mcpServers' },
    { name: 'Windsurf', path: join(home, '.windsurf', 'mcp.json'), key: 'mcpServers' }
  ];
}

function printManualConfig() {
  console.log(`    {
      "mcpServers": {
        "readdit-later": {
          "command": "npx",
          "args": ["readdit-later-mcp"]
        }
      }
    }`);
}

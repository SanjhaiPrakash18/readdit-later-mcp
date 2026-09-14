# Readdit Later MCP Server

Search, organize, and chat with your saved Reddit posts from Claude, Cursor, Windsurf, and any MCP-compatible AI tool.

Readdit Later is a Chrome extension that backs up and organizes your saved Reddit posts and comments — past Reddit's 1,000-item limit. This MCP server connects that library to your AI tools, so your saves become something you can actually use instead of a pile you never revisit.

- Website: https://readditlater.in/mcp
- Chrome extension: https://chromewebstore.google.com/detail/jdceogapnjfcfdklbpnllbmnjbfmfejk
- Privacy policy: https://sanjhaiprakash18.github.io/Readdit-Later-Privacy-Policy/

## What you can do

- Semantic search across every saved post and comment — "find that post about negotiating a raise" works even when the title says something completely different
- Filter by subreddit, author, label, read status, content type, score, or date range
- Get reading recommendations from your unread backlog
- Analyze your library: topic clusters, save patterns, cross-subreddit connections
- Label posts, add notes, mark read, and manage collections by asking in plain language
- Export to JSON, CSV, Markdown, HTML, Obsidian, or sync to Notion

## Two ways to connect

### Remote connector (Claude web, desktop & mobile)

1. Install the Readdit Later extension and let your saves sync.
2. In the extension, click **Connect to AI** in the sidebar, then **Create my private link**.
3. In Claude, go to **Settings → Connectors → Add custom connector** and paste:

```
https://reddit-later-server.vercel.app/mcp
```

4. Click **Connect** and sign in with the access code shown in the extension.

Claude Code users can add it from the terminal instead:

```
claude mcp add --transport http readdit-later https://reddit-later-server.vercel.app/mcp
```

### Local server (Claude Desktop, Cursor, Windsurf)

One command configures your tools automatically:

```
npx readdit-later-mcp setup
```

Restart your AI tool and keep Chrome open — the extension supplies live data, with an offline cache as fallback.

Manual configuration, if you prefer:

```json
{
  "mcpServers": {
    "readdit-later": {
      "command": "npx",
      "args": ["readdit-later-mcp"]
    }
  }
}
```

## Tools

The local server exposes 20 tools. All tools carry MCP annotations — read tools are marked read-only, and destructive actions are flagged and require explicit confirmation.

| Category | Tools |
| --- | --- |
| Read | `search_posts`, `get_post`, `get_stats`, `list_subreddits`, `list_labels`, `list_collections`, `get_insights`, `connection_status` |
| Write | `label_posts`, `remove_label`, `mark_read`, `add_note`, `delete_posts`, `create_collection`, `add_to_collection`, `remove_from_collection`, `delete_collection` |
| Export | `export_posts` (JSON, CSV, Markdown, HTML, Obsidian) |
| Notion | `sync_to_notion`, `export_to_notion` |

The remote connector exposes an extended search and insight toolset (semantic search, recommendations, expertise map, cross-connections, debates) plus the same core actions.

## Requirements

- Node.js 18+
- The Readdit Later Chrome extension with a Pro or Lifetime plan (AI tool access is a premium feature)

## How it works

The local server is a thin bridge: it connects to the Readdit Later extension over a local WebSocket for live data and falls back to a local cache when Chrome is closed. Your library, sync engine, and search live in the extension and the Readdit Later service — this package is the MCP adapter.

## License

MIT

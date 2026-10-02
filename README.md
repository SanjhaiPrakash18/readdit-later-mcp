# Readdit Later MCP Server

The only MCP server built for your **personal Reddit saved posts**. Search, organize, label, export, and manage your Reddit saves from Claude, Cursor, Windsurf, or any MCP-compatible AI tool.

Other Reddit MCP servers browse public subreddits. This one connects to **your** save library - semantic search, labeling, notes, collections, and export to Notion/CSV/Markdown, all from inside your AI workflow.

[![npm version](https://img.shields.io/npm/v/readdit-later-mcp)](https://www.npmjs.com/package/readdit-later-mcp)
[![Smithery](https://smithery.ai/badge/readdit-later/mcp-server)](https://smithery.ai/server/readdit-later/mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Two connection modes

### Remote MCP (Claude web, desktop, mobile)

No install needed. Create your private connector URL in the Readdit Later Chrome extension:

1. Open the extension and go to **Connect to AI**
2. Click **Create my private link** and copy the URL
3. In Claude, go to **Settings > Connectors > Add custom connector**
4. Paste the URL - works on web, desktop, and mobile

Remote URL: `https://reddit-later-server.vercel.app/mcp`

### Local MCP (Cursor, Claude Desktop, Windsurf)

```bash
npx readdit-later-mcp setup
```

This auto-configures Claude Desktop, Cursor, and Windsurf. Or add manually to your MCP config:

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

The local server connects to the Chrome extension via WebSocket for live data, with offline cache fallback.

## Tools

### Read (work offline with cached data)

| Tool | Description |
|------|-------------|
| `search_posts` | Search by keyword, subreddit, tag, author, content type, read status, date range. Ranked by relevance. |
| `get_post` | Get full details of a saved post by ID |
| `get_stats` | Library stats - total posts, subreddits, labels, read/unread counts |
| `list_subreddits` | All subreddits in your library with post counts |
| `list_labels` | All labels/tags with post counts |
| `list_collections` | All reading collections/lists |
| `export_posts` | Export as JSON, CSV, Markdown, HTML, or Obsidian format |
| `connection_status` | Check extension connection and sync status |
| `get_insights` | Analyze save patterns - topic clusters, cross-pollination, save streaks |

### Read (remote server - semantic search)

| Tool | Description |
|------|-------------|
| `semantic_search` | Search by meaning, not just keywords. "that post about system design interviews" works even if no title matches. |
| `find_similar_posts` | Find posts similar to a given post |
| `get_recent` | Get recently saved posts |
| `get_unread` | Get unread posts |
| `get_notes` | Get posts with personal notes |
| `get_reminders` | Get posts with reminders set |
| `recommend_posts` | Get AI-recommended posts based on your interests |
| `analyze_collection` | Analyze a collection for themes and patterns |
| `get_expertise_map` | Map your knowledge areas based on saves |
| `find_cross_connections` | Find unexpected connections between saved topics |
| `find_debates` | Find contrasting viewpoints in your saves |
| `get_post_content` | Get the full text content of a saved post |
| `extract_links` | Extract all links from a saved post |
| `list_auto_collections` | List AI-generated collections |

### Write (require live extension connection)

| Tool | Description |
|------|-------------|
| `label_posts` | Add labels/tags to posts |
| `remove_label` | Remove a label from posts |
| `mark_read` | Mark posts as read/unread |
| `add_note` | Add a personal note to posts |
| `delete_posts` | Delete saved posts permanently |
| `create_collection` | Create a new reading collection |
| `add_to_collection` | Add posts to a collection |
| `remove_from_collection` | Remove posts from a collection |
| `delete_collection` | Delete a collection (posts are kept) |
| `sync_to_notion` | Sync all posts to Notion (deduplicates automatically) |
| `export_to_notion` | Export specific posts to Notion |

## What you can do

Ask your AI assistant in plain English:

- "Search my saved posts about TypeScript"
- "Find that post about system design interviews I saved last month"
- "Label all my cooking posts as Recipes"
- "Create a collection called Interview Prep with my career posts"
- "Export my finance saves to CSV"
- "Sync my latest saves to Notion"
- "What topics do I save the most?"
- "Find connections between my programming and business saves"

## How it works

```
Claude/Cursor/Windsurf
        |
    MCP Protocol
        |
  Readdit Later MCP Server
        |
   Chrome Extension (WebSocket bridge)
        |
   Your Reddit saved posts (synced + cached)
```

The local server communicates with the Readdit Later Chrome extension over a local WebSocket. When the extension is open, you get live data. When it's not, the server uses its local cache.

The remote server connects directly to your synced library in the cloud via a private, revocable link with 90-day token rotation.

## Requirements

- [Readdit Later Chrome extension](https://chromewebstore.google.com/detail/jdceogapnjfcfdklbpnllbmnjbfmfejk) (works on Chrome, Brave, Edge, Arc)
- Node.js 18+ (for local MCP)
- Pro or Lifetime plan for MCP access

## Privacy

- Remote connections use a private, revocable link with 90-day token rotation
- Local MCP runs entirely on your machine - no data leaves your device unless you export
- No Reddit API keys required - the extension handles authentication via OAuth
- Your data is never shared with other users or used for training

## Links

- [Chrome Web Store](https://chromewebstore.google.com/detail/jdceogapnjfcfdklbpnllbmnjbfmfejk)
- [Website](https://readditlater.com)
- [MCP Setup Guide](https://readditlater.com/guides/connect-reddit-saves-to-claude)
- [npm](https://www.npmjs.com/package/readdit-later-mcp)

## License

MIT

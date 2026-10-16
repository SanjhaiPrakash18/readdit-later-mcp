import { z } from 'zod';

export function registerTools(server, store, bridge) {

  // MCP tool annotations — behavior hints for clients (and directory reviewers).
  const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  const SAFE_WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  const DESTRUCTIVE_WRITE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };
  // add_note replaces any existing note, so it can overwrite user data.
  const OVERWRITE_WRITE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };
  const NOTION_WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true };

  // ── Read Tools (live from extension when connected, cached fallback) ──

  server.tool(
    'search_posts',
    'Search saved Reddit posts by keyword, subreddit, tag, author, content type, read status, or date range. Returns all matching results ranked by relevance — no arbitrary limit.',
    {
      query: z.string().optional().describe('Search keywords (matches title, body, subreddit, author, notes, labels). Posts are scored across multiple fields and ranked by relevance.'),
      subreddit: z.string().optional().describe('Filter by subreddit name (without r/ prefix)'),
      tag: z.string().optional().describe('Filter by label/tag name'),
      content_type: z.enum(['image', 'video', 'text', 'link']).optional().describe('Filter by post type'),
      read_status: z.enum(['read', 'unread']).optional().describe('Filter by read/unread status'),
      author: z.string().optional().describe('Filter by Reddit username (without u/ prefix)'),
      item_type: z.enum(['post', 'comment']).optional().describe('Filter posts vs saved comments'),
      min_score: z.number().optional().describe('Minimum upvote score'),
      min_comments: z.number().optional().describe('Minimum comment count'),
      time_filter: z.enum(['day', 'week', 'month', 'year']).optional().describe('Filter by age'),
      sort_by: z.enum(['relevance', 'newest', 'oldest', 'most_upvoted', 'most_commented', 'alphabetical']).optional().describe('Sort order (default: relevance when query is present, newest otherwise)'),
      limit: z.number().optional().describe('Max results to return (omit to return all matches)')
    },
    READ_ONLY,
    async (params) => {
      let results;
      if (bridge.isConnected) {
        try {
          results = await bridge.sendCommand('search_posts', params);
        } catch { /* fall through to cache */ }
      }
      if (!results) results = store.searchPosts(params);

      if (results.length === 0) {
        return { content: [{ type: 'text', text: 'No saved posts match that query.' }] };
      }

      const hasQuery = params.query && params.query.trim().length > 0;
      const header = hasQuery
        ? `Found ${results.length} result${results.length === 1 ? '' : 's'} for "${params.query}":`
        : `Found ${results.length} post${results.length === 1 ? '' : 's'}:`;

      const formatted = results.map((p, i) => formatPost(p, i + 1, hasQuery));
      return {
        content: [{ type: 'text', text: `${header}\n\n${formatted.join('\n\n')}` }]
      };
    }
  );

  server.tool(
    'get_post',
    'Get full details of a specific saved post by its ID',
    { post_id: z.string().describe('The post ID') },
    READ_ONLY,
    async ({ post_id }) => {
      let post;
      if (bridge.isConnected) {
        try {
          post = await bridge.sendCommand('get_post', { post_id });
        } catch { /* fall through to cache */ }
      }
      if (!post) post = store.getPost(post_id);
      if (!post) return { content: [{ type: 'text', text: 'Post not found.' }] };
      return { content: [{ type: 'text', text: formatPostDetailed(post) }] };
    }
  );

  server.tool(
    'get_stats',
    'Get library statistics — total posts, subreddits, labels, read/unread counts, top subreddits and labels',
    {},
    READ_ONLY,
    async () => {
      let stats;
      if (bridge.isConnected) {
        try {
          stats = await bridge.sendCommand('get_stats', {});
        } catch { /* fall through to cache */ }
      }
      if (!stats) stats = store.getStats();
      return { content: [{ type: 'text', text: formatStats(stats) }] };
    }
  );

  server.tool(
    'list_subreddits',
    'List all subreddits in the saved library with post counts',
    {},
    READ_ONLY,
    async () => {
      let subs;
      if (bridge.isConnected) {
        try {
          subs = await bridge.sendCommand('get_subreddits', {});
        } catch { /* fall through to cache */ }
      }
      if (!subs) subs = store.getSubreddits();
      if (subs.length === 0) return { content: [{ type: 'text', text: 'No subreddits found.' }] };

      const total = subs.reduce((s, x) => s + x.count, 0);
      const lines = subs.map((s, i) => `${i + 1}. r/${s.name} — ${s.count} post${s.count === 1 ? '' : 's'}`);
      return {
        content: [{
          type: 'text',
          text: `# Subreddits (${subs.length} total, ${total} posts)\n\n${lines.join('\n')}`
        }]
      };
    }
  );

  server.tool(
    'list_labels',
    'List all labels/tags in the saved library with post counts',
    {},
    READ_ONLY,
    async () => {
      let labels;
      if (bridge.isConnected) {
        try {
          labels = await bridge.sendCommand('get_labels', {});
        } catch { /* fall through to cache */ }
      }
      if (!labels) labels = store.getLabels();
      if (labels.length === 0) return { content: [{ type: 'text', text: 'No labels found.' }] };

      const total = labels.reduce((s, x) => s + x.count, 0);
      const lines = labels.map((l, i) => `${i + 1}. ${l.name} — ${l.count} post${l.count === 1 ? '' : 's'}`);
      return {
        content: [{
          type: 'text',
          text: `# Labels (${labels.length} total, ${total} posts)\n\n${lines.join('\n')}`
        }]
      };
    }
  );

  server.tool(
    'list_collections',
    'List all reading collections/lists',
    {},
    READ_ONLY,
    async () => {
      if (bridge.isConnected) {
        try {
          const result = await bridge.sendCommand('list_collections', {});
          return { content: [{ type: 'text', text: formatCollections(result) }] };
        } catch { /* fall through to cached */ }
      }
      return { content: [{ type: 'text', text: formatCollections(store.collections) }] };
    }
  );

  // ── Write Tools (require live extension connection) ────────────

  server.tool(
    'label_posts',
    'Add a label/tag to one or more posts. Search first to get post IDs.',
    {
      post_ids: z.array(z.string()).describe('Array of post IDs to label'),
      label: z.string().describe('The label to add')
    },
    SAFE_WRITE,
    async (params) => {
      return await execCommand(bridge, 'label_posts', params);
    }
  );

  server.tool(
    'remove_label',
    'Remove a label/tag from one or more posts',
    {
      post_ids: z.array(z.string()).describe('Array of post IDs'),
      label: z.string().describe('The label to remove')
    },
    SAFE_WRITE,
    async (params) => {
      return await execCommand(bridge, 'remove_label', params);
    }
  );

  server.tool(
    'mark_read',
    'Mark one or more posts as read or unread',
    {
      post_ids: z.array(z.string()).describe('Array of post IDs'),
      is_read: z.boolean().describe('true = mark as read, false = mark as unread')
    },
    SAFE_WRITE,
    async (params) => {
      return await execCommand(bridge, 'mark_read', params);
    }
  );

  server.tool(
    'add_note',
    'Add a personal note to one or more posts',
    {
      post_ids: z.array(z.string()).describe('Array of post IDs'),
      note: z.string().describe('The note text to attach')
    },
    OVERWRITE_WRITE,
    async (params) => {
      return await execCommand(bridge, 'add_note', params);
    }
  );

  server.tool(
    'delete_posts',
    'Remove one or more posts from the Readdit Later library (does not unsave them on Reddit)',
    {
      post_ids: z.array(z.string()).describe('Array of post IDs to delete')
    },
    DESTRUCTIVE_WRITE,
    async (params) => {
      return await execCommand(bridge, 'delete_posts', params);
    }
  );

  server.tool(
    'create_collection',
    'Create a new reading collection/list with selected posts',
    {
      name: z.string().describe('Collection name'),
      description: z.string().optional().describe('Collection description'),
      post_ids: z.array(z.string()).describe('Array of post IDs to include')
    },
    SAFE_WRITE,
    async (params) => {
      return await execCommand(bridge, 'create_collection', params);
    }
  );

  server.tool(
    'add_to_collection',
    'Add posts to an existing collection',
    {
      collection_name: z.string().describe('Name of the collection'),
      post_ids: z.array(z.string()).describe('Array of post IDs to add')
    },
    SAFE_WRITE,
    async (params) => {
      return await execCommand(bridge, 'add_to_collection', params);
    }
  );

  server.tool(
    'remove_from_collection',
    'Remove posts from a collection',
    {
      collection_name: z.string().describe('Name of the collection'),
      post_ids: z.array(z.string()).describe('Array of post IDs to remove')
    },
    SAFE_WRITE,
    async (params) => {
      return await execCommand(bridge, 'remove_from_collection', params);
    }
  );

  server.tool(
    'delete_collection',
    'Delete a collection (posts are not deleted)',
    {
      collection_name: z.string().describe('Name of the collection to delete')
    },
    DESTRUCTIVE_WRITE,
    async (params) => {
      return await execCommand(bridge, 'delete_collection', params);
    }
  );

  server.tool(
    'export_posts',
    'Export posts as JSON, CSV, or Markdown',
    {
      post_ids: z.array(z.string()).optional().describe('Specific post IDs to export (omit for all)'),
      format: z.enum(['json', 'csv', 'markdown', 'html', 'obsidian']).optional().describe('Export format (default: json)')
    },
    READ_ONLY,
    async ({ post_ids, format = 'json' }) => {
      let posts;
      if (bridge.isConnected) {
        try {
          if (post_ids) {
            const fetched = [];
            for (const id of post_ids) {
              const p = await bridge.sendCommand('get_post', { post_id: id });
              if (p) fetched.push(p);
            }
            posts = fetched;
          } else {
            posts = await bridge.sendCommand('search_posts', {});
          }
        } catch { /* fall through to cache */ }
      }
      if (!posts) {
        posts = post_ids
          ? post_ids.map(id => store.getPost(id)).filter(Boolean)
          : store.posts;
      }

      if (posts.length === 0) return { content: [{ type: 'text', text: 'No posts to export.' }] };

      let output;
      switch (format) {
        case 'csv':
          output = postsToCSV(posts);
          break;
        case 'markdown':
          output = postsToMarkdown(posts);
          break;
        case 'html':
          output = postsToHTML(posts);
          break;
        case 'obsidian':
          output = postsToObsidian(posts);
          break;
        default:
          output = JSON.stringify(posts.map(p => ({
            id: p.id, title: p.title, subreddit: p.subreddit, author: p.author,
            url: p.url, score: p.score, num_comments: p.num_comments,
            labels: p.tags || p.labels || [], note: p.note || '',
            ai_summary: p.ai_summary || '', content: p.selftext || p.comment_body || '',
            is_read: p.is_read || false, saved_date: p.saved_date
          })), null, 2);
      }

      return { content: [{ type: 'text', text: output }] };
    }
  );

  server.tool(
    'connection_status',
    'Check if the Chrome extension is connected and synced',
    {},
    READ_ONLY,
    async () => {
      const connected = bridge.isConnected;
      const parts = [
        '# Connection Status',
        '',
        `Extension: ${connected ? 'Connected' : 'Disconnected'}`,
        `Data source: ${connected ? 'Live (extension)' : 'Cached (offline)'}`,
        `Posts in cache: ${store.posts.length}`,
        `Collections: ${store.collections.length}`,
      ];
      if (store.lastSyncTime) parts.push(`Last sync: ${formatDate(store.lastSyncTime)}`);

      if (connected) {
        try {
          const live = await bridge.sendCommand('get_stats', {});
          parts.push('');
          parts.push('## Live Stats');
          parts.push(`Total: ${live.total_posts} posts`);
          parts.push(`Read: ${live.read} · Unread: ${live.unread}`);
        } catch { /* non-critical */ }
      }

      if (!connected) {
        parts.push('');
        parts.push('Open Chrome with the Readdit Later extension to enable live access.');
      }

      return { content: [{ type: 'text', text: parts.join('\n') }] };
    }
  );

  // ── Notion Tools (require live extension connection) ─────────

  server.tool(
    'sync_to_notion',
    'Sync all saved posts to the connected Notion workspace. Deduplicates automatically — only new posts are pushed.',
    {},
    NOTION_WRITE,
    async () => {
      return await execCommand(bridge, 'sync_to_notion', {});
    }
  );

  server.tool(
    'export_to_notion',
    'Export specific posts to Notion by post ID. Requires Notion to be connected in the extension.',
    {
      post_ids: z.array(z.string()).describe('Array of post IDs to export to Notion')
    },
    NOTION_WRITE,
    async (params) => {
      return await execCommand(bridge, 'export_to_notion', params);
    }
  );

  // ── Insights Tool ───────────────────────────────────────────

  server.tool(
    'get_insights',
    'Analyze saved posts for patterns — recurring topics, subreddit clusters, save streaks, and theme overlaps. Useful for finding cross-pollination opportunities.',
    {
      time_filter: z.enum(['week', 'month', 'quarter', 'year', 'all']).optional().describe('Time range to analyze (default: all)'),
      min_cluster_size: z.number().optional().describe('Minimum posts to form a cluster (default: 3)')
    },
    READ_ONLY,
    async ({ time_filter = 'all', min_cluster_size = 3 }) => {
      let posts;
      if (bridge.isConnected) {
        try {
          posts = await bridge.sendCommand('search_posts', {});
        } catch { /* fall through */ }
      }
      if (!posts) posts = store.posts;

      if (posts.length === 0) {
        return { content: [{ type: 'text', text: 'No posts to analyze.' }] };
      }

      const now = Date.now() / 1000;
      const ranges = { week: 604800, month: 2592000, quarter: 7776000, year: 31536000 };
      if (time_filter !== 'all' && ranges[time_filter]) {
        posts = posts.filter(p => (p.created_utc || 0) >= now - ranges[time_filter]);
      }

      const subCounts = {};
      for (const p of posts) {
        if (p.subreddit) subCounts[p.subreddit] = (subCounts[p.subreddit] || 0) + 1;
      }
      const topSubs = Object.entries(subCounts)
        .filter(([, c]) => c >= min_cluster_size)
        .sort((a, b) => b[1] - a[1]);

      const labelCounts = {};
      for (const p of posts) {
        for (const t of (p.tags || p.labels || [])) {
          labelCounts[t] = (labelCounts[t] || 0) + 1;
        }
      }
      const topLabels = Object.entries(labelCounts)
        .filter(([, c]) => c >= min_cluster_size)
        .sort((a, b) => b[1] - a[1]);

      const stopWords = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','is','are','was','were','has','have','be','been','this','that','it','its','how','what','why','who','which','from','not','can','do','does','will','would','should','could','about','just','like','get','got','any','all','more','most','some','my','your','they','you','i','we','he','she','so','if','me','no','one','two']);
      const wordCounts = {};
      for (const p of posts) {
        const words = (p.title || '').toLowerCase().split(/\W+/).filter(w => w.length > 3 && !stopWords.has(w));
        const seen = new Set();
        for (const w of words) {
          if (!seen.has(w)) { wordCounts[w] = (wordCounts[w] || 0) + 1; seen.add(w); }
        }
      }
      const topKeywords = Object.entries(wordCounts)
        .filter(([, c]) => c >= min_cluster_size)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);

      const subKeywords = {};
      for (const p of posts) {
        if (!p.subreddit) continue;
        const words = (p.title || '').toLowerCase().split(/\W+/).filter(w => w.length > 3 && !stopWords.has(w));
        if (!subKeywords[p.subreddit]) subKeywords[p.subreddit] = {};
        for (const w of words) subKeywords[p.subreddit][w] = (subKeywords[p.subreddit][w] || 0) + 1;
      }
      const crossPollinationPairs = [];
      const subs = Object.keys(subKeywords);
      for (let i = 0; i < subs.length; i++) {
        for (let j = i + 1; j < subs.length; j++) {
          const shared = Object.keys(subKeywords[subs[i]]).filter(w => subKeywords[subs[j]][w]);
          if (shared.length >= 3) {
            crossPollinationPairs.push({
              subreddits: [subs[i], subs[j]],
              shared_keywords: shared.slice(0, 8),
              overlap_count: shared.length
            });
          }
        }
      }
      crossPollinationPairs.sort((a, b) => b.overlap_count - a.overlap_count);

      const dayCounts = [0, 0, 0, 0, 0, 0, 0];
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      for (const p of posts) {
        if (p.created_utc) {
          const day = new Date(p.created_utc * 1000).getDay();
          dayCounts[day]++;
        }
      }

      const readCount = posts.filter(p => p.is_read).length;
      const unreadCount = posts.length - readCount;
      const readPct = posts.length > 0 ? Math.round((readCount / posts.length) * 100) : 0;

      return { content: [{ type: 'text', text: formatInsights({
        total: posts.length, time_filter, topSubs, topLabels, topKeywords,
        crossPollinationPairs, dayNames, dayCounts, readCount, unreadCount, readPct
      }) }] };
    }
  );
}

// ── Formatting Helpers ──────────────────────────────────────────

function formatPost(p, index, showRelevance) {
  const labels = p.tags || p.labels || [];
  const isComment = p.is_comment || p.item_type === 'comment' || p.kind === 't1';
  const readTag = p.is_read ? 'Read' : 'Unread';
  const content = (p.selftext || p.comment_body || '').trim();
  const url = p.url || '';
  const title = p.title || 'Untitled';

  const parts = [];

  const num = index != null ? `[${index}] ` : '';
  parts.push(url ? `${num}[${title}](${url})` : `${num}${title}`);

  const meta = [];
  if (isComment) meta.push('Comment');
  meta.push(`r/${p.subreddit || 'unknown'}`);
  meta.push(`u/${p.author || 'unknown'}`);
  meta.push(`${(p.score || 0).toLocaleString()} pts`);
  meta.push(`${(p.num_comments || 0).toLocaleString()} comments`);
  meta.push(readTag);
  parts.push(`    ${meta.join(' · ')}`);

  if (labels.length) parts.push(`    Labels: ${labels.join(', ')}`);
  if (p.note) parts.push(`    Note: ${p.note}`);

  const summary = buildSummary(p, content);
  parts.push(`    Summary: ${summary}`);

  if (showRelevance && p._relevanceScore) parts.push(`    Relevance: ${p._relevanceScore}`);
  parts.push(`    ID: ${p.id}`);

  return parts.join('\n');
}

function buildSummary(p, content) {
  if (p.ai_summary) return p.ai_summary;
  if (!content) content = (p.selftext || p.comment_body || '').trim();
  if (content) {
    const oneLine = content.replace(/\s+/g, ' ');
    return oneLine.length > 200 ? oneLine.slice(0, 200) + '...' : oneLine;
  }
  const isComment = p.is_comment || p.item_type === 'comment' || p.kind === 't1';
  if (isComment && p.source_post_title) return `Comment on: ${p.source_post_title}`;
  const type = p.url && /i\.redd\.it|imgur|\.(jpg|jpeg|png|gif|webp)$/i.test(p.url) ? 'Image'
    : p.url && /v\.redd\.it|youtube|youtu\.be|\.(mp4|webm)$/i.test(p.url) ? 'Video'
    : 'Link';
  return `${type} post in r/${p.subreddit || 'unknown'}`;
}

function formatPostDetailed(post) {
  const labels = post.tags || post.labels || [];
  const content = post.selftext || post.comment_body || '';
  const isComment = post.is_comment || post.item_type === 'comment' || post.kind === 't1';
  const url = post.url || '';
  const title = post.title || 'Untitled';

  const parts = [];
  parts.push(url ? `# [${title}](${url})` : `# ${title}`);
  parts.push('');
  parts.push(`Type: ${isComment ? 'Saved Comment' : 'Post'}`);
  parts.push(`Subreddit: r/${post.subreddit || 'unknown'}`);
  parts.push(`Author: u/${post.author || 'unknown'}`);
  parts.push(`Score: ${(post.score || 0).toLocaleString()} points · ${(post.num_comments || 0).toLocaleString()} comments`);
  parts.push(`Status: ${post.is_read ? 'Read' : 'Unread'}`);
  if (post.link_flair_text) parts.push(`Flair: ${post.link_flair_text}`);
  parts.push(`Saved: ${formatDate(post.saved_date)}`);
  parts.push(`Posted: ${formatDate(post.created_utc)}`);
  parts.push(`ID: ${post.id}`);

  if (labels.length) {
    parts.push('');
    parts.push(`Labels: ${labels.join(', ')}`);
  }
  if (post.note) {
    parts.push('');
    parts.push(`## Note`);
    parts.push(post.note);
  }

  parts.push('');
  parts.push('## Summary');
  parts.push(buildSummary(post, content));

  if (content) {
    parts.push('');
    parts.push(`## Content`);
    parts.push(content);
  }
  if (isComment && post.source_post_title) {
    parts.push('');
    parts.push(`Parent post: ${post.source_post_title}`);
  }

  return parts.join('\n');
}

function formatStats(stats) {
  const parts = [];
  parts.push('# Library Statistics');
  parts.push('');

  const postCount = (stats.total_posts || 0) - (stats.total_comments || 0);
  parts.push(`Total: ${stats.total_posts || 0} items (${postCount} posts, ${stats.total_comments || 0} comments)`);

  const readPct = stats.total_posts > 0 ? Math.round((stats.read / stats.total_posts) * 100) : 0;
  const unreadPct = 100 - readPct;
  parts.push(`Read: ${stats.read || 0} (${readPct}%) · Unread: ${stats.unread || 0} (${unreadPct}%)`);
  parts.push(`Subreddits: ${stats.subreddits || 0} · Labels: ${stats.labels || 0} · Collections: ${stats.collections || 0}`);
  if (stats.last_sync) parts.push(`Last sync: ${formatDate(stats.last_sync)}`);

  if (stats.top_subreddits && stats.top_subreddits.length > 0) {
    parts.push('');
    parts.push('## Top Subreddits');
    for (const s of stats.top_subreddits) {
      parts.push(`  r/${s.name} — ${s.count} ${s.count === 1 ? 'post' : 'posts'}`);
    }
  }

  if (stats.top_labels && stats.top_labels.length > 0) {
    parts.push('');
    parts.push('## Top Labels');
    for (const l of stats.top_labels) {
      parts.push(`  ${l.name} — ${l.count} ${l.count === 1 ? 'post' : 'posts'}`);
    }
  }

  return parts.join('\n');
}

function formatCollections(collections) {
  if (!collections || collections.length === 0) return 'No collections found.';

  const parts = [`# Collections (${collections.length} total)`, ''];
  for (const c of collections) {
    const postCount = Array.isArray(c.post_ids) ? c.post_ids.length : (c.postCount || 0);
    parts.push(`## ${c.name || 'Untitled'}`);
    parts.push(`${postCount} post${postCount === 1 ? '' : 's'}`);
    if (c.description) parts.push(`Description: ${c.description}`);
    if (c.created) parts.push(`Created: ${formatDate(c.created)}`);
    parts.push('');
  }
  return parts.join('\n').trimEnd();
}

function formatInsights({ total, time_filter, topSubs, topLabels, topKeywords, crossPollinationPairs, dayNames, dayCounts, readCount, unreadCount, readPct }) {
  const parts = [];
  const rangeLabel = time_filter === 'all' ? 'all time' : `past ${time_filter}`;
  parts.push(`# Library Insights (${total} posts analyzed, ${rangeLabel})`);

  if (topSubs.length > 0) {
    parts.push('');
    parts.push('## Subreddit Clusters');
    for (const [name, count] of topSubs) {
      parts.push(`  r/${name} — ${count} ${count === 1 ? 'post' : 'posts'}`);
    }
  }

  if (topLabels.length > 0) {
    parts.push('');
    parts.push('## Label Clusters');
    for (const [name, count] of topLabels) {
      parts.push(`  ${name} — ${count} ${count === 1 ? 'post' : 'posts'}`);
    }
  }

  if (topKeywords.length > 0) {
    parts.push('');
    parts.push('## Recurring Keywords');
    parts.push(`  ${topKeywords.map(([word, count]) => `${word} (${count})`).join(', ')}`);
  }

  const topCross = crossPollinationPairs.slice(0, 10);
  if (topCross.length > 0) {
    parts.push('');
    parts.push('## Cross-Pollination');
    for (const cp of topCross) {
      parts.push(`  r/${cp.subreddits[0]} + r/${cp.subreddits[1]} — ${cp.overlap_count} shared themes: ${cp.shared_keywords.join(', ')}`);
    }
  }

  parts.push('');
  parts.push('## Save Pattern');
  const dayLine = dayNames.map((name, i) => `${name.slice(0, 3)}: ${dayCounts[i]}`).join(' · ');
  parts.push(`  ${dayLine}`);
  parts.push(`  Busiest: ${dayNames[dayCounts.indexOf(Math.max(...dayCounts))]}`);

  parts.push('');
  parts.push('## Read Progress');
  parts.push(`  Read: ${readCount} (${readPct}%) · Unread: ${unreadCount} (${100 - readPct}%)`);

  return parts.join('\n');
}

function formatDate(value) {
  if (!value) return 'Unknown';
  let d;
  if (typeof value === 'number') {
    d = new Date(value < 1e12 ? value * 1000 : value);
  } else {
    d = new Date(value);
  }
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ── Command + Export Helpers ──────────────────────────────────────

async function execCommand(bridge, action, params) {
  try {
    const result = await bridge.sendCommand(action, params);
    return {
      content: [{
        type: 'text',
        text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
      }]
    };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err.message}` }],
      isError: true
    };
  }
}

function postsToCSV(posts) {
  const esc = (v) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const headers = ['Title', 'URL', 'Subreddit', 'Author', 'Score', 'Comments', 'Labels', 'Note', 'AI Summary', 'Read'];
  const rows = posts.map(p => [
    esc(p.title), esc(p.url), esc(p.subreddit), esc(p.author),
    p.score || 0, p.num_comments || 0,
    esc((p.tags || p.labels || []).join('; ')), esc(p.note),
    esc(p.ai_summary), p.is_read ? 'Yes' : 'No'
  ].join(','));
  return [headers.join(','), ...rows].join('\n');
}

function postsToMarkdown(posts) {
  return posts.map(p => {
    const labels = (p.tags || p.labels || []);
    let md = `## ${p.title || 'Untitled'}\n\n`;
    md += `- **Subreddit:** r/${p.subreddit}\n`;
    md += `- **Author:** u/${p.author}\n`;
    md += `- **Score:** ${p.score || 0} | **Comments:** ${p.num_comments || 0}\n`;
    md += `- **URL:** ${p.url || 'N/A'}\n`;
    if (labels.length) md += `- **Labels:** ${labels.join(', ')}\n`;
    if (p.note) md += `- **Note:** ${p.note}\n`;
    if (p.ai_summary) md += `- **Summary:** ${p.ai_summary}\n`;
    if (p.selftext || p.comment_body) md += `\n${(p.selftext || p.comment_body).slice(0, 500)}\n`;
    return md;
  }).join('\n---\n\n');
}

function postsToHTML(posts) {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let html = `<html><head><meta charset="utf-8"><title>Readdit Later Export</title>
<style>body{font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:20px;background:#fafaf9;color:#1c1917}
.post{border:1px solid #e7e5e4;border-radius:8px;padding:16px;margin-bottom:16px;background:#fff}
.post h2{margin:0 0 8px;font-size:16px}.meta{font-size:13px;color:#57534e;margin-bottom:8px}
.labels span{display:inline-block;background:#fdf0e8;color:#e8590c;padding:2px 8px;border-radius:4px;font-size:12px;margin-right:4px}
.content{font-size:14px;color:#44403c;margin-top:8px;white-space:pre-wrap}
.note{font-size:13px;color:#78716c;font-style:italic;margin-top:8px;padding:8px;background:#f5f5f4;border-radius:4px}
.summary{font-size:13px;color:#57534e;margin-top:8px}</style></head><body>
<h1>Readdit Later - ${posts.length} Saved Posts</h1>\n`;

  for (const p of posts) {
    const labels = p.tags || p.labels || [];
    const content = p.selftext || p.comment_body || '';
    html += `<div class="post">
<h2><a href="${esc(p.url)}">${esc(p.title || 'Untitled')}</a></h2>
<div class="meta">r/${esc(p.subreddit)} · u/${esc(p.author)} · ${p.score || 0} pts · ${p.num_comments || 0} comments</div>`;
    if (labels.length) html += `<div class="labels">${labels.map(l => `<span>${esc(l)}</span>`).join('')}</div>`;
    if (p.ai_summary) html += `<div class="summary">${esc(p.ai_summary)}</div>`;
    if (content) html += `<div class="content">${esc(content.slice(0, 1000))}</div>`;
    if (p.note) html += `<div class="note">${esc(p.note)}</div>`;
    html += `</div>\n`;
  }
  html += '</body></html>';
  return html;
}

function postsToObsidian(posts) {
  return posts.map(p => {
    const labels = (p.tags || p.labels || []);
    const content = p.selftext || p.comment_body || '';
    const date = p.created_utc ? new Date(p.created_utc * 1000).toISOString().split('T')[0] : '';
    let md = '---\n';
    md += `title: "${(p.title || 'Untitled').replace(/"/g, '\\"')}"\n`;
    md += `subreddit: "${p.subreddit || ''}"\n`;
    md += `author: "${p.author || ''}"\n`;
    md += `url: "${p.url || ''}"\n`;
    md += `score: ${p.score || 0}\n`;
    md += `comments: ${p.num_comments || 0}\n`;
    if (date) md += `date: ${date}\n`;
    if (labels.length) md += `tags: [${labels.map(l => `"${l.replace(/"/g, '\\"')}"`).join(', ')}]\n`;
    md += '---\n\n';
    md += `# ${p.title || 'Untitled'}\n\n`;
    md += `[Original Post](${p.url || ''})\n\n`;
    md += `**r/${p.subreddit}** · **u/${p.author}** · ${p.score || 0} pts · ${p.num_comments || 0} comments\n\n`;
    if (p.ai_summary) md += `> **Summary:** ${p.ai_summary}\n\n`;
    if (content) md += `${content.slice(0, 2000)}\n\n`;
    if (p.note) md += `---\n**Note:** ${p.note}\n`;
    return md;
  }).join('\n---\n\n');
}

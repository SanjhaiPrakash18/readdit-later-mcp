import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const DATA_DIR = join(homedir(), '.readdit-later');
const DATA_FILE = join(DATA_DIR, 'data.json');

export class Store {
  constructor() {
    this.posts = [];
    this.collections = [];
    this.postIndex = new Map();
    this.lastSyncTime = null;
    this._load();
  }

  _load() {
    try {
      if (existsSync(DATA_FILE)) {
        const raw = readFileSync(DATA_FILE, 'utf8');
        const data = JSON.parse(raw);
        this.posts = data.posts || [];
        this.collections = data.collections || [];
        this.lastSyncTime = data.lastSyncTime || null;
        this._rebuildIndex();
      }
    } catch {
      // Start fresh if file is corrupt
    }
  }

  _save() {
    try {
      if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(DATA_FILE, JSON.stringify({
        posts: this.posts,
        collections: this.collections,
        lastSyncTime: this.lastSyncTime
      }));
    } catch {
      // Non-critical — data will be re-synced from extension
    }
  }

  _rebuildIndex() {
    this.postIndex.clear();
    for (const post of this.posts) {
      this.postIndex.set(post.id, post);
    }
  }

  sync(posts, collections) {
    this.posts = posts || [];
    this.collections = collections || [];
    this.lastSyncTime = new Date().toISOString();
    this._rebuildIndex();
    this._save();
  }

  updatePost(post) {
    const idx = this.posts.findIndex(p => p.id === post.id);
    if (idx !== -1) {
      this.posts[idx] = { ...this.posts[idx], ...post };
      this.postIndex.set(post.id, this.posts[idx]);
    } else {
      this.posts.push(post);
      this.postIndex.set(post.id, post);
    }
    this._save();
  }

  removePost(postId) {
    this.posts = this.posts.filter(p => p.id !== postId);
    this.postIndex.delete(postId);
    this._save();
  }

  getPost(id) {
    return this.postIndex.get(id) || null;
  }

  searchPosts({ query, subreddit, tag, content_type, read_status, author, min_score, min_comments, time_filter, item_type, sort_by, limit }) {
    let results = [...this.posts];

    if (subreddit) {
      const sub = subreddit.toLowerCase().replace(/^r\//, '');
      results = results.filter(p => (p.subreddit || '').toLowerCase() === sub);
    }

    if (tag) {
      results = results.filter(p => {
        const tags = p.tags || p.labels || [];
        return tags.some(t => t.toLowerCase() === tag.toLowerCase());
      });
    }

    if (content_type) {
      results = results.filter(p => this._matchesType(p, content_type));
    }

    if (read_status === 'read') results = results.filter(p => p.is_read === true);
    if (read_status === 'unread') results = results.filter(p => p.is_read !== true);

    if (author) {
      const a = author.toLowerCase().replace(/^u\//, '');
      results = results.filter(p => (p.author || '').toLowerCase() === a);
    }

    if (min_score) results = results.filter(p => (p.score || 0) >= min_score);
    if (min_comments) results = results.filter(p => (p.num_comments || 0) >= min_comments);

    if (item_type === 'comment') results = results.filter(p => p.is_comment || p.item_type === 'comment' || p.kind === 't1');
    if (item_type === 'post') results = results.filter(p => !p.is_comment && p.item_type !== 'comment' && p.kind !== 't1');

    if (time_filter) {
      const now = Date.now() / 1000;
      const limits = { day: 86400, week: 604800, month: 2592000, year: 31536000 };
      const secs = limits[time_filter];
      if (secs) results = results.filter(p => (p.created_utc || 0) >= now - secs);
    }

    const hasQuery = query && query.trim().length > 0;
    if (hasQuery) {
      const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);

      for (const p of results) {
        let score = 0;
        const title = (p.title || '').toLowerCase();
        const sub = (p.subreddit || '').toLowerCase();
        const body = (p.selftext || p.comment_body || '').toLowerCase();
        const labels = (p.tags || p.labels || []).map(l => l.toLowerCase());
        const labelsText = labels.join(' ');
        const note = (p.note || '').toLowerCase();
        const summary = (p.ai_summary || '').toLowerCase();
        const authorStr = (p.author || '').toLowerCase();
        const flair = (p.link_flair_text || '').toLowerCase();
        const sourceTitle = (p.source_post_title || '').toLowerCase();

        for (const term of terms) {
          if (title.includes(term)) score += 10;
          if (sub === term || sub === term.replace(/^r\//, '')) score += 8;
          else if (sub.includes(term)) score += 4;
          if (labels.some(l => l === term)) score += 6;
          else if (labelsText.includes(term)) score += 3;
          if (body.includes(term)) score += 3;
          if (note.includes(term)) score += 3;
          if (summary.includes(term)) score += 3;
          if (flair.includes(term)) score += 4;
          if (sourceTitle.includes(term)) score += 3;
          if (authorStr === term || authorStr === term.replace(/^u\//, '')) score += 5;
          else if (authorStr.includes(term)) score += 2;
        }

        if (terms.length > 1 && terms.every(t => title.includes(t))) score += 15;

        p._relevanceScore = score;
      }

      results = results.filter(p => p._relevanceScore > 0);

      if (results.length > 0) {
        const topScore = Math.max(...results.map(p => p._relevanceScore));
        const floor = Math.max(4, topScore * 0.1);
        results = results.filter(p => p._relevanceScore >= floor);
      }

      if (!sort_by || sort_by === 'relevance') {
        results.sort((a, b) => b._relevanceScore - a._relevanceScore);
      }
    }

    if (!hasQuery || (sort_by && sort_by !== 'relevance')) {
      switch (sort_by) {
        case 'oldest': results.sort((a, b) => (a.created_utc || 0) - (b.created_utc || 0)); break;
        case 'most_upvoted': results.sort((a, b) => (b.score || 0) - (a.score || 0)); break;
        case 'most_commented': results.sort((a, b) => (b.num_comments || 0) - (a.num_comments || 0)); break;
        case 'alphabetical': results.sort((a, b) => (a.title || '').localeCompare(b.title || '')); break;
        case 'relevance': break;
        default: results.sort((a, b) => (b.created_utc || 0) - (a.created_utc || 0));
      }
    }

    if (limit && limit > 0) results = results.slice(0, limit);

    return results;
  }

  getStats() {
    const subredditCounts = {};
    const tagCounts = {};
    let readCount = 0;
    let commentCount = 0;

    for (const p of this.posts) {
      subredditCounts[p.subreddit] = (subredditCounts[p.subreddit] || 0) + 1;
      if (p.is_read) readCount++;
      if (p.is_comment || p.item_type === 'comment') commentCount++;
      for (const t of (p.tags || p.labels || [])) {
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      }
    }

    return {
      total_posts: this.posts.length,
      total_comments: commentCount,
      read: readCount,
      unread: this.posts.length - readCount,
      subreddits: Object.keys(subredditCounts).length,
      labels: Object.keys(tagCounts).length,
      collections: this.collections.length,
      last_sync: this.lastSyncTime,
      top_subreddits: Object.entries(subredditCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count })),
      top_labels: Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }))
    };
  }

  getSubreddits() {
    const counts = {};
    for (const p of this.posts) {
      counts[p.subreddit] = (counts[p.subreddit] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }

  getLabels() {
    const counts = {};
    for (const p of this.posts) {
      for (const t of (p.tags || p.labels || [])) {
        counts[t] = (counts[t] || 0) + 1;
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }

  updateCollections(collections) {
    this.collections = collections || [];
    this._save();
  }

  _matchesType(post, type) {
    const url = post.url || '';
    switch (type) {
      case 'image': return /i\.redd\.it|imgur\.com|\.(jpg|jpeg|png|gif|webp)$/i.test(url);
      case 'video': return /v\.redd\.it|youtube\.com|youtu\.be|\.(mp4|webm)$/i.test(url);
      case 'text': return post.is_self && (post.selftext || '').trim().length > 0;
      case 'link': return !post.is_self && !this._matchesType(post, 'image') && !this._matchesType(post, 'video');
      default: return true;
    }
  }
}

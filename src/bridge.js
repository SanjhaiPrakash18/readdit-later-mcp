import { WebSocketServer } from 'ws';

const PORT = 52849;
const COMMAND_TIMEOUT = 15000;

export class Bridge {
  constructor(store) {
    this.store = store;
    this.wss = null;
    this.extension = null;
    this.pendingCommands = new Map();
    this._commandId = 0;
  }

  start() {
    this.wss = new WebSocketServer({ port: PORT, host: '127.0.0.1' });

    this.wss.on('connection', (ws) => {
      this.extension = ws;
      this._log('Extension connected');

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          this._handleMessage(msg);
        } catch {
          // Ignore malformed messages
        }
      });

      ws.on('close', () => {
        this._log('Extension disconnected');
        this.extension = null;
        this._rejectAllPending('Extension disconnected');
      });

      ws.on('error', () => {
        this.extension = null;
        this._rejectAllPending('Extension connection error');
      });

      this._send({ type: 'request_sync' });
    });

    this.wss.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        this._log(`Port ${PORT} in use — another instance may be running`);
      }
    });

    this._log(`Bridge listening on ws://127.0.0.1:${PORT}`);
  }

  get isConnected() {
    return this.extension !== null && this.extension.readyState === 1;
  }

  async sendCommand(action, params) {
    if (!this.isConnected) {
      throw new Error('Extension not connected. Open Chrome with Readdit Later installed.');
    }

    const id = String(++this._commandId);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCommands.delete(id);
        reject(new Error('Command timed out — extension did not respond'));
      }, COMMAND_TIMEOUT);

      this.pendingCommands.set(id, { resolve, reject, timer });
      this._send({ type: 'command', id, action, params });
    });
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'sync':
        this.store.sync(msg.posts, msg.collections);
        this._log(`Synced ${this.store.posts.length} posts, ${this.store.collections.length} collections`);
        break;

      case 'post_updated':
        if (msg.post) this.store.updatePost(msg.post);
        break;

      case 'post_deleted':
        if (msg.postId) this.store.removePost(msg.postId);
        break;

      case 'collections_updated':
        if (msg.collections) this.store.updateCollections(msg.collections);
        break;

      case 'command_result': {
        const pending = this.pendingCommands.get(msg.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingCommands.delete(msg.id);
          if (msg.success) {
            pending.resolve(msg.data);
          } else {
            pending.reject(new Error(msg.error || 'Command failed'));
          }
        }
        break;
      }

      case 'pong':
        break;
    }
  }

  _send(msg) {
    if (this.isConnected) {
      this.extension.send(JSON.stringify(msg));
    }
  }

  _rejectAllPending(reason) {
    for (const [id, { reject, timer }] of this.pendingCommands) {
      clearTimeout(timer);
      reject(new Error(reason));
    }
    this.pendingCommands.clear();
  }

  _log(msg) {
    process.stderr.write(`[readdit-mcp] ${msg}\n`);
  }

  stop() {
    if (this.wss) this.wss.close();
  }
}

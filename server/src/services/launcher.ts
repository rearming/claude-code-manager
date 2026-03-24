import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import { findSessionProject } from './claude-data.js';

export function getResumeCommand(sessionId: string): string {
  return `claude --resume ${sessionId}`;
}

export interface StreamOptions {
  dangerouslySkipPermissions?: boolean;
}

// ---------- Persistent Session Process ----------

interface ParsedEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * Manages a persistent Claude CLI process using --input-format stream-json.
 * The process stays alive between messages — new user messages are written to stdin.
 */
class SessionProcess extends EventEmitter {
  proc: ChildProcess;
  sessionId: string | null = null;
  model: string | null = null;
  buffer = '';
  alive = true;
  idleTimer: ReturnType<typeof setTimeout> | null = null;
  /** Track whether we've seen content_block_delta events for text dedup */
  private seenContentDeltas = false;

  private static IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  constructor(
    private cwd: string,
    public options: StreamOptions = {},
    resumeSessionId?: string
  ) {
    super();

    const args = [
      '--print',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
    ];
    if (options.dangerouslySkipPermissions) {
      args.push('--dangerously-skip-permissions');
    }
    if (resumeSessionId) {
      args.push('--resume', resumeSessionId);
    }

    this.proc = spawn('claude', args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.proc.stdout?.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString();

      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        this.handleLine(trimmed);
      }
    });

    this.proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) {
        this.emit('raw', `[stderr] ${text}`);
        if (!text.includes('no stdin data received')) {
          this.emit('error', text);
        }
      }
    });

    this.proc.on('error', (err) => {
      this.alive = false;
      this.emit('error', `Failed to spawn claude: ${err.message}`);
      this.emit('close');
    });

    this.proc.on('close', () => {
      this.alive = false;
      this.clearIdleTimer();
      // Flush remaining buffer
      if (this.buffer.trim()) {
        this.handleLine(this.buffer.trim());
        this.buffer = '';
      }
      this.emit('close');
    });

    this.resetIdleTimer();
  }

  private handleLine(trimmed: string) {
    try {
      const event: ParsedEvent = JSON.parse(trimmed);

      this.emit('raw', trimmed);

      if (event.type === 'system' && event.subtype === 'init') {
        this.sessionId = event.session_id as string;
        this.model = event.model as string;
        this.emit('init', { sessionId: this.sessionId, model: this.model });
      } else if (event.type === 'content_block_delta') {
        // Real-time text streaming from content block deltas
        const delta = event.delta as { type?: string; text?: string } | undefined;
        if (delta?.type === 'text_delta' && delta.text) {
          this.seenContentDeltas = true;
          this.emit('text', delta.text);
        }
      } else if (event.type === 'assistant') {
        // Fallback text extraction from complete assistant messages
        // (only if we haven't seen content_block_delta events, to avoid double text)
        if (!this.seenContentDeltas) {
          const content = (event.message as { content?: Array<{ type: string; text?: string }> })?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && block.text) {
                this.emit('text', block.text);
              }
            }
          }
        }
      } else if (event.type === 'result') {
        this.emit('result', {
          result: event.result,
          durationMs: event.duration_ms,
          cost: event.total_cost_usd,
        });
        this.seenContentDeltas = false;
        // After result, the turn is done — reset idle timer
        this.resetIdleTimer();
      }
    } catch {
      this.emit('raw', trimmed);
    }
  }

  sendMessage(message: string, images?: Array<{ mediaType: string; data: string }>) {
    if (!this.alive) throw new Error('Process is dead');
    this.clearIdleTimer();

    const content: Array<Record<string, unknown>> = [];
    if (images && images.length > 0) {
      for (const img of images) {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.mediaType,
            data: img.data,
          },
        });
      }
    }
    content.push({ type: 'text', text: message });

    const userMsg = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content,
      },
    });

    this.proc.stdin?.write(userMsg + '\n');
  }

  kill() {
    this.clearIdleTimer();
    if (this.alive) {
      this.alive = false;
      this.proc.stdin?.end();
      this.proc.kill();
    }
  }

  private resetIdleTimer() {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      console.log(`[SessionProcess] Idle timeout for session ${this.sessionId}, killing`);
      this.kill();
    }, SessionProcess.IDLE_TIMEOUT);
  }

  private clearIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }
}

// ---------- Process Pool ----------

const processPool = new Map<string, SessionProcess>();

function getOrCreateProcess(
  sessionKey: string,
  cwd: string,
  options: StreamOptions,
  resumeSessionId?: string
): SessionProcess {
  const existing = processPool.get(sessionKey);
  if (existing?.alive) {
    // If permission setting changed, kill the old process and respawn
    const wantSkip = !!options.dangerouslySkipPermissions;
    const hasSkip = !!existing.options.dangerouslySkipPermissions;
    if (wantSkip === hasSkip) return existing;
    console.log(`[SessionProcess] Permission setting changed (${hasSkip} → ${wantSkip}), respawning process for ${sessionKey}`);
    existing.kill();
  }

  // Clean up dead entry
  if (existing) processPool.delete(sessionKey);

  const proc = new SessionProcess(cwd, options, resumeSessionId);
  processPool.set(sessionKey, proc);

  proc.on('close', () => {
    processPool.delete(sessionKey);
  });

  return proc;
}

// ---------- Public API ----------

/**
 * Send a message to an existing session. Reuses a persistent process if one exists.
 */
export type ImageData = { mediaType: string; data: string };

export async function streamMessage(
  sessionId: string,
  message: string,
  res: Response,
  options: StreamOptions = {},
  images?: ImageData[]
): Promise<void> {
  const projectPath = await findSessionProject(sessionId);
  if (!projectPath) {
    throw new Error(`Cannot determine project directory for session ${sessionId}`);
  }

  const proc = getOrCreateProcess(sessionId, projectPath, options, sessionId);
  pipeProcessToSSE(proc, message, res, images);
}

/**
 * Start a brand-new session in a given project directory.
 */
export async function streamNewSession(
  message: string,
  projectPath: string,
  res: Response,
  options: StreamOptions = {},
  images?: ImageData[]
): Promise<void> {
  // Use a temp key; will be replaced once we get the session ID from init
  const tempKey = `new-${Date.now()}`;
  const proc = new SessionProcess(projectPath, options);

  // Once we know the real session ID, re-key in the pool
  proc.once('init', ({ sessionId }: { sessionId: string }) => {
    processPool.delete(tempKey);
    // Only store if there isn't already one (race guard)
    if (!processPool.has(sessionId)) {
      processPool.set(sessionId, proc);
      proc.on('close', () => processPool.delete(sessionId));
    }
  });
  processPool.set(tempKey, proc);
  proc.on('close', () => processPool.delete(tempKey));

  pipeProcessToSSE(proc, message, res, images);
}

/**
 * Pipe a SessionProcess's events to an SSE response for a single turn.
 * After the result arrives, the SSE connection closes but the process stays alive.
 */
function pipeProcessToSSE(proc: SessionProcess, message: string, res: Response, images?: ImageData[]) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const sendEvent = (data: object) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  const onInit = (data: { sessionId: string; model: string }) => {
    sendEvent({ type: 'init', sessionId: data.sessionId, model: data.model });
  };

  const onText = (text: string) => {
    sendEvent({ type: 'text', text });
  };

  const onRaw = (data: string) => {
    sendEvent({ type: 'raw', data });
  };

  const onResult = (data: { result: string; durationMs: number; cost: number }) => {
    sendEvent({ type: 'result', ...data });
    sendEvent({ type: 'done' });
    cleanup();
    res.end();
  };

  const onError = (error: string) => {
    sendEvent({ type: 'error', error });
  };

  const onClose = () => {
    // Process died mid-turn
    sendEvent({ type: 'done' });
    cleanup();
    if (!res.writableEnded) res.end();
  };

  const cleanup = () => {
    proc.removeListener('init', onInit);
    proc.removeListener('text', onText);
    proc.removeListener('raw', onRaw);
    proc.removeListener('result', onResult);
    proc.removeListener('error', onError);
    proc.removeListener('close', onClose);
  };

  proc.on('init', onInit);
  proc.on('text', onText);
  proc.on('raw', onRaw);
  proc.on('result', onResult);
  proc.on('error', onError);
  proc.on('close', onClose);

  // If client disconnects mid-stream, clean up listeners (but DON'T kill the process)
  res.on('close', () => {
    cleanup();
  });

  // Send the message
  try {
    proc.sendMessage(message, images);
  } catch (err) {
    sendEvent({ type: 'error', error: err instanceof Error ? err.message : 'Process is dead' });
    sendEvent({ type: 'done' });
    res.end();
    cleanup();
  }
}

/**
 * Get info about active persistent processes (for debugging).
 */
export function getActiveProcesses(): Array<{ sessionId: string | null; alive: boolean }> {
  return Array.from(processPool.values()).map((p) => ({
    sessionId: p.sessionId,
    alive: p.alive,
  }));
}

/**
 * Kill a specific session's persistent process.
 */
export function killSessionProcess(sessionId: string): boolean {
  const proc = processPool.get(sessionId);
  if (proc) {
    proc.kill();
    return true;
  }
  return false;
}

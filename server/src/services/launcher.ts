import { spawn, type ChildProcess } from 'node:child_process';
import type { Response } from 'express';
import { findSessionProject } from './claude-data.js';

export function getResumeCommand(sessionId: string): string {
  return `claude --resume ${sessionId}`;
}

/**
 * Send a message to a session via `claude --resume` with streaming JSON output.
 * Pipes structured events as SSE to the Express response.
 *
 * Events sent to client:
 *   - { type: "init", ... }      — session initialized
 *   - { type: "text", text: "" }  — streamed text chunk
 *   - { type: "result", ... }     — final result with full response
 *   - { type: "error", error: "" } — error message
 */
export interface StreamOptions {
  dangerouslySkipPermissions?: boolean;
}

export async function streamMessage(
  sessionId: string,
  message: string,
  res: Response,
  options: StreamOptions = {}
): Promise<void> {
  const projectPath = await findSessionProject(sessionId);
  if (!projectPath) {
    throw new Error(`Cannot determine project directory for session ${sessionId}`);
  }

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const sendEvent = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Build the full command as a single string with proper quoting.
  // We must use shell to resolve 'claude' from PATH, so we quote the
  // message to prevent word-splitting.
  const escapedMessage = message.replace(/"/g, '\\"');
  const permFlag = options.dangerouslySkipPermissions ? ' --dangerously-skip-permissions' : '';
  const cmd = `claude --resume ${sessionId} --print --output-format stream-json --verbose${permFlag} -p "${escapedMessage}"`;

  const proc: ChildProcess = spawn(cmd, [], {
    shell: true,
    cwd: projectPath,
    timeout: 300_000,
  });

  let buffer = '';

  proc.stdout?.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();

    // stream-json outputs one JSON object per line
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? ''; // keep incomplete last line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const event = JSON.parse(trimmed);

        if (event.type === 'system' && event.subtype === 'init') {
          sendEvent({ type: 'init', sessionId: event.session_id, model: event.model });
        } else if (event.type === 'assistant') {
          // Extract text content from the assistant message
          const content = event.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && block.text) {
                sendEvent({ type: 'text', text: block.text });
              }
            }
          }
        } else if (event.type === 'result') {
          sendEvent({
            type: 'result',
            result: event.result,
            durationMs: event.duration_ms,
            cost: event.total_cost_usd,
          });
        }
      } catch {
        // Skip unparseable lines
      }
    }
  });

  proc.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString().trim();
    // Filter out harmless stdin warnings from non-interactive mode
    if (text && !text.includes('no stdin data received')) {
      sendEvent({ type: 'error', error: text });
    }
  });

  proc.on('error', (err) => {
    sendEvent({ type: 'error', error: `Failed to spawn claude: ${err.message}` });
    res.end();
  });

  proc.on('close', () => {
    // Flush any remaining buffer
    if (buffer.trim()) {
      try {
        const event = JSON.parse(buffer.trim());
        if (event.type === 'result') {
          sendEvent({
            type: 'result',
            result: event.result,
            durationMs: event.duration_ms,
            cost: event.total_cost_usd,
          });
        }
      } catch {
        // ignore
      }
    }
    sendEvent({ type: 'done' });
    res.end();
  });

  // Handle client disconnect
  res.on('close', () => {
    proc.kill();
  });
}

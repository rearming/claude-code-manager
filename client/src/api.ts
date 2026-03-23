import type { SessionSummary, SessionDetail, ForkResult } from './types';

const BASE = '/api';

export async function fetchSessions(params?: {
  project?: string;
  search?: string;
}): Promise<SessionSummary[]> {
  const url = new URL(`${BASE}/sessions`, window.location.origin);
  if (params?.project) url.searchParams.set('project', params.project);
  if (params?.search) url.searchParams.set('search', params.search);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to fetch sessions');
  return res.json();
}

export async function fetchSessionDetail(
  sessionId: string
): Promise<SessionDetail> {
  const res = await fetch(`${BASE}/sessions/${sessionId}`);
  if (!res.ok) throw new Error('Failed to fetch session detail');
  return res.json();
}

export async function resumeSession(
  sessionId: string
): Promise<{ command: string }> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/resume`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to resume session');
  return res.json();
}

export async function forkSessionAt(
  sessionId: string,
  messageUuid: string
): Promise<ForkResult> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/fork`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageUuid }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Fork failed' }));
    throw new Error(err.error || 'Fork failed');
  }
  return res.json();
}

export interface StreamCallbacks {
  onInit?: (data: { sessionId: string; model: string }) => void;
  onText?: (text: string) => void;
  onResult?: (data: { result: string; durationMs: number; cost: number }) => void;
  onError?: (error: string) => void;
  onDone?: () => void;
}

/**
 * Send a message to a session via SSE streaming.
 * Returns an abort function to cancel the request.
 */
export function streamMessageToSession(
  sessionId: string,
  message: string,
  dangerouslySkipPermissions: boolean,
  callbacks: StreamCallbacks
): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${BASE}/sessions/${sessionId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, dangerouslySkipPermissions }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Send failed' }));
        callbacks.onError?.(err.error || `HTTP ${res.status}`);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        callbacks.onError?.('No response body');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events: "data: {...}\n\n"
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6);
          try {
            const event = JSON.parse(json);
            switch (event.type) {
              case 'init':
                callbacks.onInit?.(event);
                break;
              case 'text':
                callbacks.onText?.(event.text);
                break;
              case 'result':
                callbacks.onResult?.(event);
                break;
              case 'error':
                callbacks.onError?.(event.error);
                break;
              case 'done':
                callbacks.onDone?.();
                break;
            }
          } catch {
            // skip
          }
        }
      }

      callbacks.onDone?.();
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        callbacks.onError?.(err instanceof Error ? err.message : 'Unknown error');
      }
    }
  })();

  return () => controller.abort();
}

import type { SessionSummary, SessionDetail, ForkResult, ImageAttachment } from './types';

const BASE = '/api';

export interface BrowseResult {
  current: string;
  parent: string | null;
  dirs: { name: string; path: string }[];
}

export async function browseDirectory(dirPath?: string): Promise<BrowseResult> {
  const url = new URL(`${BASE}/browse`, window.location.origin);
  if (dirPath) url.searchParams.set('path', dirPath);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to browse directory');
  return res.json();
}

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
  images?: ImageAttachment[];
  onInit?: (data: { sessionId: string; model: string }) => void;
  onText?: (text: string) => void;
  onRaw?: (data: string) => void;
  onResult?: (data: { result: string; durationMs: number; cost: number }) => void;
  onError?: (error: string) => void;
  onDone?: () => void;
}

/**
 * Start a new session via SSE streaming.
 * Returns an abort function to cancel the request.
 */
export function streamNewSession(
  message: string,
  projectPath: string,
  dangerouslySkipPermissions: boolean,
  callbacks: StreamCallbacks
): () => void {
  const { images, ...cbs } = callbacks;
  return streamSSE(`${BASE}/sessions/new`, { message, projectPath, dangerouslySkipPermissions, images }, cbs);
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
  const { images, ...cbs } = callbacks;
  return streamSSE(`${BASE}/sessions/${sessionId}/send`, { message, dangerouslySkipPermissions, images }, cbs);
}

export async function cacheImage(
  data: string,
  mediaType: string,
  sessionId?: string,
  messageUuid?: string
): Promise<{ hash: string; mediaType: string }> {
  const res = await fetch(`${BASE}/images`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, mediaType, sessionId, messageUuid }),
  });
  if (!res.ok) throw new Error('Failed to cache image');
  return res.json();
}

export async function saveAnnotatedImage(
  data: string,
  mediaType: string,
  originalHash: string
): Promise<{ hash: string }> {
  const res = await fetch(`${BASE}/images/annotated`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, mediaType, originalHash }),
  });
  if (!res.ok) throw new Error('Failed to save annotated image');
  return res.json();
}

function streamSSE(
  url: string,
  body: object,
  callbacks: StreamCallbacks
): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
              case 'raw':
                callbacks.onRaw?.(event.data);
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

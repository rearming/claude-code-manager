import type { SessionSummary, SessionDetail } from './types';

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

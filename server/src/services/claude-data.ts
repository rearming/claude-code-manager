import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import type { SessionSummary, SessionDetail, ConversationMessage, ToolCallSummary } from '../types.js';

function getClaudeHome(): string {
  return path.join(os.homedir(), '.claude');
}

function projectDirToName(dirName: string): string {
  // Convert encoded dir names like "X--Projects-claude-code-manager" back to paths
  return dirName.replace(/^([A-Z])-/, '$1:').replaceAll('-', path.sep);
}

function projectPathToDir(projectPath: string): string {
  return projectPath.replace(/[:\\/]/g, '-').replace(/^-+/, '');
}

export async function listProjects(): Promise<string[]> {
  const projectsDir = path.join(getClaudeHome(), 'projects');
  try {
    const entries = await fs.promises.readdir(projectsDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

export async function listSessions(): Promise<SessionSummary[]> {
  const claudeHome = getClaudeHome();
  const historyPath = path.join(claudeHome, 'history.jsonl');

  // Build session index from history.jsonl
  const sessionMap = new Map<string, {
    project: string;
    firstMessage: string;
    firstTimestamp: number;
    lastTimestamp: number;
    messageCount: number;
  }>();

  try {
    const stream = fs.createReadStream(historyPath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        const sid = entry.sessionId;
        if (!sid) continue;

        const existing = sessionMap.get(sid);
        if (!existing) {
          sessionMap.set(sid, {
            project: entry.project || '',
            firstMessage: entry.display || '',
            firstTimestamp: entry.timestamp || 0,
            lastTimestamp: entry.timestamp || 0,
            messageCount: 1,
          });
        } else {
          existing.messageCount++;
          if (entry.timestamp > existing.lastTimestamp) {
            existing.lastTimestamp = entry.timestamp;
          }
        }
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    // history.jsonl doesn't exist yet
  }

  // Enrich with metadata from session JSONL first entries
  const sessions: SessionSummary[] = [];
  const projectsDir = path.join(claudeHome, 'projects');

  let projectDirs: string[];
  try {
    projectDirs = (await fs.promises.readdir(projectsDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    projectDirs = [];
  }

  for (const projDir of projectDirs) {
    const projPath = path.join(projectsDir, projDir);
    let files: string[];
    try {
      files = await fs.promises.readdir(projPath);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const sessionId = file.replace('.jsonl', '');
      const filePath = path.join(projPath, file);

      // Read first few lines to get metadata
      const metadata = await readSessionMetadata(filePath);
      const historyEntry = sessionMap.get(sessionId);

      sessions.push({
        sessionId,
        project: historyEntry?.project || projectDirToName(projDir),
        projectName: projDir,
        slug: metadata.slug || null,
        firstMessage: historyEntry?.firstMessage || metadata.firstMessage || '',
        timestamp: historyEntry?.firstTimestamp || metadata.timestamp || 0,
        lastTimestamp: Math.max(historyEntry?.lastTimestamp || 0, metadata.lastTimestamp || 0),
        messageCount: historyEntry?.messageCount || metadata.messageCount,
        version: metadata.version || null,
        gitBranch: metadata.gitBranch || null,
        forkedFrom: metadata.forkedFrom || null,
      });
    }
  }

  // Sort by most recent first
  sessions.sort((a, b) => b.lastTimestamp - a.lastTimestamp);
  return sessions;
}

interface SessionMetadata {
  slug?: string;
  firstMessage?: string;
  timestamp?: number;
  lastTimestamp?: number;
  messageCount: number;
  version?: string;
  gitBranch?: string;
  forkedFrom?: { sessionId: string; messageUuid: string } | null;
}

async function readSessionMetadata(filePath: string): Promise<SessionMetadata> {
  const result: SessionMetadata = { messageCount: 0 };

  try {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let lineCount = 0;
    let lastTimestamp = 0;

    for await (const line of rl) {
      if (!line.trim()) continue;
      lineCount++;

      try {
        const entry = JSON.parse(line);

        // Count actual messages (user and assistant only)
        if (entry.type === 'user' || entry.type === 'assistant') {
          result.messageCount++;

          const ts = entry.timestamp ? new Date(entry.timestamp).getTime() : 0;
          if (ts > lastTimestamp) lastTimestamp = ts;
        }

        // Get metadata from first user message
        if (entry.type === 'user' && !entry.message?.content?.[0]?.tool_use_id) {
          if (!result.firstMessage) {
            const content = entry.message?.content;
            result.firstMessage = typeof content === 'string'
              ? content
              : Array.isArray(content)
                ? content.find((c: any) => c.type === 'text')?.text || ''
                : '';
            result.timestamp = new Date(entry.timestamp).getTime();
          }

          if (!result.slug && entry.slug) result.slug = entry.slug;
          if (!result.version && entry.version) result.version = entry.version;
          if (!result.gitBranch && entry.gitBranch) result.gitBranch = entry.gitBranch;
          if (!result.forkedFrom && entry.forkedFrom) result.forkedFrom = entry.forkedFrom;
        }
      } catch {
        // Skip malformed lines
      }
    }

    result.lastTimestamp = lastTimestamp || result.timestamp;
  } catch {
    // File read error
  }

  return result;
}

export async function getSessionDetail(sessionId: string): Promise<SessionDetail | null> {
  const claudeHome = getClaudeHome();
  const projectsDir = path.join(claudeHome, 'projects');

  // Find the session file across all projects
  let sessionFile: string | null = null;
  let projDir = '';

  try {
    const projectDirs = await fs.promises.readdir(projectsDir, { withFileTypes: true });
    for (const dir of projectDirs) {
      if (!dir.isDirectory()) continue;
      const candidate = path.join(projectsDir, dir.name, `${sessionId}.jsonl`);
      try {
        await fs.promises.access(candidate);
        sessionFile = candidate;
        projDir = dir.name;
        break;
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }

  if (!sessionFile) return null;

  const messages: ConversationMessage[] = [];
  let summary: Partial<SessionSummary> = { sessionId, projectName: projDir };

  try {
    const stream = fs.createReadStream(sessionFile, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);

        if (entry.type === 'user') {
          const content = entry.message?.content;

          // Skip tool results
          if (Array.isArray(content) && content[0]?.tool_use_id) continue;

          const text = typeof content === 'string'
            ? content
            : Array.isArray(content)
              ? content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')
              : '';

          if (!text) continue;

          // Grab metadata from first real user message
          if (!summary.slug && entry.slug) summary.slug = entry.slug;
          if (!summary.project && entry.cwd) summary.project = entry.cwd;
          if (!summary.version && entry.version) summary.version = entry.version;
          if (!summary.gitBranch && entry.gitBranch) summary.gitBranch = entry.gitBranch;
          if (!summary.forkedFrom && entry.forkedFrom) summary.forkedFrom = entry.forkedFrom;
          if (!summary.timestamp) summary.timestamp = new Date(entry.timestamp).getTime();

          messages.push({
            uuid: entry.uuid,
            parentUuid: entry.parentUuid || null,
            type: 'user',
            timestamp: entry.timestamp,
            content: text,
            isSidechain: entry.isSidechain || false,
          });
        } else if (entry.type === 'assistant') {
          const contentArr = entry.message?.content;
          if (!Array.isArray(contentArr)) continue;

          const textParts: string[] = [];
          const toolCalls: ToolCallSummary[] = [];

          for (const block of contentArr) {
            if (block.type === 'text' && block.text) {
              textParts.push(block.text);
            } else if (block.type === 'tool_use') {
              toolCalls.push({
                name: block.name,
                input: typeof block.input === 'string'
                  ? block.input.slice(0, 200)
                  : JSON.stringify(block.input).slice(0, 200),
              });
            }
          }

          const text = textParts.join('\n');
          if (!text && toolCalls.length === 0) continue;

          messages.push({
            uuid: entry.uuid,
            parentUuid: entry.parentUuid || null,
            type: 'assistant',
            timestamp: entry.timestamp,
            content: text,
            model: entry.message?.model,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            isSidechain: entry.isSidechain || false,
          });
        }
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    return null;
  }

  const historyEntry = await getHistoryEntry(sessionId);

  return {
    summary: {
      sessionId,
      project: summary.project || projectDirToName(projDir),
      projectName: projDir,
      slug: summary.slug || null,
      firstMessage: historyEntry?.firstMessage || messages[0]?.content || '',
      timestamp: summary.timestamp || 0,
      lastTimestamp: messages.length > 0
        ? new Date(messages[messages.length - 1].timestamp).getTime()
        : summary.timestamp || 0,
      messageCount: messages.filter((m) => m.type === 'user').length,
      version: summary.version || null,
      gitBranch: summary.gitBranch || null,
      forkedFrom: summary.forkedFrom || null,
    },
    messages: messages.filter((m) => !m.isSidechain),
  };
}

/**
 * Find the original project/cwd path for a session by reading its JSONL.
 * Claude Code scopes --resume by cwd, so we need the original directory.
 */
export async function findSessionProject(sessionId: string): Promise<string | null> {
  const claudeHome = getClaudeHome();
  const projectsDir = path.join(claudeHome, 'projects');

  try {
    const dirs = await fs.promises.readdir(projectsDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const candidate = path.join(projectsDir, dir.name, `${sessionId}.jsonl`);
      try {
        await fs.promises.access(candidate);
      } catch {
        continue;
      }

      // Read the file to find cwd from first user message
      const stream = fs.createReadStream(candidate, { encoding: 'utf8' });
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          if (entry.cwd) {
            rl.close();
            stream.destroy();
            return entry.cwd;
          }
        } catch {
          // skip
        }
      }

      // Fallback: derive from directory name
      return projectDirToName(dir.name);
    }
  } catch {
    // projects dir doesn't exist
  }
  return null;
}

async function getHistoryEntry(sessionId: string): Promise<{ firstMessage: string } | null> {
  const historyPath = path.join(getClaudeHome(), 'history.jsonl');
  try {
    const stream = fs.createReadStream(historyPath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.sessionId === sessionId) {
          return { firstMessage: entry.display || '' };
        }
      } catch {
        // Skip
      }
    }
  } catch {
    // No history
  }
  return null;
}

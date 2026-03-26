import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import type { SessionSummary, SessionDetail, ConversationMessage, ToolCallSummary, ImageAttachment } from '../types.js';

function getClaudeHome(): string {
  return path.join(os.homedir(), '.claude');
}

function projectDirToName(dirName: string): string {
  // Convert encoded dir names like "-Users-inkpaper-projects-claude-code-manager" back to paths.
  // Claude CLI encodes paths by replacing '/', '\', ':', '_' and '.' with '-'.
  // We resolve the ambiguity by backtracking with filesystem existence checks.
  // For paths that no longer exist, we resolve as far as possible then apply
  // naive splitting for the remainder.
  const naive = dirName.replace(/^([A-Z])-/, '$1:').replaceAll('-', path.sep);

  const withDrive = dirName.replace(/^([A-Z])-/, '$1:');
  const parts = withDrive.split('-');
  if (parts.length <= 1) return naive;

  // Track the best partial resolution (longest validated prefix)
  let bestPrefix = '';
  let bestPrefixIdx = -1;

  // At each '-' boundary, try: path separator, underscore, dot-prefix, or literal hyphen.
  // Prune the search by verifying directory existence at '/' boundaries.
  function resolve(idx: number, builtPath: string): string | null {
    if (idx >= parts.length) {
      try { if (fs.existsSync(builtPath)) return builtPath; } catch {}
      return null;
    }

    const part = parts[idx];

    // Handle empty part from '--' (encodes '/.' — dot-prefixed dirs like .claude)
    // Merge the dot with the next part: '' + 'claude' → '.claude'
    if (part === '') {
      try {
        if (fs.statSync(builtPath).isDirectory()) {
          if (builtPath.length > bestPrefix.length) {
            bestPrefix = builtPath;
            bestPrefixIdx = idx;
          }
          if (idx + 1 < parts.length) {
            const dotPart = '.' + parts[idx + 1];
            const r = resolve(idx + 2, builtPath + path.sep + dotPart);
            if (r) return r;
          }
        }
      } catch {}
      return null;
    }

    // Option 1: '-' is a path separator
    try {
      if (fs.statSync(builtPath).isDirectory()) {
        if (builtPath.length > bestPrefix.length) {
          bestPrefix = builtPath;
          bestPrefixIdx = idx;
        }
        const r = resolve(idx + 1, builtPath + path.sep + part);
        if (r) return r;
      }
    } catch {}

    // Option 2: '-' was originally '_'
    const r2 = resolve(idx + 1, builtPath + '_' + part);
    if (r2) return r2;

    // Option 3: '-' is a literal hyphen
    const r3 = resolve(idx + 1, builtPath + '-' + part);
    if (r3) return r3;

    return null;
  }

  function tryResolve(root: string): string | null {
    bestPrefix = '';
    bestPrefixIdx = -1;
    const full = resolve(2, root);
    if (full) return full;

    // If we found a valid prefix, apply naive splitting for the remainder
    if (bestPrefix && bestPrefixIdx > 1) {
      const remaining = parts.slice(bestPrefixIdx);
      // Restore '--X' as '/.X' and other '-' as '/'
      let tail = '';
      for (let i = 0; i < remaining.length; i++) {
        if (remaining[i] === '' && i + 1 < remaining.length) {
          tail += path.sep + '.' + remaining[i + 1];
          i++; // skip next part, already consumed
        } else {
          tail += path.sep + remaining[i];
        }
      }
      return bestPrefix + tail;
    }
    return null;
  }

  // parts[0] is '' for Unix paths (leading '-' preserved) or 'C:' for Windows.
  if (parts.length >= 2) {
    const root = parts[0] + path.sep + parts[1];
    const resolved = tryResolve(root);
    if (resolved) return resolved;

    // If root doesn't start with '/' and we're on Unix, try with absolute path
    // (the leading '-' may have been stripped by the encoder)
    if (parts[0] !== '' && path.sep === '/') {
      const absResolved = tryResolve(path.sep + root);
      if (absResolved) return absResolved;
    }
  }

  return naive;
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
      // Skip subagent files (agent-*.jsonl) — they are not standalone sessions
      if (file.startsWith('agent-')) continue;
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

    let pendingThinking: string[] = [];

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

          // Extract image blocks
          const imageBlocks: ImageAttachment[] = [];
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'image' && block.source?.type === 'base64') {
                imageBlocks.push({
                  mediaType: block.source.media_type,
                  data: block.source.data,
                });
              }
            }
          }

          if (!text && imageBlocks.length === 0) continue;

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
            images: imageBlocks.length > 0 ? imageBlocks : undefined,
            isSidechain: entry.isSidechain || false,
          });
        } else if (entry.type === 'assistant') {
          const contentArr = entry.message?.content;
          if (!Array.isArray(contentArr)) continue;

          const textParts: string[] = [];
          const thinkingParts: string[] = [];
          const toolCalls: ToolCallSummary[] = [];

          for (const block of contentArr) {
            if (block.type === 'thinking' && block.thinking) {
              thinkingParts.push(block.thinking);
            } else if (block.type === 'text' && block.text) {
              textParts.push(block.text);
            } else if (block.type === 'tool_use') {
              toolCalls.push({
                name: block.name,
                input: typeof block.input === 'string'
                  ? { raw: block.input }
                  : block.input,
              });
            }
          }

          // Thinking-only messages: accumulate for next assistant message
          if (thinkingParts.length > 0 && !textParts.length && toolCalls.length === 0) {
            pendingThinking.push(...thinkingParts);
            continue;
          }

          const text = textParts.join('\n');
          if (!text && toolCalls.length === 0) continue;

          // Merge any inline thinking + accumulated pending thinking
          const allThinking = [...pendingThinking, ...thinkingParts];
          pendingThinking = [];
          const thinking = allThinking.join('\n');

          messages.push({
            uuid: entry.uuid,
            parentUuid: entry.parentUuid || null,
            type: 'assistant',
            timestamp: entry.timestamp,
            content: text,
            thinking: thinking || undefined,
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

  // Enrich non-sidechain assistant messages with tool calls from sidechain (subagent) messages.
  // First try: inline sidechain messages (old format, stored in main JSONL).
  let lastAgentMessage: ConversationMessage | null = null;
  for (const msg of messages) {
    if (!msg.isSidechain && msg.type === 'assistant') {
      if (msg.toolCalls?.some((tc) => tc.name === 'Agent' || tc.name === 'Task')) {
        lastAgentMessage = msg;
      } else {
        lastAgentMessage = null;
      }
    } else if (msg.isSidechain && msg.type === 'assistant' && msg.toolCalls && lastAgentMessage) {
      if (!lastAgentMessage.subagentToolCalls) lastAgentMessage.subagentToolCalls = [];
      lastAgentMessage.subagentToolCalls.push(...msg.toolCalls);
    }
  }

  // Second: load subagent files from {sessionId}/subagents/ directory (new format).
  const subagentsDir = path.join(path.dirname(sessionFile), sessionId, 'subagents');
  try {
    const subFiles = await fs.promises.readdir(subagentsDir);

    // Build map: description -> subagent tool calls
    const subagentMap = new Map<string, ToolCallSummary[]>();

    for (const file of subFiles) {
      if (!file.endsWith('.jsonl')) continue;
      const agentName = file.replace('.jsonl', '');

      // Try to get description from meta.json
      let description = '';
      try {
        const metaPath = path.join(subagentsDir, `${agentName}.meta.json`);
        const metaContent = await fs.promises.readFile(metaPath, 'utf8');
        const meta = JSON.parse(metaContent);
        description = meta.description || '';
      } catch {
        // No meta file — will try prompt matching below
      }

      // Parse subagent JSONL for tool calls and first user prompt
      const subToolCalls: ToolCallSummary[] = [];
      let firstPrompt = '';

      const subStream = fs.createReadStream(path.join(subagentsDir, file), { encoding: 'utf8' });
      const subRl = readline.createInterface({ input: subStream, crlfDelay: Infinity });
      for await (const line of subRl) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          // Capture first user message content for prompt matching
          if (entry.type === 'user' && !firstPrompt) {
            const content = entry.message?.content;
            firstPrompt = typeof content === 'string'
              ? content
              : Array.isArray(content)
                ? content.filter((c: Record<string, unknown>) => c.type === 'text').map((c: Record<string, unknown>) => c.text).join('\n')
                : '';
          }
          // Collect assistant tool calls
          if (entry.type === 'assistant') {
            const contentArr = entry.message?.content;
            if (Array.isArray(contentArr)) {
              for (const block of contentArr) {
                if (block.type === 'tool_use') {
                  subToolCalls.push({
                    name: block.name,
                    input: typeof block.input === 'string' ? { raw: block.input } : block.input,
                  });
                }
              }
            }
          }
        } catch {
          // Skip malformed lines
        }
      }

      if (subToolCalls.length > 0) {
        // Key by description or prompt for matching
        const key = description || firstPrompt;
        if (key) subagentMap.set(key, subToolCalls);
      }
    }

    // Match Agent tool calls to subagent data
    for (const msg of messages) {
      if (msg.isSidechain || msg.type !== 'assistant' || !msg.toolCalls) continue;
      for (const tc of msg.toolCalls) {
        if (tc.name !== 'Agent' && tc.name !== 'Task') continue;
        const desc = tc.input.description as string || '';
        const prompt = tc.input.prompt as string || '';
        // Match by description first, then by prompt
        const matched = subagentMap.get(desc) || subagentMap.get(prompt);
        if (matched) {
          if (!msg.subagentToolCalls) msg.subagentToolCalls = [];
          msg.subagentToolCalls.push(...matched);
          // Remove from map so each subagent is matched only once
          subagentMap.delete(desc || prompt);
        }
      }
    }
  } catch {
    // No subagents directory — skip
  }

  const mainMessages = messages.filter((m) => !m.isSidechain);

  const historyEntry = await getHistoryEntry(sessionId);

  return {
    summary: {
      sessionId,
      project: summary.project || projectDirToName(projDir),
      projectName: projDir,
      slug: summary.slug || null,
      firstMessage: historyEntry?.firstMessage || mainMessages[0]?.content || '',
      timestamp: summary.timestamp || 0,
      lastTimestamp: mainMessages.length > 0
        ? new Date(mainMessages[mainMessages.length - 1].timestamp).getTime()
        : summary.timestamp || 0,
      messageCount: mainMessages.filter((m) => m.type === 'user').length,
      version: summary.version || null,
      gitBranch: summary.gitBranch || null,
      forkedFrom: summary.forkedFrom || null,
    },
    messages: mainMessages,
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

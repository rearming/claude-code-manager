import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import readline from 'node:readline';
import type { ForkResult } from '../types.js';

function getClaudeHome(): string {
  return path.join(os.homedir(), '.claude');
}

/**
 * Find the session JSONL file and its project directory.
 */
async function findSessionFile(sessionId: string): Promise<{ filePath: string; projDir: string } | null> {
  const projectsDir = path.join(getClaudeHome(), 'projects');
  try {
    const dirs = await fs.promises.readdir(projectsDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const candidate = path.join(projectsDir, dir.name, `${sessionId}.jsonl`);
      try {
        await fs.promises.access(candidate);
        return { filePath: candidate, projDir: dir.name };
      } catch {
        continue;
      }
    }
  } catch {
    // projects dir doesn't exist
  }
  return null;
}

/**
 * Fork a session from a specific message UUID.
 *
 * Reads the original session JSONL, copies all raw lines up to and including
 * the target message (and its complete assistant response + tool results),
 * then writes a new session file with forkedFrom metadata injected.
 */
export async function forkSession(
  sourceSessionId: string,
  forkAtMessageUuid: string
): Promise<ForkResult> {
  const source = await findSessionFile(sourceSessionId);
  if (!source) {
    throw new Error(`Session ${sourceSessionId} not found`);
  }

  // Read all raw lines from the source
  const rawLines: string[] = [];
  const stream = fs.createReadStream(source.filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (line.trim()) rawLines.push(line);
  }

  // Find the fork point — the line with the target UUID
  let forkLineIndex = -1;
  for (let i = 0; i < rawLines.length; i++) {
    try {
      const entry = JSON.parse(rawLines[i]);
      if (entry.uuid === forkAtMessageUuid) {
        forkLineIndex = i;
        break;
      }
    } catch {
      // skip
    }
  }

  if (forkLineIndex === -1) {
    throw new Error(`Message ${forkAtMessageUuid} not found in session ${sourceSessionId}`);
  }

  // Determine what to include: if we're forking at a user message, include
  // the complete exchange — the user message plus the assistant's response
  // and any tool result lines that follow it.
  let endIndex = forkLineIndex;
  try {
    const forkEntry = JSON.parse(rawLines[forkLineIndex]);

    if (forkEntry.type === 'user') {
      // Include the assistant response chain that follows this user message
      for (let i = forkLineIndex + 1; i < rawLines.length; i++) {
        try {
          const entry = JSON.parse(rawLines[i]);
          // Keep going through assistant messages and tool results that are
          // part of this exchange (same parentUuid chain)
          if (entry.type === 'assistant' ||
              (entry.type === 'user' && Array.isArray(entry.message?.content) && entry.message.content[0]?.tool_use_id)) {
            endIndex = i;
          } else {
            // Hit the next real user message — stop
            break;
          }
        } catch {
          break;
        }
      }
    }
  } catch {
    // Use forkLineIndex as-is
  }

  // Copy lines up to and including the end of the exchange
  const linesToCopy = rawLines.slice(0, endIndex + 1);

  // Generate new session ID
  const newSessionId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Rewrite lines: inject forkedFrom into every entry that has a sessionId,
  // and update sessionId to the new one
  const newLines: string[] = [];
  for (const line of linesToCopy) {
    try {
      const entry = JSON.parse(line);

      // Inject forkedFrom metadata
      if (entry.type === 'user' || entry.type === 'assistant' || entry.type === 'system') {
        entry.forkedFrom = {
          sessionId: sourceSessionId,
          messageUuid: forkAtMessageUuid,
        };
      }

      // Update sessionId references
      if (entry.sessionId) {
        entry.sessionId = newSessionId;
      }

      newLines.push(JSON.stringify(entry));
    } catch {
      // Keep malformed lines as-is
      newLines.push(line);
    }
  }

  // Write the new session file
  const newFilePath = path.join(
    getClaudeHome(),
    'projects',
    source.projDir,
    `${newSessionId}.jsonl`
  );

  await fs.promises.writeFile(newFilePath, newLines.join('\n') + '\n', 'utf8');

  return {
    sessionId: newSessionId,
    projectDir: source.projDir,
    resumeCommand: `claude --resume ${newSessionId}`,
    messagesCopied: newLines.length,
  };
}

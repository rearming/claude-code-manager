import { spawn } from 'node:child_process';
import { findSessionProject } from './claude-data.js';

export function getResumeCommand(sessionId: string): string {
  return `claude --resume ${sessionId}`;
}

/**
 * Send a message to a session using `claude --resume <id> --print -p "message"`.
 * Spawns claude from the session's original project directory (required — claude
 * scopes session lookup by cwd).
 */
export async function sendMessage(
  sessionId: string,
  message: string
): Promise<{ response: string; exitCode: number }> {
  const projectPath = await findSessionProject(sessionId);
  if (!projectPath) {
    throw new Error(`Cannot determine project directory for session ${sessionId}`);
  }

  return new Promise((resolve, reject) => {
    const args = ['--resume', sessionId, '--print', '-p', message];
    const proc = spawn('claude', args, {
      shell: true,
      cwd: projectPath,
      timeout: 120_000,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn claude: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code !== 0 && !stdout) {
        reject(new Error(`claude exited with code ${code}: ${stderr}`));
      } else {
        resolve({ response: stdout.trim(), exitCode: code ?? 0 });
      }
    });
  });
}

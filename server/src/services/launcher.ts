export function getResumeCommand(sessionId: string): string {
  return `claude --resume ${sessionId}`;
}

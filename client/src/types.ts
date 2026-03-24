export interface SessionSummary {
  sessionId: string;
  project: string;
  projectName: string;
  slug: string | null;
  firstMessage: string;
  timestamp: number;
  lastTimestamp: number;
  messageCount: number;
  version: string | null;
  gitBranch: string | null;
  forkedFrom: {
    sessionId: string;
    messageUuid: string;
  } | null;
}

export interface ConversationMessage {
  uuid: string;
  parentUuid: string | null;
  type: 'user' | 'assistant' | 'system';
  timestamp: string;
  content: string;
  model?: string;
  toolCalls?: ToolCallSummary[];
  isSidechain: boolean;
}

export interface ToolCallSummary {
  name: string;
  input: Record<string, any>;
}

export interface SessionDetail {
  summary: SessionSummary;
  messages: ConversationMessage[];
}

export interface ForkResult {
  sessionId: string;
  projectDir: string;
  resumeCommand: string;
  messagesCopied: number;
}

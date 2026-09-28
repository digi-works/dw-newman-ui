// src/types.ts
export type Message = {
    id: string;
    role: 'user' | 'ai';
    content: string;
    thought?: string;
    // Set when Flowise emits an [ACTION:name]{...} marker for this message —
    // drives which generative UI (registered via useCopilotAction) renders under it.
    action?: { name: string; payload: Record<string, unknown> };
  };
  
  export type ChatSession = {
    id: string;
    title: string;
    messages: Message[];
    updatedAt: number;
  };
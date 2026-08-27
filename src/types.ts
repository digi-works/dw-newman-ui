// src/types.ts
export type Message = {
    id: string;
    role: 'user' | 'ai';
    content: string;
    thought?: string;
  };
  
  export type ChatSession = {
    id: string;
    title: string;
    messages: Message[];
    updatedAt: number;
  };
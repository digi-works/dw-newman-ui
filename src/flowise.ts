// src/flowise.ts

type FlowiseEvent = {
    event: string;
    data?: unknown;
  };
  
  /**
   * Parses Flowise's Server-Sent Events stream.
   */
  async function* parseFlowiseSSE(body: ReadableStream<Uint8Array>): AsyncIterable<FlowiseEvent> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        
        const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        
        try {
          const payload = JSON.parse(dataLine.slice(5).trim());
          if (payload && payload.event) yield payload;
        } catch {
          // Skip malformed JSON frames
        }
      }
    }
  }
  
  /** Marker format: [ACTION:name]{json} */
  const ACTION_MARKER = /\[ACTION:([a-zA-Z0-9_-]+)\]\{/;
  
  /**
   * Connects to Flowise, streams the response, and cleans up action markers.
   */
  export async function streamFlowiseChat(
    question: string,
    chatId: string,
    onUpdate: (text: string) => void
  ) {
    const flowiseUrl = process.env.NEXT_PUBLIC_FLOWISE_URL;
    const apiKey = process.env.NEXT_PUBLIC_FLOWISE_API_KEY;
    const chatflowId = process.env.NEXT_PUBLIC_CHATFLOW_DEFAULT;

    if (!flowiseUrl || !apiKey || !chatflowId) {
      throw new Error("Missing NEXT_PUBLIC_FLOWISE credentials in your .env file.");
    }
  
    const res = await fetch(`${flowiseUrl}/api/v1/prediction/${chatflowId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ question, chatId, streaming: true }),
    });
  
    if (!res.ok || !res.body) {
      throw new Error(`Flowise Error ${res.status}: ${await res.text()}`);
    }
  
    let textBuffer = "";
  
    for await (const ev of parseFlowiseSSE(res.body)) {
      if (ev.event === "token") {
        const delta = typeof ev.data === "string" ? ev.data : String(ev.data ?? "");
        textBuffer += delta;
  
        // Don't render text if we are in the middle of typing an [ACTION] block
        const incompleteMarker = /\[ACTION[^\]]*$/.test(textBuffer);
        if (!incompleteMarker) {
          
          let cleanText = textBuffer;
          let match;
          
          // Strip out fully completed [ACTION] blocks before showing them
          while ((match = ACTION_MARKER.exec(cleanText)) !== null) {
            const open = cleanText.indexOf("{", match.index);
            let depth = 0;
            let end = -1;
            for (let i = open; i < cleanText.length; i++) {
              if (cleanText[i] === "{") depth++;
              else if (cleanText[i] === "}") {
                depth--;
                if (depth === 0) { end = i + 1; break; }
              }
            }
            if (end > -1) {
              cleanText = cleanText.slice(0, match.index) + cleanText.slice(end);
            } else {
              break; 
            }
          }
          
          onUpdate(cleanText); 
        }
      } else if (ev.event === "error") {
        throw new Error(typeof ev.data === "string" ? ev.data : JSON.stringify(ev.data));
      }
    }
  }
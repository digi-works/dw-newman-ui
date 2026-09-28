import { useState, useRef, useEffect } from 'react';
import { useCopilotAction } from '@copilotkit/react-core';
import { streamFlowiseChat } from '../flowise';
import type { ChatSession, Message } from '../types';
import { CalendarInviteForm, type CampusEvent, formatEventDate, formatEventTime, inviteReplyCutIndex, isCalendarInviteAction, isInviteRequest, isRefusal } from './generative-ui/calendar-invite-form';
import { correctKeywordTypos } from '@/lib/fuzzy';

const COUNTRY_CODES = [
  { code: '+1', label: '🇺🇸 US +1', digits: 10 },
  { code: '+91', label: '🇮🇳 IN +91', digits: 10 },
  { code: '+44', label: '🇬🇧 UK +44', digits: 10 },
  { code: '+61', label: '🇦🇺 AU +61', digits: 9 },
  { code: '+81', label: '🇯🇵 JP +81', digits: 10 },
  { code: '+86', label: '🇨🇳 CN +86', digits: 11 },
  { code: '+49', label: '🇩🇪 DE +49', digits: 10 },
  { code: '+33', label: '🇫🇷 FR +33', digits: 9 },
  { code: '+971', label: '🇦🇪 AE +971', digits: 9 },
];

// Standard email shape (local@domain.tld); rejects missing parts and any whitespace.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const NEWMAN_FACTS = [
  "Newman University was founded in 1933 by the Adorers of the Blood of Christ.",
  "The university was originally named Sacred Heart Junior College.",
  "Our mascot is Johnny Jet, a nod to Wichita's rich aviation history.",
  "DeMattias Hall is named after St. Maria De Mattias, the founder of the Adorers.",
  "Newman is the only Catholic university in the Diocese of Wichita.",
  "The campus spans 61 beautiful acres right in the heart of Wichita."
];

// ==========================================
// GENERATIVE UI — TABLE RENDERING
// ==========================================
// Shared markup for any tabular generative UI, whether it comes from an
// explicit [ACTION:show_table]{...} marker or is auto-detected straight out
// of Flowise's plain-text reply (see isMarkdownTableSeparator below).
type TablePayload = { title?: string; columns?: string[]; rows?: Record<string, string | number>[] };

function renderTableBlock(columns: string[], rows: Record<string, string | number>[], title?: string, key?: string | number) {
  if (columns.length === 0 || rows.length === 0) {
    return (
      <div key={key} style={{ marginTop: '12px', padding: '12px', background: 'var(--sidebar-hover)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
        No table data was provided.
      </div>
    );
  }

  return (
    <div key={key} style={{ marginTop: '12px', border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden' }}>
      {title && (
        <div style={{ padding: '10px 14px', background: 'var(--sidebar-hover)', borderBottom: '1px solid var(--border-color)', fontWeight: 600, fontSize: '13px', color: 'var(--text-main)' }}>
          {title}
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col} style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--brand)', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ borderTop: i > 0 ? '1px solid var(--border-color)' : undefined }}>
                {columns.map(col => (
                  <td key={col} style={{ padding: '10px 14px', color: 'var(--text-main)' }}>
                    {String(row[col] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Splits "| A | B |" into ["A", "B"], dropping **bold** markers the table can't render.
function parseMarkdownTableRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.replace(/\*\*/g, '').trim());
}

// True for a markdown table separator row, e.g. "| --- | :---: |".
function isMarkdownTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') && !trimmed.includes('-')) return false;
  const cells = parseMarkdownTableRow(trimmed);
  return cells.length > 0 && cells.every(cell => /^:?-{2,}:?$/.test(cell));
}

// Converts a captured [header, separator, ...dataRows] block into {columns, rows}.
function markdownTableToPayload(tableLines: string[]): { columns: string[]; rows: Record<string, string>[] } {
  const columns = parseMarkdownTableRow(tableLines[0]);
  const rows = tableLines.slice(2).map(line => {
    const cells = parseMarkdownTableRow(line);
    const row: Record<string, string> = {};
    columns.forEach((col, i) => { row[col] = cells[i] ?? ''; });
    return row;
  });
  return { columns, rows };
}

interface ChatWorkspaceProps {
  activeChat: ChatSession;
  activeChatId: string;
  setChats: React.Dispatch<React.SetStateAction<ChatSession[]>>;
}

export default function ChatWorkspace({ activeChat, activeChatId, setChats }: ChatWorkspaceProps) {
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingFact, setLoadingFact] = useState(NEWMAN_FACTS[0]);
  // Id of the AI message that must render the booking form no matter what it says —
  // set when the user explicitly asks to reserve a room, so the form isn't at the mercy
  // of keyword-matching the AI's reply text.
  const [forcedBookingMsgId, setForcedBookingMsgId] = useState<string | null>(null);
  // Hover actions on the user's own messages (copy / edit & resend), ChatGPT-style.
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat.messages]);

  const now = new Date();
  const dateString = `${now.toLocaleDateString('en-GB', { weekday: 'long' })}, ${now.getDate()} ${now.toLocaleDateString('en-GB', { month: 'long' })}`;
  const hour = now.getHours();
  let greetingTime = "Good evening";
  if (hour < 12) greetingTime = "Good morning";
  else if (hour < 17) greetingTime = "Good afternoon";
  const greeting = `${greetingTime}, Jordan.`;

  const parseThoughtAndAnswer = (rawText: string) => {
    const thoughtKeywords = ["Checking", "Searching", "Thinking", "Analyzing", "Evaluating", "Looking up"];
    let thought = "";
    let answer = rawText;

    for (const kw of thoughtKeywords) {
      if (rawText.includes(kw)) {
        const parts = rawText.split(/(?=[A-Z][a-z]+(?:ing|\s))/);
        const thoughtParts = parts.filter(p => thoughtKeywords.some(k => p.trim().startsWith(k)));
        if (thoughtParts.length > 0) {
          thought = thoughtParts.join(" ");
          answer = parts.filter(p => !thoughtKeywords.some(k => p.trim().startsWith(k))).join(" ");
        }
        break;
      }
    }

    if (!thought && rawText.includes("...")) {
      const splitIdx = rawText.lastIndexOf("... ");
      if (splitIdx > 0 && splitIdx < rawText.length - 20) {
        thought = rawText.slice(0, splitIdx + 3);
        answer = rawText.slice(splitIdx + 3).trim();
      } else if (splitIdx > 0) {
        thought = rawText;
        answer = "";
      }
    }

    return { 
      thought: thought.trim(), 
      answer: thought ? answer.trim() : rawText.trim() 
    };
  };

  const renderFormattedText = (text: string, hideBookingList: boolean = false) => {
    let cleanText = text;
    
    if (hideBookingList) {
      const splitMatch = text.match(/(I still need|Please reply|1\.|Please send|Please provide|Your details|To book this|For the booking|Please share|I'll need|I will need|Fill out|Fill in|Enter your|Details for|I need a couple details|Full name|Name:|Please tell me)/i);
      if (splitMatch && splitMatch.index !== undefined) {
        cleanText = text.substring(0, splitMatch.index).trim();
      }
    }

    const lines = cleanText.split('\n');
    const renderedElements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeContent: string[] = [];

    const parseInlineFormat = (str: string) => {
      const parts = str.split('**');
      return parts.map((part, pIdx) => {
        if (pIdx % 2 === 1) {
          return <strong key={pIdx} style={{ color: 'inherit', fontWeight: 700 }}>{part}</strong>;
        }
        return part;
      });
    };

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      if (line.trim().startsWith('```')) {
        if (inCodeBlock) {
          renderedElements.push(
            <div key={`code-${i}`} style={{ background: 'var(--sidebar-hover)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', margin: '12px 0', overflowX: 'auto' }}>
              <pre style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                {codeContent.join('\n')}
              </pre>
            </div>
          );
          codeContent = [];
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
        }
        continue;
      }

      if (inCodeBlock) {
        codeContent.push(line);
        continue;
      }

      if (line.trim() === '') {
        if (i > 0 && lines[i - 1].trim() !== '') {
          renderedElements.push(<div key={`br-${i}`} style={{ height: '6px' }} />);
        }
        continue;
      }

      // Generative UI: a markdown table straight out of Flowise's reply —
      // "| A | B |" header followed by a "|---|---|" separator — renders as a
      // real table instead of raw pipe characters. The model often puts blank
      // lines between rows, so those are skipped rather than ending the table.
      if (line.trim().startsWith('|')) {
        const nextFilled = (from: number) => {
          let k = from;
          while (k < lines.length && lines[k].trim() === '') k++;
          return k;
        };
        const sepIdx = nextFilled(i + 1);
        if (sepIdx < lines.length && isMarkdownTableSeparator(lines[sepIdx])) {
          const tableLines = [line, lines[sepIdx]];
          let j = nextFilled(sepIdx + 1);
          while (j < lines.length && lines[j].trim().startsWith('|')) {
            tableLines.push(lines[j]);
            j = nextFilled(j + 1);
          }
          const { columns, rows } = markdownTableToPayload(tableLines);
          renderedElements.push(renderTableBlock(columns, rows, undefined, `table-${i}`));
          i = j - 1; // resume the outer loop right after the consumed table block
          continue;
        }
      }

      line = line.replace(/^[\*\-]\s+[\*\-]\s+/, '- ');

      let isList = false;
      let cleanLine = line.trim();

      if (cleanLine.startsWith('- ') || cleanLine.startsWith('* ')) {
        isList = true;
        cleanLine = cleanLine.substring(2).trim();
      }

      if (cleanLine.match(/^\*[^\*].*\*\*/)) {
        cleanLine = cleanLine.replace(/^\*/, '**');
      }

      if (isList) {
        renderedElements.push(
          <div key={`li-${i}`} style={{ display: 'flex', gap: '8px', marginBottom: '8px', paddingLeft: '8px' }}>
            <span style={{ color: 'var(--brand)', fontSize: '16px', lineHeight: '1.4' }}>•</span>
            <div style={{ flex: 1, lineHeight: '1.5', color: 'inherit' }}>
              {parseInlineFormat(cleanLine)}
            </div>
          </div>
        );
      } else {
        renderedElements.push(
          <p key={`p-${i}`} style={{ marginBottom: '8px', lineHeight: '1.5', color: 'inherit' }}>
            {parseInlineFormat(cleanLine)}
          </p>
        );
      }
    }

    if (inCodeBlock && codeContent.length > 0) {
      renderedElements.push(
        <div key="code-end" style={{ background: 'var(--sidebar-hover)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', margin: '12px 0', overflowX: 'auto' }}>
          <pre style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
            {codeContent.join('\n')}
          </pre>
        </div>
      );
    }

    return renderedElements;
  };

  // NEW: displayMessage parameter handles what is shown on screen vs what is sent to AI
  // forceBookingForm guarantees the booking form renders under the AI's reply to this
  // message, regardless of what the AI actually says.
  const submitMessage = async (textToSend: string, displayMessage?: string, forceBookingForm?: boolean) => {
    if (!textToSend.trim() || isLoading) return;

    setIsLoading(true);
    setLoadingFact(NEWMAN_FACTS[Math.floor(Math.random() * NEWMAN_FACTS.length)]);

    const userMsgId = Date.now().toString();
    const aiMsgId = (Date.now() + 1).toString();

    if (forceBookingForm) {
      setForcedBookingMsgId(aiMsgId);
    }

    const isFirstMessage = activeChat.messages.length === 0;
    const contentToDisplay = displayMessage || textToSend;
    let newTitle = activeChat.title;
    
    if (isFirstMessage && activeChat.title === 'New Chat') {
      newTitle = contentToDisplay.length > 25 ? contentToDisplay.slice(0, 25) + '...' : contentToDisplay;
    }

    setChats(prev => prev.map(chat => {
      if (chat.id === activeChatId) {
        return {
          ...chat,
          title: newTitle,
          updatedAt: Date.now(),
          messages: [
            ...chat.messages, 
            { id: userMsgId, role: 'user', content: contentToDisplay },
            { id: aiMsgId, role: 'ai', content: '', thought: 'Analyzing request...' }
          ]
        };
      }
      return chat;
    }));

    try {
      await streamFlowiseChat(
        textToSend,
        activeChatId,
        (fullText) => {
          const { thought, answer } = parseThoughtAndAnswer(fullText);

          setChats(prev => prev.map(chat => {
            if (chat.id === activeChatId) {
              return {
                ...chat,
                messages: chat.messages.map(msg =>
                  msg.id === aiMsgId ? { ...msg, content: answer, thought: thought || msg.thought } : msg
                )
              };
            }
            return chat;
          }));
        },
        // Flowise decided this reply calls for a generative UI (e.g. [ACTION:book_room]{...}) —
        // tag the message so it renders through the matching useCopilotAction below.
        (actionName, payload) => {
          setChats(prev => prev.map(chat => {
            if (chat.id === activeChatId) {
              return {
                ...chat,
                messages: chat.messages.map(msg =>
                  msg.id === aiMsgId ? { ...msg, action: { name: actionName, payload } } : msg
                )
              };
            }
            return chat;
          }));
        }
      );
    } catch (error) {
      console.error("Flowise error:", error);
      setChats(prev => prev.map(chat => {
        if (chat.id === activeChatId) {
          return {
            ...chat,
            messages: chat.messages.map(msg => 
              msg.id === aiMsgId ? { ...msg, content: "Sorry, I encountered an error connecting to the campus assistant.", thought: "" } : msg
            )
          };
        }
        return chat;
      }));
    } finally {
      setIsLoading(false);
    }
  };

  // Typed messages go to Flowise with key-word typos fixed ("calnder inviute" →
  // "calendar invite") so it understands them; the chat still shows what was typed.
  const sendTyped = (text: string) => submitMessage(correctKeywordTypos(text), text);

  const handleCopy = async (msg: Message) => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedMsgId(msg.id);
      setTimeout(() => setCopiedMsgId(current => (current === msg.id ? null : current)), 1500);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const startEditing = (msg: Message) => {
    setEditingMsgId(msg.id);
    setEditText(msg.content);
  };

  // Like ChatGPT: editing a message drops it and everything after it, then
  // sends the edited text as a fresh message.
  const submitEdit = (index: number) => {
    const text = editText.trim();
    if (!text || isLoading) return;
    setEditingMsgId(null);
    setChats(prev => prev.map(chat =>
      chat.id === activeChatId ? { ...chat, messages: chat.messages.slice(0, index) } : chat
    ));
    sendTyped(text);
  };

  const handleInputSend = () => {
    sendTyped(inputText);
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleInputSend();
    }
  };

  // ==========================================
  // REAL-TIME 2-STEP BOOKING DETAILS FORM
  // ==========================================
  type BookingPrefill = Partial<{
    purpose: string;
    date: string;
    startTime: string;
    endTime: string;
    people: number;
    building: string;
  }>;

  const BookingDetailsForm = ({ initialValues }: { initialValues?: BookingPrefill }) => {
    const [step, setStep] = useState(1);

    // Step 1 State (Requirements) — prefilled from Flowise's book_room action payload, when present
    const [purpose, setPurpose] = useState(initialValues?.purpose ?? '');
    const [date, setDate] = useState(initialValues?.date ?? '');
    const [startTime, setStartTime] = useState(initialValues?.startTime ?? '');
    const [endTime, setEndTime] = useState(initialValues?.endTime ?? '');
    const [people, setPeople] = useState(initialValues?.people ?? 12);
    const [building, setBuilding] = useState(initialValues?.building ?? 'No preference');
    const [needs, setNeeds] = useState<string[]>([]);
    
    // Dynamic Buildings State
    const [dbBuildings, setDbBuildings] = useState<string[]>([]);
    const [isFetchingBuildings, setIsFetchingBuildings] = useState(true);

    // Step 2 State (DB Fetched Rooms & Personal Details)
    const [availableRooms, setAvailableRooms] = useState<string[]>([]);
    const [isFetchingRooms, setIsFetchingRooms] = useState(false);
    const [selectedRoom, setSelectedRoom] = useState('');
    const [roomMessage, setRoomMessage] = useState('');

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [studentId, setStudentId] = useState('');
    const [countryCode, setCountryCode] = useState('+1');
    const [phone, setPhone] = useState('');

    const expectedPhoneDigits = COUNTRY_CODES.find(c => c.code === countryCode)?.digits ?? 10;
    const phoneDigitsOnly = phone.replace(/\D/g, '');
    const isPhoneValid = phone.trim() === '' || phoneDigitsOnly.length === expectedPhoneDigits;

    // Validated against the raw value on purpose — leading/trailing/internal spaces must fail, not get trimmed away.
    const isEmailValid = email === '' || EMAIL_REGEX.test(email);

    // Fetch unique buildings on form load
    useEffect(() => {
      fetch('/api/buildings')
        .then(res => res.json())
        .then(data => {
          if (data && data.buildings) {
            setDbBuildings(data.buildings);
          }
        })
        .catch(err => console.error("Failed to fetch buildings:", err))
        .finally(() => setIsFetchingBuildings(false));
    }, []);

    const toggleNeed = (need: string) => {
      setNeeds(prev => prev.includes(need) ? prev.filter(n => n !== need) : [...prev, need]);
    };

    const handleFindRooms = async () => {
      setStep(2);
      setIsFetchingRooms(true);
      setSelectedRoom('');
      setRoomMessage('');

      try {
        const params = new URLSearchParams({
          date: date,
          startTime: startTime,
          endTime: endTime,
          capacity: people.toString(),
          building: building,
          needs: needs.join(',')
        });

        const res = await fetch(`/api/rooms/available?${params.toString()}`);
        
        if (!res.ok) throw new Error("API request failed");
        
        const data = await res.json();
        
        if (data.exactMatches && data.exactMatches.length > 0) {
          setAvailableRooms(data.exactMatches);
          setRoomMessage("✓ Found exact matches for your requested time!");
        } else if (data.alternatives && data.alternatives.length > 0) {
          setAvailableRooms(data.alternatives);
          setRoomMessage("ℹ No exact matches found, but here are some available alternatives nearby:");
        } else if (data.rooms && data.rooms.length > 0) {
          setAvailableRooms(data.rooms);
          setRoomMessage("✓ Here are the available rooms:");
        } else {
          setAvailableRooms([]);
          setRoomMessage("⚠ No rooms match your exact requirements.");
        }
      } catch (error) {
        console.error("Real database fetch failed:", error);
        setAvailableRooms([]);
        setRoomMessage("⚠ Unable to fetch live availability from the database.");
      } finally {
        setIsFetchingRooms(false);
      }
    };

    const handleSubmit = () => {
      const payload = {
        action: "submit_booking_request",
        room: selectedRoom,
        purpose: purpose.trim(),
        date: date,
        startTime: startTime,
        endTime: endTime,
        attendees: people,
        building: building,
        needs: needs,
        fullName: name.trim(),
        email: email.trim(),
        studentId: studentId.trim(),
        ...(phone && { phoneNumber: `${countryCode} ${phone.trim()}` })
      };

      const finalString = `Here are my details for the booking:\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;

      // NEW: Create a beautifully formatted string to display in the chat UI
      let displayString = `Here are my details for the booking:\n- **Room:** ${selectedRoom}\n- **Date:** ${date}\n- **Time:** ${startTime} to ${endTime}\n- **Purpose:** ${purpose.trim()}\n- **Attendees:** ${people}\n- **Name:** ${name.trim()} (${studentId.trim()})\n- **Email:** ${email.trim()}`;
      if (phone) displayString += `\n- **Phone:** ${countryCode} ${phone.trim()}`;
      if (needs.length > 0) displayString += `\n- **Needs:** ${needs.join(', ')}`;

      // Pass the raw JSON to Flowise, but render the clean string in the UI
      submitMessage(finalString, displayString);
    };

    const isStep1Complete = purpose.trim() && date && startTime && endTime;
    const isStep2Complete = selectedRoom && name.trim() && email.trim() && studentId.trim() && isPhoneValid && isEmailValid;

    return (
      <div className="booking-form-card">
        <div className="form-header">
          <h4>Room request</h4>
          <span>Step {step} of 2</span>
        </div>
        
        <div className="form-body">
          {step === 1 ? (
            <>
              <div className="booking-form-row">
                <label>What is the booking for?</label>
                <input type="text" className="booking-input" placeholder="e.g. Book club discussion" value={purpose} onChange={e => setPurpose(e.target.value)} />
              </div>

              <div className="form-grid-3">
                <div className="booking-form-row">
                  <label>Date</label>
                  <input type="date" className="booking-input" value={date} onChange={e => setDate(e.target.value)} />
                </div>
                <div className="booking-form-row">
                  <label>Start</label>
                  <input type="time" className="booking-input" value={startTime} onChange={e => setStartTime(e.target.value)} />
                </div>
                <div className="booking-form-row">
                  <label>End</label>
                  <input type="time" className="booking-input" value={endTime} onChange={e => setEndTime(e.target.value)} />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="booking-form-row">
                  <label>How many people?</label>
                  <div className="number-stepper">
                    <span className="stepper-value">{people}</span>
                    <div className="stepper-controls">
                      <button className="stepper-btn" onClick={() => setPeople(p => Math.max(1, p - 1))}>−</button>
                      <button className="stepper-btn" onClick={() => setPeople(p => p + 1)}>+</button>
                    </div>
                  </div>
                </div>
                <div className="booking-form-row">
                  <label>Preferred building</label>
                  <select 
                    className="booking-input" 
                    value={building} 
                    onChange={e => setBuilding(e.target.value)}
                    disabled={isFetchingBuildings}
                  >
                    <option value="No preference">
                      {isFetchingBuildings ? "Loading buildings..." : "No preference"}
                    </option>
                    {dbBuildings.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="booking-form-row">
                <label>Anything the room needs?</label>
                <div className="chips-container">
                  {['Display', 'Projector', 'Moveable seating', 'Whiteboard', 'Accessible entry'].map(need => (
                    <button 
                      key={need} 
                      className={`chip-btn ${needs.includes(need) ? 'selected' : ''}`}
                      onClick={() => toggleNeed(need)}
                    >
                      {need}
                    </button>
                  ))}
                </div>
              </div>

              <div className="step-actions">
                <button className="booking-submit-btn" disabled={!isStep1Complete} onClick={handleFindRooms}>
                  Find Available Rooms
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="booking-form-row" style={{ marginBottom: '8px' }}>
                <label style={{ color: 'var(--brand)' }}>Select an Available Room</label>

                {roomMessage && (
                  <div style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: availableRooms.length > 0 ? 'var(--green)' : 'var(--brand)',
                    marginBottom: '8px',
                    background: availableRooms.length > 0 ? 'var(--green-tint)' : 'var(--brand-tint)',
                    padding: '8px 12px',
                    borderRadius: '6px'
                  }}>
                    {roomMessage}
                  </div>
                )}

                <select
                  className="booking-input"
                  value={selectedRoom}
                  onChange={e => setSelectedRoom(e.target.value)}
                  disabled={isFetchingRooms || availableRooms.length === 0}
                  style={{ borderColor: 'var(--brand)' }}
                >
                  <option value="">
                    {isFetchingRooms ? "Searching live database..." : (availableRooms.length > 0 ? "Choose a matching room" : "No rooms found")}
                  </option>
                  {availableRooms.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>

                {availableRooms.length === 0 && !isFetchingRooms && (
                   <button 
                     className="btn-secondary" 
                     style={{ marginTop: '12px', width: '100%', borderColor: 'var(--brand)', color: 'var(--brand)' }}
                     onClick={() => {
                        submitMessage(`I need a room for ${people} people in ${building} on ${date} from ${startTime} to ${endTime}, but the database says nothing is available. Can you help me find alternative dates, times, or buildings?`);
                     }}
                   >
                      Ask Assistant for alternatives
                   </button>
                )}
              </div>

              <div className="booking-form-row">
                <label>Full Name</label>
                <input type="text" className="booking-input" placeholder="John Doe" value={name} onChange={e => setName(e.target.value)} />
              </div>
              
              <div className="booking-form-row">
                <label>Newman Email Address</label>
                <input
                  type="email"
                  className="booking-input"
                  placeholder="johndoe@newman.edu"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={{ borderColor: !isEmailValid ? 'var(--red, #dc2626)' : undefined }}
                />
                {!isEmailValid && (
                  <span style={{ fontSize: '12px', color: 'var(--red, #dc2626)', marginTop: '4px' }}>
                    Enter a valid email address (no spaces, e.g. johndoe@newman.edu)
                  </span>
                )}
              </div>

              <div className="form-grid-2">
                <div className="booking-form-row">
                  <label>Faculty ID or Event Coordinator ID</label>
                  <input type="text" className="booking-input" placeholder="e.g. 12345678" value={studentId} onChange={e => setStudentId(e.target.value)} />
                </div>
                <div className="booking-form-row">
                  <label>Mobile Phone</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                      className="booking-input"
                      value={countryCode}
                      onChange={e => setCountryCode(e.target.value)}
                      style={{ flex: '0 0 100px' }}
                    >
                      {COUNTRY_CODES.map(c => (
                        <option key={c.code} value={c.code}>{c.label}</option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      className="booking-input"
                      placeholder={`${expectedPhoneDigits}-digit number`}
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      style={{ flex: 1, borderColor: !isPhoneValid ? 'var(--red, #dc2626)' : undefined }}
                    />
                  </div>
                  {!isPhoneValid && (
                    <span style={{ fontSize: '12px', color: 'var(--red, #dc2626)', marginTop: '4px' }}>
                      Enter a valid {expectedPhoneDigits}-digit number for {countryCode}
                    </span>
                  )}
                </div>
              </div>

              <div className="step-actions">
                <button className="btn-secondary" onClick={() => setStep(1)}>Back</button>
                <button className="booking-submit-btn" disabled={!isStep2Complete || isLoading} onClick={handleSubmit}>
                  {isLoading ? "Submitting..." : "Submit Booking Request"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // ==========================================
  // REAL COPILOTKIT GENERATIVE UI REGISTRATION
  // ==========================================
  // Flowise remains the chat brain: it decides, from understanding the user's
  // question, whether to emit an [ACTION:book_room]{...} marker (parsed in
  // flowise.ts). When it does, the tagged message renders through this action's
  // `render` — CopilotKit's actual generative-UI API — instead of guessing from
  // the reply text.
  const renderBookingForm = (props: { args?: Record<string, unknown> }) => {
    return <BookingDetailsForm initialValues={props.args as BookingPrefill} />;
  };

  useCopilotAction({
    name: 'book_room',
    description: 'Shows the interactive room booking form so the user can search availability and submit a reservation request.',
    parameters: [
      { name: 'purpose', type: 'string', required: false, description: 'What the room is being booked for' },
      { name: 'date', type: 'string', required: false, description: 'Requested date (YYYY-MM-DD)' },
      { name: 'startTime', type: 'string', required: false, description: 'Start time, 24h HH:MM' },
      { name: 'endTime', type: 'string', required: false, description: 'End time, 24h HH:MM' },
      { name: 'people', type: 'number', required: false, description: 'Number of attendees' },
      { name: 'building', type: 'string', required: false, description: 'Preferred building name' },
    ],
    handler: async () => 'Displayed the room booking form to the user.',
    render: renderBookingForm,
  });

  // Generic tabular generative UI — used for "this week's events", athletics
  // fixtures, bookings lists, etc. Flowise supplies column headers and row
  // objects keyed by those headers; we just lay it out as a real table.
  const renderGenerativeTable = (props: { args?: Record<string, unknown> }) => {
    const payload = (props.args ?? {}) as TablePayload;
    const columns = Array.isArray(payload.columns) ? payload.columns : [];
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    return renderTableBlock(columns, rows, payload.title);
  };

  // Fallback for any other [ACTION:name]{...} Flowise emits that isn't
  // 'book_room' or 'show_table' — so a tool call the frontend hasn't
  // special-cased yet still renders something instead of silently vanishing
  // (the marker is always stripped out of the visible text either way).
  // Tabular payloads become a table; everything else becomes a key/value card.
  const renderGenerativeCard = (props: { args?: Record<string, unknown> }) => {
    const payload = props.args ?? {};
    const { title, ...rest } = payload as { title?: unknown; [key: string]: unknown };
    const entries = Object.entries(rest);

    if (entries.length === 0) return null;

    return (
      <div style={{ marginTop: '12px', border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden' }}>
        {typeof title === 'string' && (
          <div style={{ padding: '10px 14px', background: 'var(--sidebar-hover)', borderBottom: '1px solid var(--border-color)', fontWeight: 600, fontSize: '13px', color: 'var(--text-main)' }}>
            {title}
          </div>
        )}
        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {entries.map(([key, value]) => (
            <div key={key} style={{ display: 'flex', gap: '8px', fontSize: '13px' }}>
              <span style={{ color: 'var(--brand)', fontWeight: 600, minWidth: '110px' }}>{key}</span>
              <span style={{ color: 'var(--text-main)' }}>
                {Array.isArray(value) ? value.join(', ') : String(value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderGenerativeAction = (props: { args?: Record<string, unknown> }) => {
    const payload = (props.args ?? {}) as TablePayload;
    if (Array.isArray(payload.columns) && Array.isArray(payload.rows)) {
      return renderGenerativeTable(props);
    }
    return renderGenerativeCard(props);
  };

  useCopilotAction({
    name: 'show_table',
    description: 'Shows tabular data (campus events, athletics fixtures, bookings, etc.) as a formatted table instead of plain text.',
    parameters: [
      { name: 'title', type: 'string', required: false, description: 'Table heading' },
      { name: 'columns', type: 'string[]', required: true, description: 'Column headers, in display order' },
      { name: 'rows', type: 'object[]', required: true, description: 'Row objects keyed by column header' },
    ],
    handler: async () => 'Displayed the table to the user.',
    render: renderGenerativeTable,
  });

  // The other form: a calendar invite for a campus event. It shows when Flowise
  // emits [ACTION:calendar_invite]{...}, or whenever the user's request is to put
  // an event on their calendar / send them an invite. Step 1 lets them pick one
  // of the next 10 events (skipped if they already named one); step 2 takes the
  // email to send the invite to.
  const getInviteForm = (msg: Message): { userText: string; eventTitle?: string; cutIndex?: number } | null => {
    if (msg.role !== 'ai' || msg.id === forcedBookingMsgId || msg.action?.name === 'book_room') return null;
    const idx = activeChat.messages.findIndex(m => m.id === msg.id);
    const userText = activeChat.messages.slice(0, idx).reverse().find(m => m.role === 'user')?.content ?? '';
    if (msg.action) {
      if (!isCalendarInviteAction(msg.action.name)) return null;
      const { eventTitle } = msg.action.payload;
      return { userText, eventTitle: typeof eventTitle === 'string' ? eventTitle : undefined };
    }
    if (!isInviteRequest(userText)) return null;
    // Flowise refused a request the form can handle — hide the refusal (cut at 0).
    if (isRefusal(msg.content)) return { userText, cutIndex: 0 };
    return { userText, cutIndex: inviteReplyCutIndex(msg.content) };
  };

  const renderInviteForm = (userText: string, eventTitle?: string) => (
    <CalendarInviteForm
      userText={userText}
      eventTitle={eventTitle}
      isSubmitting={isLoading}
      onSubmit={(events, email) => {
        // Flowise's orchestrator sends invites when it gets this sentence shape —
        // "Send an invite for [event] to [email]" (its Rule 6). A JSON blob isn't in
        // its prompt and gets the out-of-scope reply, unlike the booking form.
        const describe = (e: CampusEvent) =>
          `${e.title} (${e.date}, ${formatEventTime(e)}${e.location ? ` at ${e.location}` : ''})`;
        const textToSend = events.length === 1
          ? `Send an invite for ${describe(events[0])} to ${email}`
          : `Send an invite for each of these events to ${email}:\n${events.map((e, i) => `${i + 1}. ${describe(e)}`).join('\n')}`;

        const heading = 'Here are my details for the calendar invite:';
        const eventLines = events.map(e =>
          `- **${e.title}:** ${formatEventDate(e)}, ${formatEventTime(e)}${e.location ? ` · ${e.location}` : ''}`
        );
        submitMessage(textToSend, `${heading}\n${eventLines.join('\n')}\n- **Email:** ${email}`);
      }}
    />
  );

  useCopilotAction({
    name: 'calendar_invite',
    description: 'Shows the calendar invite form: the user picks one of the next 10 campus events (or the named one) and enters the email to send the invite to.',
    parameters: [
      { name: 'eventTitle', type: 'string', required: false, description: 'Name of the event, if the user already said which one' },
    ],
    handler: async () => 'Displayed the calendar invite form to the user.',
    render: (props: { args?: Record<string, unknown> }) =>
      renderInviteForm('', typeof props.args?.eventTitle === 'string' ? props.args.eventTitle : undefined),
  });

  const isFirstMessage = activeChat.messages.length === 0;

  const lastMsg = activeChat.messages[activeChat.messages.length - 1];
  const isWaitingForForm =
    !!lastMsg && lastMsg.role === 'ai' && !isLoading &&
    (lastMsg.id === forcedBookingMsgId || lastMsg.action?.name === 'book_room' || !!getInviteForm(lastMsg));

  return (
    <section className="chat-workspace">
      <div className="messages-container">
        {isFirstMessage ? (
          
          <div className="empty-state-container">
            <div className="empty-state-inner">
              <div className="empty-state-date">
                <div className="date-dot" /> {dateString}
              </div>

              <h1 className="empty-state-greeting">{greeting}</h1>

              <p className="empty-state-subtitle">
                Three specialists work behind this box, reading live campus schedules, fixtures and room availability.
              </p>

              <div className="welcome-composer">
                <textarea
                  rows={1}
                  wrap="off"
                  placeholder="Ask Newman Assistant…"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <div className="welcome-composer-row">
                  <button
                    className="welcome-send"
                    disabled={!inputText.trim() || isLoading}
                    onClick={handleInputSend}
                    aria-label="Send"
                  >
                    ↑
                  </button>
                </div>
              </div>

              <div className="suggestion-cards-grid">
                <button
                  className="suggestion-card"
                  onClick={() => submitMessage("Find what's on this week and send me the invite.")}
                >
                  <div className="card-icon-wrapper red" aria-hidden="true">◈</div>
                  <div className="card-title">Campus events</div>
                  <div className="card-text">Find what&apos;s on this week and send me the invite.</div>
                </button>

                <button
                  className="suggestion-card"
                  onClick={() => submitMessage("Find the upcoming athletic events?.")}
                >
                  <div className="card-icon-wrapper navy" aria-hidden="true">◎</div>
                  <div className="card-title">Athletics fixtures</div>
                  <div className="card-text">Home games for the Jets, added to my calendar.</div>
                </button>

                <button
                  className="suggestion-card"
                  onClick={() => submitMessage("I need to book a space for a class, club, or study group.", undefined, true)}
                >
                  <div className="card-icon-wrapper green" aria-hidden="true">▤</div>
                  <div className="card-title">Reserve a room</div>
                  <div className="card-text">Book space for a class, club or study group.</div>
                </button>
              </div>
            </div>
          </div>

        ) : (
          <div className="messages-list">
            {activeChat.messages.map((msg, index) => {
              const isCurrentLoading = isLoading && msg.role === 'ai' && index === activeChat.messages.length - 1;

              const isBookingForm = msg.role === 'ai' &&
                (msg.id === forcedBookingMsgId || msg.action?.name === 'book_room');
              // Any other action name Flowise emits (show_table included) renders
              // generatively — book_room keeps its own dedicated path above and is
              // excluded here so the two never double-render.
              // Resolved only once the reply has finished streaming, so the form
              // doesn't flash in and out while Flowise is still typing.
              const inviteForm = isCurrentLoading ? null : getInviteForm(msg);
              const isGenerativeAction = msg.role === 'ai' && !!msg.action && msg.action.name !== 'book_room' && !inviteForm;

              const isLastMessage = index === activeChat.messages.length - 1;

              return (
                <div key={msg.id} className={`message-row ${msg.role}`}>
                  
                  {msg.role === 'ai' && (
                    <div className="ai-avatar">
                      <img src="/newman-chat.png" alt="Newman Assistant" />
                    </div>
                  )}
                  
                  {msg.role === 'user' ? (
                    <div className="user-message-group">
                      {editingMsgId === msg.id ? (
                        <div className="message-edit-box">
                          <textarea
                            autoFocus
                            rows={Math.min(8, Math.max(2, editText.split('\n').length))}
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit(index); }
                              if (e.key === 'Escape') setEditingMsgId(null);
                            }}
                          />
                          <div className="message-edit-actions">
                            <button className="btn-secondary" onClick={() => setEditingMsgId(null)}>Cancel</button>
                            <button className="booking-submit-btn" disabled={!editText.trim() || isLoading} onClick={() => submitEdit(index)}>Send</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="message-bubble user">
                            <div className="formatted-message">{renderFormattedText(msg.content)}</div>
                          </div>
                          <div className="message-actions">
                            <button className="message-action-btn" onClick={() => handleCopy(msg)} aria-label="Copy message" title={copiedMsgId === msg.id ? 'Copied!' : 'Copy'}>
                              {copiedMsgId === msg.id ? (
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                              ) : (
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                              )}
                            </button>
                            <button className="message-action-btn" onClick={() => startEditing(msg)} disabled={isLoading} aria-label="Edit message" title="Edit">
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                  <div className={`message-bubble ${msg.role}`}>
                    
                    {msg.thought && isCurrentLoading && (
                      <div style={{ marginBottom: '16px' }}>
                        <strong style={{ color: 'var(--brand)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                          Did you know?
                        </strong>
                        <div style={{ fontSize: '14px', color: 'var(--text-main)', marginBottom: '4px', lineHeight: '1.4' }}>
                          {loadingFact}
                        </div>
                        <div className="analyzing-text-animated">
                          {msg.thought}
                        </div>
                      </div>
                    )}

                    {msg.content && (
                      <div className="formatted-message">
                        {inviteForm?.cutIndex === 0
                          ? <p style={{ marginBottom: '8px', lineHeight: '1.5' }}>Sure — let&apos;s get that on your calendar.</p>
                          : renderFormattedText(
                              inviteForm?.cutIndex !== undefined ? msg.content.slice(0, inviteForm.cutIndex).trim() : msg.content,
                              isBookingForm,
                            )}
                      </div>
                    )}

                    {isBookingForm && isLastMessage && isCurrentLoading && (
                      <div style={{ marginTop: '12px', padding: '12px', background: 'var(--sidebar-hover)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
                        Preparing the room request form…
                      </div>
                    )}
                    {isBookingForm && isLastMessage && !isCurrentLoading && (
                       renderBookingForm({ args: msg.action?.payload })
                    )}
                    {isBookingForm && !isLastMessage && (
                      <div style={{ marginTop: '12px', padding: '12px', background: 'var(--sidebar-hover)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
                        ✓ Form submitted
                      </div>
                    )}

                    {inviteForm && isLastMessage && renderInviteForm(inviteForm.userText, inviteForm.eventTitle)}
                    {inviteForm && !isLastMessage && activeChat.messages[index + 1]?.content.startsWith('Here are my details') && (
                      <div style={{ marginTop: '12px', padding: '12px', background: 'var(--sidebar-hover)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
                        ✓ Form submitted
                      </div>
                    )}

                    {isGenerativeAction && renderGenerativeAction({ args: msg.action?.payload })}

                  </div>
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {!isFirstMessage && (
        <div className="input-container">
          <div className={`input-box ${isWaitingForForm ? 'disabled' : ''}`}>
            <textarea
              rows={1}
              placeholder={isWaitingForForm ? "Complete the form above to continue…" : "Reply to Newman Assistant…"}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading || isWaitingForForm}
            />
            <div className="composer-row">
              <button
                className="send-btn"
                disabled={!inputText.trim() || isLoading || isWaitingForForm}
                onClick={handleInputSend}
                aria-label="Send"
              >
                ↑
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
import { useState, useRef, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';
import { streamFlowiseChat } from '../flowise';
import type { ChatSession } from '../types';

// --- Fun Facts Database ---
const NEWMAN_FACTS = [
  "Newman University was founded in 1933 by the Adorers of the Blood of Christ.",
  "The university was originally named Sacred Heart Junior College.",
  "Our mascot is Johnny Jet, a nod to Wichita's rich aviation history.",
  "DeMattias Hall is named after St. Maria De Mattias, the founder of the Adorers.",
  "Newman is the only Catholic university in the Diocese of Wichita.",
  "The campus spans 61 beautiful acres right in the heart of Wichita."
];

interface ChatWorkspaceProps {
  activeChat: ChatSession;
  activeChatId: string;
  setChats: React.Dispatch<React.SetStateAction<ChatSession[]>>;
}

export default function ChatWorkspace({ activeChat, activeChatId, setChats }: ChatWorkspaceProps) {
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingFact, setLoadingFact] = useState(NEWMAN_FACTS[0]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat.messages]);

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
      }
    }

    return { thought: thought.trim(), answer: (answer || rawText).trim() };
  };

  const renderFormattedText = (text: string, hideBookingList: boolean = false) => {
    let cleanText = text;
    
    // Aggressive Text Cutter for the AI's raw list
    if (hideBookingList) {
      const splitMatch = text.match(/(I still need|Please reply|1\.|Please send|Please provide|Your details|To book this|For the booking|Please share|I'll need|I will need|Fill out|Fill in|Enter your|Details for|I need a couple details)/i);
      if (splitMatch && splitMatch.index !== undefined) {
        cleanText = text.substring(0, splitMatch.index).trim();
      }
    }

    const lines = cleanText.split('\n');
    return lines.map((line, idx) => {
      let formattedLine: React.ReactNode = line;
      if (line.includes('**')) {
        const parts = line.split('**');
        formattedLine = parts.map((part, pIdx) => 
          pIdx % 2 === 1 ? <strong key={pIdx}>{part}</strong> : part
        );
      }
      if (line.trim().startsWith('-') || line.trim().startsWith('*')) {
        return <li key={idx} style={{ marginLeft: '16px' }}>{formattedLine}</li>;
      }
      return <p key={idx}>{formattedLine || <br />}</p>;
    });
  };

  const submitMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;
    
    setIsLoading(true);
    
    // Pick a brand new random fact every time the user sends a message
    setLoadingFact(NEWMAN_FACTS[Math.floor(Math.random() * NEWMAN_FACTS.length)]);

    const userMsgId = Date.now().toString();
    const aiMsgId = (Date.now() + 1).toString();

    const isFirstMessage = activeChat.messages.length === 0;
    let newTitle = activeChat.title;
    if (isFirstMessage && activeChat.title === 'New Chat') {
      newTitle = textToSend.length > 25 ? textToSend.slice(0, 25) + '...' : textToSend;
    }

    setChats(prev => prev.map(chat => {
      if (chat.id === activeChatId) {
        return {
          ...chat,
          title: newTitle,
          updatedAt: Date.now(),
          messages: [
            ...chat.messages, 
            { id: userMsgId, role: 'user', content: textToSend },
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

  const handleInputSend = () => {
    submitMessage(inputText);
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleInputSend();
    }
  };

  // --- GENERATIVE UI: FULL BOOKING FORM COMPONENT ---
  const BookingDetailsForm = ({ aiMessage }: { aiMessage: string }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [studentId, setStudentId] = useState('');
    const [eventType, setEventType] = useState('');
    const [attendees, setAttendees] = useState('');
    const [description, setDescription] = useState('');
    const [phone, setPhone] = useState('');
    const [time, setTime] = useState('');

    const msgLower = aiMessage.toLowerCase();
    const needsTime = msgLower.includes('exact time') || msgLower.includes('pick one') || msgLower.includes('what time');

    const handleSubmit = () => {
      let finalString = `Here are my details for the booking:
- Name: ${name}
- Email: ${email}
- Student ID: ${studentId}
- Event Type: ${eventType}
- Attendees: ${attendees}
- Description: ${description}`;

      if (phone) finalString += `\n- Phone: ${phone}`;
      if (needsTime && time) finalString += `\n- Confirmed Time: ${time}`;
      
      submitMessage(finalString);
    };

    const isComplete = name.trim() && 
                       email.trim() && 
                       studentId.trim() && 
                       eventType.trim() && 
                       attendees.trim() && 
                       description.trim() && 
                       (!needsTime || time.trim());

    return (
      <div className="booking-form-card">
        <h4 className="booking-form-title">Complete your booking request</h4>
        
        {needsTime && (
          <div className="booking-form-row">
            <label>Confirm Exact Date & Time</label>
            <input 
              type="text" 
              className="booking-input" 
              placeholder="e.g., Sept 2, 10:00 AM - 5:00 PM" 
              value={time} 
              onChange={e => setTime(e.target.value)} 
            />
          </div>
        )}

        <div className="booking-form-row">
          <label>Full Name</label>
          <input type="text" className="booking-input" placeholder="John Doe" value={name} onChange={e => setName(e.target.value)} />
        </div>

        <div className="booking-form-row">
          <label>Newman Email Address</label>
          <input type="email" className="booking-input" placeholder="johndoe@newman.edu" value={email} onChange={e => setEmail(e.target.value)} />
        </div>

        <div className="booking-form-row">
          <label>Student ID</label>
          <input type="text" className="booking-input" placeholder="e.g. 12345678" value={studentId} onChange={e => setStudentId(e.target.value)} />
        </div>

        <div className="booking-form-row">
          <label>Event Type</label>
          <input type="text" className="booking-input" placeholder="e.g., club meeting, workshop, social event" value={eventType} onChange={e => setEventType(e.target.value)} />
        </div>

        <div className="booking-form-row">
          <label>Expected Number of Attendees</label>
          <input type="number" className="booking-input" placeholder="e.g., 15" value={attendees} onChange={e => setAttendees(e.target.value)} />
        </div>

        <div className="booking-form-row">
          <label>Brief Purpose / Description</label>
          <textarea 
            className="booking-input" 
            placeholder="What is this event for?" 
            rows={2}
            style={{ resize: 'vertical' }}
            value={description} 
            onChange={e => setDescription(e.target.value)} 
          />
        </div>

        <div className="booking-form-row">
          <label>Mobile Phone (Optional)</label>
          <input type="tel" className="booking-input" placeholder="(555) 555-5555" value={phone} onChange={e => setPhone(e.target.value)} />
        </div>

        <button 
          className="booking-submit-btn" 
          disabled={!isComplete || isLoading}
          onClick={handleSubmit}
        >
          {isLoading ? "Submitting..." : "Submit Booking Request"}
        </button>
      </div>
    );
  };
  // --------------------------------------------

  return (
    <section className="chat-workspace">
      <div className="messages-container">
        <div className="messages-list">
          {activeChat.messages.map((msg, index) => {
            const isCurrentLoading = isLoading && msg.role === 'ai' && index === activeChat.messages.length - 1;
            
            const contentLower = msg.content.toLowerCase();
            const isBookingForm = msg.role === 'ai' && (
              contentLower.includes('booking request') ||
              contentLower.includes('student id') ||
              contentLower.includes('booking form') ||
              contentLower.includes('details for the booking') ||
              (contentLower.includes('name') && (contentLower.includes('email') || contentLower.includes('id')))
            );
            
            const isLastMessage = index === activeChat.messages.length - 1;

            return (
              <div key={msg.id} className={`message-row ${msg.role}`}>
                
                {msg.role === 'ai' && (
                  <img src="/newman-chat.png" alt="Newman AI" className="ai-avatar" />
                )}
                
                <div className={`message-bubble ${msg.role}`}>
                  
                  {/* THE FIX: Plain text fact with animated gradient analyzing text beneath it */}
                  {msg.thought && isCurrentLoading && (
                    <div style={{ marginBottom: '16px' }}>
                      <strong style={{ 
                        color: '#7c3aed', 
                        fontSize: '11px', 
                        textTransform: 'uppercase', 
                        letterSpacing: '0.05em', 
                        display: 'block', 
                        marginBottom: '6px' 
                      }}>
                        🎓 Did you know?
                      </strong>
                      <div style={{ fontSize: '14px', color: 'var(--text-main)', marginBottom: '4px', lineHeight: '1.4' }}>
                        {loadingFact}
                      </div>
                      
                      {/* Using the new animated CSS class for the "Analyzing..." text */}
                      <div className="analyzing-text-animated">
                        {msg.thought}
                      </div>
                    </div>
                  )}

                  <div className="formatted-message">
                    {renderFormattedText(msg.content, isBookingForm)}
                  </div>

                  {/* GENERATIVE UI INJECTION */}
                  {isBookingForm && isLastMessage && (
                     <BookingDetailsForm aiMessage={msg.content} />
                  )}
                  {isBookingForm && !isLastMessage && (
                    <div style={{ marginTop: '12px', padding: '12px', background: 'var(--sidebar-hover)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
                      ✓ Form submitted
                    </div>
                  )}

                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="input-container">
        <div className="input-box">
          <textarea 
            rows={1}
            placeholder="Message Newman Assistant..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          <button className="send-btn" disabled={!inputText.trim() || isLoading} onClick={handleInputSend}>
            <ArrowUp size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </section>
  );
}
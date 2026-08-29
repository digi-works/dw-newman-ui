import { useState, useRef, useEffect } from 'react';
import { ArrowUp, Calendar, Trophy, MapPin } from 'lucide-react';
import { streamFlowiseChat } from '../flowise';
import type { ChatSession } from '../types';

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

  const now = new Date();
  const dateString = now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
  const hour = now.getHours();
  let greetingTime = "Good evening.";
  if (hour < 12) greetingTime = "Good morning.";
  else if (hour < 17) greetingTime = "Good afternoon.";

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

  // ==========================================
  // ADVANCED MARKDOWN TEXT RENDERER
  // ==========================================
  const renderFormattedText = (text: string, hideBookingList: boolean = false) => {
    let cleanText = text;
    
    if (hideBookingList) {
      const splitMatch = text.match(/(I still need|Please reply|1\.|Please send|Please provide|Your details|To book this|For the booking|Please share|I'll need|I will need|Fill out|Fill in|Enter your|Details for|I need a couple details|Full name|Name:)/i);
      if (splitMatch && splitMatch.index !== undefined) {
        cleanText = text.substring(0, splitMatch.index).trim();
      }
    }

    const lines = cleanText.split('\n');
    const renderedElements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeContent: string[] = [];

    // THE FIX: Changed 'var(--text-main)' to 'inherit' so bold text matches the bubble color
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
        // THE FIX: Changed 'var(--text-main)' to 'inherit' for list items
        renderedElements.push(
          <div key={`li-${i}`} style={{ display: 'flex', gap: '8px', marginBottom: '8px', paddingLeft: '8px' }}>
            <span style={{ color: '#7c3aed', fontSize: '16px', lineHeight: '1.4' }}>•</span>
            <div style={{ flex: 1, lineHeight: '1.5', color: 'inherit' }}>
              {parseInlineFormat(cleanLine)}
            </div>
          </div>
        );
      } else {
        // THE FIX: Changed 'var(--text-main)' to 'inherit' for paragraphs
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
  // ==========================================

  const submitMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;
    
    setIsLoading(true);
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

  const BookingDetailsForm = ({ aiMessage }: { aiMessage: string }) => {
    const [step, setStep] = useState(1);
    
    const [purpose, setPurpose] = useState('');
    const [date, setDate] = useState('');
    const [building, setBuilding] = useState('No preference');
    
    const [availableSlots, setAvailableSlots] = useState<string[]>([]);
    const [isFetchingSlots, setIsFetchingSlots] = useState(false);
    
    const [timeMode, setTimeMode] = useState(''); 
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');

    const [people, setPeople] = useState(12);
    const [needs, setNeeds] = useState<string[]>([]);
    
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [studentId, setStudentId] = useState('');
    const [phone, setPhone] = useState('');

    useEffect(() => {
      if (date) {
        setIsFetchingSlots(true);
        setTimeMode(''); 
        fetch(`/api/availability?date=${encodeURIComponent(date)}&building=${encodeURIComponent(building)}`)
          .then(res => res.json())
          .then(data => {
            if (data && Array.isArray(data.slots)) {
              setAvailableSlots(data.slots);
            } else {
              setAvailableSlots(["09:00 AM - 10:30 AM", "11:00 AM - 12:30 PM", "02:00 PM - 04:00 PM"]);
            }
          })
          .catch((err) => {
            console.error("API Error:", err);
            setAvailableSlots(["09:00 AM - 10:30 AM", "11:00 AM - 12:30 PM", "02:00 PM - 04:00 PM"]);
          })
          .finally(() => {
            setIsFetchingSlots(false);
          });
      } else {
        setAvailableSlots([]);
        setTimeMode('');
      }
    }, [date, building]);

    const toggleNeed = (need: string) => {
      setNeeds(prev => prev.includes(need) ? prev.filter(n => n !== need) : [...prev, need]);
    };

    const handleSubmit = () => {
      const finalTimeSlot = timeMode === 'custom' 
        ? `${customStart} to ${customEnd}` 
        : timeMode;

      const payload = {
        action: "submit_booking_request",
        purpose: purpose.trim(),
        date: date,
        timeSlot: finalTimeSlot,
        attendees: people,
        building: building,
        needs: needs,
        fullName: name.trim(),
        email: email.trim(),
        studentId: studentId.trim(),
        ...(phone && { phoneNumber: phone.trim() })
      };

      const finalString = `Here are my details for the booking:\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
      submitMessage(finalString);
    };

    const isTimeValid = timeMode === 'custom' ? (customStart && customEnd) : timeMode !== '';
    const isStep1Complete = purpose.trim() && date && isTimeValid;
    const isStep2Complete = name.trim() && email.trim() && studentId.trim();

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

              <div className="form-grid-2">
                <div className="booking-form-row">
                  <label>Date</label>
                  <input type="date" className="booking-input" value={date} onChange={e => setDate(e.target.value)} />
                </div>
                <div className="booking-form-row">
                  <label>Time Slot</label>
                  <select 
                    className="booking-input" 
                    value={timeMode} 
                    onChange={e => setTimeMode(e.target.value)}
                    disabled={isFetchingSlots || !date}
                  >
                    <option value="">
                      {isFetchingSlots ? "Checking availability..." : (date ? "Select a time slot" : "Select date first")}
                    </option>
                    {availableSlots.map(slot => (
                      <option key={slot} value={slot}>{slot}</option>
                    ))}
                    <option disabled>──────────</option>
                    <option value="custom">Custom specific time...</option>
                  </select>
                </div>
              </div>

              {timeMode === 'custom' && (
                <div className="form-grid-2" style={{ marginTop: '-8px' }}>
                  <div className="booking-form-row">
                    <label style={{ color: '#7c3aed' }}>Start Time</label>
                    <input type="time" className="booking-input" style={{ borderColor: '#7c3aed' }} value={customStart} onChange={e => setCustomStart(e.target.value)} />
                  </div>
                  <div className="booking-form-row">
                    <label style={{ color: '#7c3aed' }}>End Time</label>
                    <input type="time" className="booking-input" style={{ borderColor: '#7c3aed' }} value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
                  </div>
                </div>
              )}

              <div className="form-grid-2">
                <div className="booking-form-row">
                  <label>How many people?</label>
                  <div className="number-stepper">
                    <span className="stepper-value">{people}</span>
                    <div className="stepper-controls">
                      <button className="stepper-btn" onClick={() => setPeople(p => Math.max(1, p - 1))}>-</button>
                      <button className="stepper-btn" onClick={() => setPeople(p => p + 1)}>+</button>
                    </div>
                  </div>
                </div>
                <div className="booking-form-row">
                  <label>Preferred building</label>
                  <select className="booking-input" value={building} onChange={e => setBuilding(e.target.value)}>
                    <option value="No preference">No preference</option>
                    <option value="DeMattias Hall">DeMattias Hall</option>
                    <option value="Dugan Library">Dugan Library</option>
                    <option value="Eck Hall">Eck Hall</option>
                    <option value="Sacred Heart Hall">Sacred Heart Hall</option>
                    <option value="Bishop Gerber Science Center">Bishop Gerber Science Center</option>
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
                <button className="booking-submit-btn" disabled={!isStep1Complete} onClick={() => setStep(2)}>
                  Continue to Step 2
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="booking-form-row">
                <label>Full Name</label>
                <input type="text" className="booking-input" placeholder="John Doe" value={name} onChange={e => setName(e.target.value)} />
              </div>
              
              <div className="booking-form-row">
                <label>Newman Email Address</label>
                <input type="email" className="booking-input" placeholder="johndoe@newman.edu" value={email} onChange={e => setEmail(e.target.value)} />
              </div>

              <div className="form-grid-2">
                <div className="booking-form-row">
                  <label>Student ID</label>
                  <input type="text" className="booking-input" placeholder="e.g. 12345678" value={studentId} onChange={e => setStudentId(e.target.value)} />
                </div>
                <div className="booking-form-row">
                  <label>Mobile Phone (Optional)</label>
                  <input type="tel" className="booking-input" placeholder="(555) 555-5555" value={phone} onChange={e => setPhone(e.target.value)} />
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

  const isFirstMessage = activeChat.messages.length === 0;

  let isWaitingForForm = false;
  const lastMsg = activeChat.messages[activeChat.messages.length - 1];
  if (lastMsg && lastMsg.role === 'ai') {
    const contentLower = lastMsg.content.toLowerCase();
    const hasStudentId = contentLower.includes('student id');
    const hasEmail = contentLower.includes('email');
    const hasFullName = contentLower.includes('full name') || contentLower.includes('your name') || contentLower.includes('name:');
    
    const isRequesting = contentLower.includes('need') || contentLower.includes('provide') || contentLower.includes('fill') || contentLower.includes('complete') || contentLower.includes('details');
    const isConfirmation = contentLower.includes('successfully') || contentLower.includes('confirmed') || contentLower.includes('booked');
    
    const prevMsg = activeChat.messages.length > 1 ? activeChat.messages[activeChat.messages.length - 2] : null;
    const justSubmittedForm = prevMsg?.role === 'user' && prevMsg.content.includes('```json');
    
    isWaitingForForm = hasStudentId && (hasEmail || hasFullName) && isRequesting && !isConfirmation && !justSubmittedForm;
  }

  return (
    <section className="chat-workspace">
      <div className="messages-container">
        {isFirstMessage ? (
          
          <div className="empty-state-container">
            <div className="empty-state-date">
              <div className="date-dot" /> {dateString}
            </div>
            
            <h1 className="empty-state-greeting">{greetingTime}</h1>
            
            <p className="empty-state-subtitle">
              Three specialists work behind this box, reading live campus schedules, fixtures and room availability.
            </p>

            <div className="suggestion-cards-grid">
              <button 
                className="suggestion-card" 
                onClick={() => submitMessage("Find what's on this week and send me the invite.")}
              >
                <div className="card-icon-wrapper" style={{ background: 'transparent', color: '#7c3aed', justifyContent: 'flex-start' }}>
                  <Calendar size={22} strokeWidth={2}/>
                </div>
                <div className="card-title">Campus events</div>
                <div className="card-text">Find what's on this week and send me the invite.</div>
              </button>

              <button 
                className="suggestion-card" 
                onClick={() => submitMessage("Are there any home games for the Jets? Add them to my calendar.")}
              >
                <div className="card-icon-wrapper" style={{ background: 'transparent', color: '#7c3aed', justifyContent: 'flex-start' }}>
                  <Trophy size={22} strokeWidth={2}/>
                </div>
                <div className="card-title">Athletics fixtures</div>
                <div className="card-text">Home games for the Jets, added to my calendar.</div>
              </button>

              <button 
                className="suggestion-card" 
                onClick={() => submitMessage("I need to book a space for a class, club, or study group.")}
              >
                <div className="card-icon-wrapper" style={{ background: 'transparent', color: '#7c3aed', justifyContent: 'flex-start' }}>
                  <MapPin size={22} strokeWidth={2}/>
                </div>
                <div className="card-title">Reserve a room</div>
                <div className="card-text">Book space for a class, club or study group.</div>
              </button>
            </div>
          </div>

        ) : (
          <div className="messages-list">
            {activeChat.messages.map((msg, index) => {
              const isCurrentLoading = isLoading && msg.role === 'ai' && index === activeChat.messages.length - 1;
              
              const contentLower = msg.content.toLowerCase();
              const hasStudentId = contentLower.includes('student id');
              const hasEmail = contentLower.includes('email');
              const hasFullName = contentLower.includes('full name') || contentLower.includes('your name') || contentLower.includes('name:');
              
              const isRequesting = contentLower.includes('need') || 
                                   contentLower.includes('provide') || 
                                   contentLower.includes('fill') || 
                                   contentLower.includes('complete') ||
                                   contentLower.includes('details');
                                   
              const isConfirmation = contentLower.includes('successfully') || 
                                     contentLower.includes('confirmed') || 
                                     contentLower.includes('booked');
                                     
              const prevMsg = index > 0 ? activeChat.messages[index - 1] : null;
              const justSubmittedForm = prevMsg?.role === 'user' && prevMsg.content.includes('```json');
              
              const isBookingForm = msg.role === 'ai' && 
                                    hasStudentId && 
                                    (hasEmail || hasFullName) && 
                                    isRequesting && 
                                    !isConfirmation && 
                                    !justSubmittedForm;
              
              const isLastMessage = index === activeChat.messages.length - 1;

              return (
                <div key={msg.id} className={`message-row ${msg.role}`}>
                  
                  {msg.role === 'ai' && (
                    <img src="/newman-chat.png" alt="Newman AI" className="ai-avatar" />
                  )}
                  
                  <div className={`message-bubble ${msg.role}`}>
                    
                    {msg.thought && isCurrentLoading && (
                      <div style={{ marginBottom: '16px' }}>
                        <strong style={{ color: '#7c3aed', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                          🎓 Did you know?
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
                        {renderFormattedText(msg.content, isBookingForm)}
                      </div>
                    )}

                    {isBookingForm && isLastMessage && (
                       <BookingDetailsForm aiMessage="{msg.content}"/>
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
        )}
      </div>

      <div className="input-container">
        <div className={`input-box ${isWaitingForForm ? 'disabled' : ''}`}>
          <textarea 
            rows={1}
            placeholder={isWaitingForForm ? "Complete the form above to continue..." : "Ask Newman Assistant anything..."}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading || isWaitingForForm}
          />
          <button className="send-btn" disabled={!inputText.trim() || isLoading || isWaitingForForm} onClick={handleInputSend}>
            <ArrowUp size="{18}" strokeWidth="{2.5}"/>
          </button>
        </div>
      </div>
    </section>
  );
}
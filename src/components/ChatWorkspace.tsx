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
    
    if (hideBookingList) {
      const splitMatch = text.match(/(I still need|Please reply|1\.|Please send|Please provide|Your details|To book this|For the booking|Please share|I'll need|I will need|Fill out|Fill in|Enter your|Details for|I need a couple details|Full name|Name:)/i);
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
        const cleanLine = line.trim().substring(1).trim();
        return <li key={idx} style={{ marginLeft: '16px', marginBottom: '4px' }}>{cleanLine}</li>;
      }
      return <p key={idx}>{formattedLine || <br />}</p>;
    });
  };

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

  // --- GENERATIVE UI: FULL BOOKING FORM COMPONENT ---
  const BookingDetailsForm = ({ aiMessage }: { aiMessage: string }) => {
    const [room, setRoom] = useState('');
    const [date, setDate] = useState('');
    const [timeSlot, setTimeSlot] = useState('');
    
    // State for dynamic slot fetching
    const [availableSlots, setAvailableSlots] = useState<string[]>([]);
    const [isFetchingSlots, setIsFetchingSlots] = useState(false);

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [studentId, setStudentId] = useState('');
    const [eventType, setEventType] = useState('');
    const [attendees, setAttendees] = useState('');
    const [description, setDescription] = useState('');
    const [phone, setPhone] = useState('');

    // Fetch available slots whenever the Room AND Date change
    useEffect(() => {
      const fetchSlots = async () => {
        if (room.trim() && date) {
          setIsFetchingSlots(true);
          setTimeSlot(''); // Reset selected time
          
          try {
            // TODO: Connect this to your real NeonDB API endpoint
            // const response = await fetch(`/api/rooms/availability?room=${encodeURIComponent(room)}&date=${encodeURIComponent(date)}`);
            // const data = await response.json();
            // setAvailableSlots(data.slots);

            // SIMULATED DB DELAY FOR NOW:
            await new Promise(resolve => setTimeout(resolve, 800));
            setAvailableSlots([
              "09:00 AM - 10:30 AM",
              "11:00 AM - 12:30 PM",
              "02:00 PM - 04:00 PM",
              "04:30 PM - 06:00 PM"
            ]);
          } catch (error) {
            console.error("Failed to fetch slots", error);
            setAvailableSlots([]);
          } finally {
            setIsFetchingSlots(false);
          }
        } else {
          setAvailableSlots([]);
          setTimeSlot('');
        }
      };

      fetchSlots();
    }, [room, date]);

    const handleSubmit = () => {
      const payload = {
        action: "submit_booking_request",
        room: room.trim(),
        date: date,
        timeSlot: timeSlot,
        fullName: name.trim(),
        email: email.trim(),
        studentId: studentId.trim(),
        eventType: eventType.trim(),
        attendees: parseInt(attendees, 10) || 0,
        description: description.trim(),
        ...(phone && { phoneNumber: phone.trim() })
      };

      const finalString = `Here are my details for the booking:\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
      submitMessage(finalString);
    };

    const isComplete = room.trim() &&
                       date.trim() &&
                       timeSlot.trim() &&
                       name.trim() && 
                       email.trim() && 
                       studentId.trim() && 
                       eventType.trim() && 
                       attendees.trim() && 
                       description.trim();

    return (
      <div className="booking-form-card">
        <h4 className="booking-form-title">Complete your booking request</h4>
        
        <div className="booking-form-row">
          <label>Target Room</label>
          <input type="text" className="booking-input" placeholder="e.g., Alumni Board Room" value={room} onChange={e => setRoom(e.target.value)} />
        </div>

        <div className="booking-form-row">
          <label>Date</label>
          <input type="date" className="booking-input" value={date} onChange={e => setDate(e.target.value)} />
        </div>

        <div className="booking-form-row">
          <label>Available Time Slots</label>
          <select 
            className="booking-input" 
            value={timeSlot} 
            onChange={e => setTimeSlot(e.target.value)}
            disabled={isFetchingSlots || availableSlots.length === 0}
            style={{ appearance: 'auto' }} // Ensures dropdown arrow is visible
          >
            <option value="">
              {isFetchingSlots ? "Checking availability..." : (availableSlots.length > 0 ? "Select a time slot" : "Select room & date first")}
            </option>
            {availableSlots.map(slot => (
              <option key={slot} value={slot}>{slot}</option>
            ))}
          </select>
        </div>

        <div className="booking-form-row" style={{ marginTop: '8px' }}>
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
          <input type="text" className="booking-input" placeholder="e.g., club meeting, workshop" value={eventType} onChange={e => setEventType(e.target.value)} />
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
            
            // STRICT PERSONAL DATA TRIGGER
            const contentLower = msg.content.toLowerCase();
            
            const hasStudentId = contentLower.includes('student id');
            const hasEmail = contentLower.includes('email');
            const hasFullName = contentLower.includes('full name') || contentLower.includes('your name');
            
            // Trigger the form only if AI requests Student ID + (Email or Name)
            const isBookingForm = msg.role === 'ai' && hasStudentId && (hasEmail || hasFullName);
            
            const isLastMessage = index === activeChat.messages.length - 1;

            return (
              <div key={msg.id} className={`message-row ${msg.role}`}>
                
                {msg.role === 'ai' && (
                  <img src="/newman-chat.png" alt="Newman AI" className="ai-avatar" />
                )}
                
                <div className={`message-bubble ${msg.role}`}>
                  
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
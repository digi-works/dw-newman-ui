import { useEffect, useState } from 'react';
import { correctKeywordTypos } from '@/lib/fuzzy';

// ==========================================
// GENERATIVE UI — CALENDAR INVITE FORM
// ==========================================
// Two-step form, like the room booking form:
//   Step 1 — pick ONE of the next 10 campus events from a table.
//   Step 2 — enter the email the calendar invite should be sent to.
// If the user already named the event ("add Mission Orientation to my
// calendar"), step 1 is skipped and only the email step is shown.

// Standard email shape (local@domain.tld); rejects missing parts and any whitespace.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CampusEvent = {
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  location: string | null;
};

const INVITE_ACTIONS = ['calendar_invite', 'send_invite', 'add_to_calendar'];

export function isCalendarInviteAction(name: string): boolean {
  return INVITE_ACTIONS.includes(name);
}

// The user is asking for an event to be put on their calendar / sent as an invite.
const INVITE_REQUEST = /\binvite\b|\b(add|put|save|schedule|block)\b[^.?!]*\bcalendar\b|\bcalendar (invite|event|reminder)\b/i;

export function isInviteRequest(userText: string): boolean {
  // The form's own submission ("Here are my details for the calendar invite")
  // mentions an invite too — it must not reopen the form.
  // Typos are forgiven: "send me a calnder inviute" counts.
  return INVITE_REQUEST.test(correctKeywordTypos(userText)) && !userText.startsWith('Here are my details');
}

// Flowise sometimes turns down a request it didn't understand ("I can only help
// with Newman University campus events...") even though the form handles it.
const REFUSAL = /\bi can only help\b|\bi can(no|')t help\b|\bi(?:'m| am) not able to help\b|\boutside (of )?(what|my)\b/i;

export function isRefusal(reply: string): boolean {
  return REFUSAL.test(reply);
}

const LIST_ITEM = /^\s*(?:\d+[.)]|[-*•])\s+/m;
const ASKS_FOR_INPUT = /(\?|i (just |still |only )?need\b|please (reply|provide|share|send|tell|confirm)|reply with|let me know)/i;

/**
 * Where Flowise's reply starts listing events or asking for details — the form
 * replaces that part, so the caller hides it. Keeps the lead-in line; returns
 * undefined when cutting would leave nothing to show.
 */
export function inviteReplyCutIndex(reply: string): number | undefined {
  const hasLeadIn = (i: number) => reply.slice(0, i).trim() !== '';
  const candidates: number[] = [];

  const listLine = LIST_ITEM.exec(reply);
  if (listLine && hasLeadIn(listLine.index)) candidates.push(listLine.index);
  const table = reply.search(/^\s*\|/m);
  if (table > 0 && hasLeadIn(table)) candidates.push(table);

  const sentence = /[^.?!\n]+[.?!:]*/g;
  let match: RegExpExecArray | null;
  while ((match = sentence.exec(reply)) !== null) {
    if (ASKS_FOR_INPUT.test(match[0]) || /e-?mail/i.test(match[0])) {
      if (hasLeadIn(match.index)) candidates.push(match.index);
      break;
    }
  }
  return candidates.length > 0 ? Math.min(...candidates) : undefined;
}

function formatDate(date: string): string {
  // Parse as a local date — `new Date('2026-09-28')` would be UTC midnight and
  // can show the previous day.
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function formatEventTime(e: CampusEvent): string {
  if (e.allDay || !e.startTime) return 'All day';
  return e.endTime ? `${formatTime(e.startTime)} – ${formatTime(e.endTime)}` : formatTime(e.startTime);
}

export function formatEventDate(e: CampusEvent): string {
  return formatDate(e.date);
}

const cellStyle: React.CSSProperties = { padding: '10px 12px', color: 'var(--text-main)', verticalAlign: 'middle' };
const headStyle: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', color: 'var(--brand)', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' };

export function CalendarInviteForm({
  userText,
  eventTitle,
  isSubmitting,
  onSubmit,
}: {
  // The user's request — used to tell whether they already named an event.
  userText: string;
  // Event named by Flowise's [ACTION:calendar_invite]{"eventTitle": ...}, if any.
  eventTitle?: string;
  isSubmitting?: boolean;
  onSubmit: (event: CampusEvent, email: string) => void;
}) {
  const [events, setEvents] = useState<CampusEvent[]>([]);
  const [namedEvent, setNamedEvent] = useState<CampusEvent | null>(null);
  const [isFetching, setIsFetching] = useState(true);
  const [fetchError, setFetchError] = useState('');

  const [step, setStep] = useState(1);
  const [selectedId, setSelectedId] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    const params = new URLSearchParams({ match: [eventTitle, userText].filter(Boolean).join(' ') });
    fetch(`/api/events/upcoming?${params.toString()}`)
      .then(res => {
        if (!res.ok) throw new Error('API request failed');
        return res.json();
      })
      .then(data => {
        setEvents(data.events ?? []);
        if (data.match) {
          setNamedEvent(data.match);
          setStep(2);
        }
      })
      .catch(err => {
        console.error('Failed to fetch upcoming events:', err);
        setFetchError('⚠ Unable to fetch upcoming events from the database.');
      })
      .finally(() => setIsFetching(false));
  }, [eventTitle, userText]);

  const selectedEvent = namedEvent ?? events.find(e => e.id === selectedId) ?? null;

  // Validated against the raw value on purpose — spaces must fail, not get trimmed away.
  const isEmailValid = email === '' || EMAIL_REGEX.test(email);

  return (
    <div className="booking-form-card">
      <div className="form-header">
        <h4>Calendar invite</h4>
        {!isFetching && !namedEvent && <span>Step {step} of 2</span>}
      </div>

      <div className="form-body">
        {isFetching ? (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading upcoming events…</div>
        ) : step === 1 ? (
          <>
            <div className="booking-form-row">
              <label>Which event would you like to add to your calendar?</label>
              {fetchError || events.length === 0 ? (
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--brand)', background: 'var(--brand-tint)', padding: '8px 12px', borderRadius: '6px' }}>
                  {fetchError || 'ℹ No upcoming events found.'}
                </div>
              ) : (
                <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr>
                        <th style={{ ...headStyle, width: '40px' }} aria-label="Select" />
                        <th style={{ ...headStyle, width: '52px' }}>S.No.</th>
                        <th style={headStyle}>Event</th>
                        <th style={headStyle}>Date</th>
                        <th style={headStyle}>Time</th>
                        <th style={headStyle}>Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((e, i) => {
                        const isSelected = e.id === selectedId;
                        // Only one event at a time: picking a row replaces the previous
                        // pick, and picking the selected row again clears it.
                        const toggle = () => setSelectedId(isSelected ? '' : e.id);
                        return (
                          <tr
                            key={e.id}
                            onClick={toggle}
                            style={{
                              borderTop: i > 0 ? '1px solid var(--border-color)' : undefined,
                              background: isSelected ? 'var(--brand-tint)' : undefined,
                              cursor: 'pointer',
                            }}
                          >
                            <td style={cellStyle}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={toggle}
                                onClick={ev => ev.stopPropagation()}
                                aria-label={`Select ${e.title}`}
                                style={{ accentColor: 'var(--brand)', cursor: 'pointer' }}
                              />
                            </td>
                            <td style={{ ...cellStyle, color: 'var(--text-muted)' }}>{i + 1}</td>
                            <td style={{ ...cellStyle, fontWeight: 500 }}>{e.title}</td>
                            <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>{formatDate(e.date)}</td>
                            <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>{formatEventTime(e)}</td>
                            <td style={cellStyle}>{e.location ?? '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="step-actions">
              <button className="booking-submit-btn" disabled={!selectedEvent} onClick={() => setStep(2)}>
                Next
              </button>
            </div>
          </>
        ) : (
          <>
            {selectedEvent && (
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--green)', background: 'var(--green-tint)', padding: '8px 12px', borderRadius: '6px' }}>
                ✓ {selectedEvent.title} · {formatDate(selectedEvent.date)} · {formatEventTime(selectedEvent)}
                {selectedEvent.location && ` · ${selectedEvent.location}`}
              </div>
            )}

            <div className="booking-form-row">
              <label>Your email</label>
              <input
                type="email"
                className="booking-input"
                placeholder="johndoe@newman.edu"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{ borderColor: !isEmailValid ? 'var(--red, #dc2626)' : undefined }}
              />
              {!isEmailValid && (
                <span style={{ fontSize: '12px', color: 'var(--red, #dc2626)', marginTop: '4px', display: 'block' }}>
                  Enter a valid email address (no spaces, e.g. johndoe@newman.edu)
                </span>
              )}
            </div>

            <div className="step-actions">
              {!namedEvent && <button className="btn-secondary" onClick={() => setStep(1)}>Back</button>}
              <button
                className="booking-submit-btn"
                disabled={!selectedEvent || !email || !isEmailValid || isSubmitting}
                onClick={() => selectedEvent && onSubmit(selectedEvent, email)}
              >
                {isSubmitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

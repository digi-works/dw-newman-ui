"use client";

import { useState, useEffect } from 'react';
import { Maximize2, Minimize2, X } from 'lucide-react';

interface BookingsWorkspaceProps {
  onBookRoom: () => void;
  onCloseDrawer?: () => void;
}

type FilterType = 'all' | 'upcoming' | 'confirmed' | 'pending' | 'rejected' | 'awaiting';

const VIEW_META: Record<FilterType, [string, string]> = {
  pending: ['Awaiting approval', 'Requests routed to the Facilities Office for a decision.'],
  awaiting: ['Awaiting approval', 'Requests routed to the Facilities Office for a decision.'],
  all: ['All bookings', 'Every room request across campus this term.'],
  upcoming: ['Upcoming', 'Bookings scheduled from today onward.'],
  confirmed: ['Confirmed', 'Approved bookings with calendar invites sent.'],
  rejected: ['Declined', 'Requests turned down, with the reason recorded.'],
};

interface Booking {
  id: string;
  room_id: string;
  booked_by_user_id?: string;
  title?: string;
  description?: string;
  start_date_local?: string | Date;
  end_date_local?: string | Date;
  start_time_local?: string;
  end_time_local?: string;
  timezone?: string;
  all_day?: boolean;
  status?: string;
  attendee_count?: number;
  purpose?: string;
  approval_date?: string | Date;
  approved_by?: string;
  created_at?: string | Date;
  updated_at?: string | Date;
  booked_by_name?: string;

  // Joined fields
  room_name?: string;
  building?: string;
  room_capacity?: number;
  room_features?: string | string[];
  booked_by_email?: string;
  phone_number?: string;
  student_id?: string;
  role?: string;
  needs?: string | string[];
}

export default function BookingsWorkspace({ onBookRoom, onCloseDrawer }: BookingsWorkspaceProps) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  
  // Widget states
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  
  const [confirmDialog, setConfirmDialog] = useState<{
    id: string;
    type: 'confirmed' | 'rejected';
    roomName: string;
  } | null>(null);

  // Decision panel states
  const [decisionNote, setDecisionNote] = useState('');
  const [notifyRequester, setNotifyRequester] = useState(true);

  const pickFilter = (next: FilterType) => {
    setFilter(next);
    setSelectedBooking(null);
    onCloseDrawer?.();
  };

  const fetchBookings = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings");
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to load bookings");
      setBookings(payload as Booking[]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const executeAction = async (type: 'confirmed' | 'rejected', overrideId?: string) => {
    const targetId = overrideId || confirmDialog?.id;
    if (!targetId) return;

    const targetBooking = bookings.find(b => b.id === targetId);

    setBookings(prev => prev.map(b => b.id === targetId ? { ...b, status: type } : b));

    if (confirmDialog) setConfirmDialog(null);
    if (selectedBooking?.id === targetId) setSelectedBooking(null);
    setDecisionNote('');

    try {
      const bookingDateStr = targetBooking?.start_date_local instanceof Date
        ? targetBooking.start_date_local.toISOString().split('T')[0]
        : String(targetBooking?.start_date_local || '').split('T')[0];

      const params = new URLSearchParams({
        status: type,
        booking_id: targetId,
        room_id: targetBooking?.room_id || '',
        room_name: targetBooking?.room_name || '',
        booking_date: bookingDateStr,
        start_time: targetBooking?.start_time_local || '',
        end_time: targetBooking?.end_time_local || '',
        booked_by_name: targetBooking?.booked_by_name || '',
        booked_by_email: targetBooking?.booked_by_user_id || '',
        booked_by_phone: targetBooking?.phone_number || '',
        expected_attendees: (targetBooking?.attendee_count ?? '').toString(),
        purpose: targetBooking?.purpose || targetBooking?.title || '',
        student_id: targetBooking?.student_id || '',
        notify: notifyRequester.toString(),
        note: decisionNote
      });

      const res = await fetch(`https://ap.digiworks.ai/api/v1/webhooks/9nCrG8NXMFE5jpiEuuVdE?${params.toString()}`, {
        method: 'GET'
      });

      if (!res.ok) {
        console.error("Failed to update status via Digiworks webhook");
      }
    } catch (error) {
      console.error("Error calling Digiworks webhook:", error);
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];

  const stats = {
    all: bookings.length,
    awaiting: bookings.filter(b => ['pending', 'tentative'].includes((b.status || '').toLowerCase())).length,
    upcoming: bookings.filter(b => {
      const dateStr = b.start_date_local instanceof Date ? b.start_date_local.toISOString().split('T')[0] : String(b.start_date_local || '');
      return dateStr >= todayStr;
    }).length,
    confirmed: bookings.filter(b => ['confirmed', 'accepted', 'approved'].includes((b.status || '').toLowerCase())).length,
    pending: bookings.filter(b => ['pending', 'tentative'].includes((b.status || '').toLowerCase())).length,
    rejected: bookings.filter(b => ['rejected', 'declined'].includes((b.status || '').toLowerCase())).length,
  };

  const filteredBookings = bookings.filter(booking => {
    const safeStatus = (booking.status || 'pending').toLowerCase();
    const dateStr = booking.start_date_local instanceof Date ? booking.start_date_local.toISOString().split('T')[0] : String(booking.start_date_local || '');

    if (filter === 'awaiting') return safeStatus === 'pending' || safeStatus === 'tentative';
    if (filter === 'upcoming') return dateStr >= todayStr;
    if (filter === 'confirmed') return safeStatus === 'confirmed' || safeStatus === 'accepted' || safeStatus === 'approved';
    if (filter === 'pending') return safeStatus === 'pending' || safeStatus === 'tentative';
    if (filter === 'rejected') return safeStatus === 'rejected' || safeStatus === 'declined';
    return true; 
  });

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '--:--';
    try {
      const [hours, minutes] = timeStr.split(':');
      const h = parseInt(hours, 10);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const formattedHours = h % 12 || 12;
      return `${formattedHours}:${minutes} ${ampm}`;
    } catch { return String(timeStr); }
  };

  const formatDate = (dateInput?: string | Date, withYear = true) => {
    if (!dateInput) return 'No Date';
    try {
      const date = new Date(String(dateInput));
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withYear && { year: 'numeric' }) });
    } catch { return String(dateInput); }
  };

  const formatNeeds = (needs: any, fallbackStr?: string) => {
    const target = needs || fallbackStr;
    if (!target) return [];
    if (Array.isArray(target)) return target;
    if (typeof target === 'string') {
      try {
        const parsed = JSON.parse(target);
        return Array.isArray(parsed) ? parsed : [target];
      } catch {
        return target.split(',').map((n: string) => n.trim()).filter((n: string) => n.length > 0);
      }
    }
    return [];
  };

  return (
    <section className="bookings-workspace">
      {/* Sidebar Navigation */}
      <aside className="bookings-sidebar">
        <h3 className="bookings-sidebar-title">Queues</h3>
        <button className={`bookings-nav-item ${filter === 'pending' ? 'active' : ''}`} onClick={() => pickFilter('pending')}>
          <div className="bookings-nav-left"><span>Awaiting approval</span></div>
          <span className="bookings-badge">{stats.pending}</span>
        </button>
        <button className={`bookings-nav-item ${filter === 'all' ? 'active' : ''}`} onClick={() => pickFilter('all')}>
          <div className="bookings-nav-left"><span>All bookings</span></div>
          <span className="bookings-badge">{stats.all}</span>
        </button>
        <button className={`bookings-nav-item ${filter === 'upcoming' ? 'active' : ''}`} onClick={() => pickFilter('upcoming')}>
          <div className="bookings-nav-left"><span>Upcoming</span></div>
          <span className="bookings-badge">{stats.upcoming}</span>
        </button>
        <button className={`bookings-nav-item ${filter === 'confirmed' ? 'active' : ''}`} onClick={() => pickFilter('confirmed')}>
          <div className="bookings-nav-left"><span>Confirmed</span></div>
          <span className="bookings-badge">{stats.confirmed}</span>
        </button>
        <button className={`bookings-nav-item ${filter === 'rejected' ? 'active' : ''}`} onClick={() => pickFilter('rejected')}>
          <div className="bookings-nav-left"><span>Declined</span></div>
          <span className="bookings-badge">{stats.rejected}</span>
        </button>
      </aside>

      {/* Main Content Area */}
      <div className="bookings-main">
        <div className="dashboard-header">
          <div>
            <h1 className="dashboard-title">{VIEW_META[filter][0]}</h1>
            <p className="bookings-subtitle">{VIEW_META[filter][1]}</p>
          </div>
          <div className="bookings-tools">
            <button
              type="button"
              onClick={fetchBookings}
              className="bookings-tool"
              title="Refresh data"
              disabled={isLoading}
              style={{ padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', border: '1px solid var(--border-color)', background: 'transparent' }}
            >
              {isLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="table-container">
          <div className="table-header-row">
            <h3>Booking Details</h3>
          </div>

          {error ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#960f18' }}>
              <p>Error loading database. Check your NeonDB string.</p>
              <p style={{ fontSize: '12px', marginTop: '8px' }}>{error}</p>
            </div>
          ) : isLoading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading bookings...
            </div>
          ) : filteredBookings.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No bookings found for this view.
            </div>
          ) : (
            <table className="bookings-table admin-table">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Requested By</th>
                  <th>Date & Time</th>
                  <th>Purpose</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredBookings.map((booking) => {
                  const safeStatus = (booking.status || 'pending').toLowerCase();
                  let displayStatus = 'Tentative';
                  if (['confirmed', 'accepted', 'approved'].includes(safeStatus)) displayStatus = 'Confirmed';
                  else if (['rejected', 'declined'].includes(safeStatus)) displayStatus = 'Declined';

                  return (
                    <tr 
                      key={booking.id} 
                      onClick={() => setSelectedBooking(booking)} 
                      style={{ cursor: 'pointer', background: selectedBooking?.id === booking.id ? 'var(--sidebar-hover)' : '' }}
                    >
                      <td>
                        <div className="room-cell">
                          <span>{booking.room_name || booking.room_id || 'Unknown Room'}</span>
                        </div>
                      </td>
                      <td>
                        <strong style={{ display: 'block', fontSize: '14px', color: 'var(--text-main)' }}>{booking.booked_by_name || 'System User'}</strong>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{booking.role || 'Student / Faculty'}</span>
                      </td>
                      <td>
                        <strong style={{ display: 'block', fontSize: '14px', color: 'var(--text-main)' }}>{formatDate(booking.start_date_local)}</strong>
                        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                          {formatTime(booking.start_time_local)} - {formatTime(booking.end_time_local)}
                        </span>
                      </td>
                      <td>{booking.purpose || booking.title || 'No purpose provided'}</td>
                      <td>
                        {(filter === 'awaiting' || filter === 'pending') && ['pending', 'tentative'].includes(safeStatus) ? (
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <button 
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                setConfirmDialog({ id: booking.id, type: 'rejected', roomName: booking.room_name || booking.room_id || 'Unknown Room' }); 
                              }}
                              style={{ padding: '6px 14px', fontSize: '13px', background: '#ffffff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
                            >
                              Decline
                            </button>
                            <button 
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                setConfirmDialog({ id: booking.id, type: 'confirmed', roomName: booking.room_name || booking.room_id || 'Unknown Room' }); 
                              }}
                              style={{ padding: '6px 14px', fontSize: '13px', background: '#111827', color: '#ffffff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
                            >
                              Approve
                            </button>
                          </div>
                        ) : (
                          <div className={`status-badge status-${displayStatus.toLowerCase()}`}>
                            {displayStatus}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* PICTURE-IN-PICTURE / FULLSCREEN RICH WIDGET */}
      {selectedBooking && (
        <div className={`email-widget ${isFullScreen ? 'fullscreen' : 'pip'}`}>
          <div className="email-widget-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px', borderBottom: '1px solid var(--border-color)', background: 'var(--navbar-bg)', position: 'sticky', top: 0, zIndex: 10 }}>
            
            {/* THE FIX: Added flex: 1 and minWidth: 0 so this container shrinks and text truncates properly */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0, paddingRight: '16px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedBooking.id}
              </span>
              <h3 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text-main)', margin: '2px 0', fontFamily: 'serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedBooking.room_name || selectedBooking.room_id}
              </h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Submitted {formatDate(selectedBooking.created_at || new Date())}
              </span>
              {selectedBooking.updated_at && selectedBooking.created_at && String(selectedBooking.updated_at) !== String(selectedBooking.created_at) && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Updated {formatDate(selectedBooking.updated_at)}
                </span>
              )}
            </div>
            
            {/* THE FIX: Added flexShrink: 0 so the buttons and badge NEVER get pushed off-screen */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ background: '#fef3c7', color: '#92400e', fontSize: '12px', fontWeight: 600, padding: '2px 10px', borderRadius: '12px', whiteSpace: 'nowrap' }}>
                {selectedBooking.status === 'pending' || !selectedBooking.status ? 'Awaiting approval' : selectedBooking.status}
              </span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button onClick={() => setIsFullScreen(!isFullScreen)} className="widget-icon-btn" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
                  {isFullScreen ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}
                </button>
                <button onClick={() => setSelectedBooking(null)} className="widget-icon-btn" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
                  <X size={16}/>
                </button>
              </div>
            </div>

          </div>

          <div className="email-widget-body" style={{ padding: '16px', overflowY: 'auto', background: 'var(--bg-page)' }}>
            
            {/* REQUESTER CARD */}
            <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', marginBottom: '16px', background: 'var(--bg-page)' }}>
              <h4 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', margin: '0 0 16px 0', textTransform: 'uppercase' }}>Requester</h4>
              <DataRow label="Name" value={selectedBooking.booked_by_name || 'System User'} />
              <DataRow label="Email" value={selectedBooking.booked_by_user_id || selectedBooking.booked_by_email || 'Not provided'} />
              <DataRow label="Phone" value={selectedBooking.phone_number || 'Not provided'} />
              <DataRow label="Faculty / Coordinator ID" value={selectedBooking.student_id || 'Not provided'} />
            </div>

            {/* REQUEST CARD */}
            <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', marginBottom: '16px', background: 'var(--bg-page)' }}>
              <h4 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', margin: '0 0 16px 0', textTransform: 'uppercase' }}>Request</h4>
              <DataRow label="Date" value={formatDate(selectedBooking.start_date_local)} />
              <DataRow label="Time" value={`${formatTime(selectedBooking.start_time_local)} – ${formatTime(selectedBooking.end_time_local)}`} />
              <DataRow label="Purpose" value={selectedBooking.purpose || selectedBooking.title || 'Not provided'} />
              {selectedBooking.description && selectedBooking.description !== selectedBooking.purpose && (
                <DataRow label="Description" value={selectedBooking.description} />
              )}
              {selectedBooking.all_day && (
                <DataRow label="All Day" value="Yes" />
              )}
              {selectedBooking.end_date_local && String(selectedBooking.end_date_local).slice(0, 10) !== String(selectedBooking.start_date_local).slice(0, 10) && (
                <DataRow label="End Date" value={formatDate(selectedBooking.end_date_local)} />
              )}

              <div style={{ marginTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
                  <span style={{ fontSize: '14px', color: 'var(--text-main)' }}>Attendees <strong style={{ fontSize: '16px', color: 'var(--text-main)', marginLeft: '8px' }}>{selectedBooking.attendee_count || 0}</strong></span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>capacity {selectedBooking.room_capacity || 40}</span>
                </div>
                {/* Visual Capacity Bar */}
                <div style={{ width: '100%', height: '6px', background: 'var(--sidebar-hover)', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' }}>
                  <div style={{ 
                    width: `${Math.min(100, ((Number(selectedBooking.attendee_count) || 0) / (selectedBooking.room_capacity || 40)) * 100)}%`, 
                    height: '100%', 
                    background: '#2f855a' 
                  }} />
                </div>
              </div>

              <div style={{ marginTop: '20px' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>Room needs</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {formatNeeds(selectedBooking.needs, selectedBooking.description).map((need: string, i: number) => (
                    <span key={i} style={{ padding: '4px 10px', background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '12px', color: 'var(--text-main)', fontWeight: 500 }}>
                      {need}
                    </span>
                  ))}
                  {formatNeeds(selectedBooking.needs, selectedBooking.description).length === 0 && <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No special needs requested</span>}
                </div>
              </div>
            </div>

            {/* ROOM CARD */}
            <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', marginBottom: '16px', background: 'var(--bg-page)' }}>
              <h4 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', margin: '0 0 16px 0', textTransform: 'uppercase' }}>Room</h4>
              <DataRow label="Building" value={selectedBooking.building || 'DeMattias Hall'} />
              <DataRow label="Capacity" value={selectedBooking.room_capacity || 40} />
              <DataRow label="Features" value={formatNeeds(selectedBooking.room_features).join(' · ') || 'Standard setup'} />
            </div>

            {/* DECISION AUDIT CARD - who/when this was decided, straight from room_booking_details */}
            {!['pending', 'tentative'].includes((selectedBooking.status || 'pending').toLowerCase()) && (selectedBooking.approved_by || selectedBooking.approval_date) && (
              <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', marginBottom: '16px', background: 'var(--bg-page)' }}>
                <h4 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', margin: '0 0 16px 0', textTransform: 'uppercase' }}>Decision</h4>
                <DataRow label="Decided By" value={selectedBooking.approved_by || 'Not recorded'} />
                <DataRow label="Decision Date" value={selectedBooking.approval_date ? formatDate(selectedBooking.approval_date) : 'Not recorded'} />
              </div>
            )}

            {/* DECISION CARD */}
            {['pending', 'tentative'].includes((selectedBooking.status || 'pending').toLowerCase()) && (
              <div style={{ border: '1px solid #283593', borderRadius: '12px', padding: '16px', background: '#f8faff' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#1a237e', margin: '0 0 12px 0', fontFamily: 'serif' }}>Decision Notes</h4>
                
                <textarea 
                  placeholder="Optional note to the requester (included in the email)..." 
                  value={decisionNote}
                  onChange={(e) => setDecisionNote(e.target.value)}
                  style={{ width: '100%', height: '80px', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', resize: 'none', marginBottom: '12px', outline: 'none' }}
                />
                
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#111827', fontWeight: 500, marginBottom: '16px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={notifyRequester} onChange={(e) => setNotifyRequester(e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#1a237e' }} />
                  Notify requester by email
                </label>

                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                  <button 
                    onClick={() => setConfirmDialog({ id: selectedBooking.id, type: 'rejected', roomName: selectedBooking.room_name || selectedBooking.room_id || 'Unknown Room' })}
                    style={{ flex: 1, background: '#ffffff', color: '#374151', border: '1px solid #d1d5db', padding: '10px', borderRadius: '8px', fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}
                  >
                    Decline
                  </button>
                  <button 
                    onClick={() => setConfirmDialog({ id: selectedBooking.id, type: 'confirmed', roomName: selectedBooking.room_name || selectedBooking.room_id || 'Unknown Room' })}
                    style={{ flex: 1, background: '#111827', color: '#ffffff', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}
                  >
                    Approve request
                  </button>
                </div>

                <p style={{ fontSize: '12px', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                  Approving moves the request to <strong>Confirmed</strong>, sends a confirmation email with calendar details to <strong>{selectedBooking.booked_by_user_id || selectedBooking.booked_by_email || 'the user'}</strong>, and updates the queue count. Declining sends a decline email with your note.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedBooking && isFullScreen && <div className="modal-overlay" onClick={() => setIsFullScreen(false)} style={{ zIndex: 999, background: 'rgba(0,0,0,0.4)', position: 'fixed', inset: 0 }} />}

      {/* CONFIRMATION SAFETY MODAL FOR INLINE TABLE BUTTONS AND WIDGET BUTTONS */}
      {confirmDialog && (
        <>
          <div className="modal-overlay" style={{ zIndex: 10001, background: 'rgba(0,0,0,0.4)', position: 'fixed', inset: 0 }} onClick={() => setConfirmDialog(null)} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'var(--bg-page)', border: '1px solid var(--border-color)',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            borderRadius: '12px', padding: '24px', width: '90%', maxWidth: '400px',
            zIndex: 10002, display: 'flex', flexDirection: 'column', gap: '16px'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: 'var(--text-main)' }}>
              Confirm {confirmDialog.type === 'confirmed' ? 'Approval' : 'Decline'}
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0, lineHeight: '1.5' }}>
              Are you sure you want to {confirmDialog.type === 'confirmed' ? 'approve' : 'decline'} the booking request for <strong>{confirmDialog.roomName}</strong>?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button 
                onClick={(e) => { e.stopPropagation(); setConfirmDialog(null); }}
                style={{ padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-main)', fontWeight: 500 }}
              >
                Cancel
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); executeAction(confirmDialog.type); }}
                style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: confirmDialog.type === 'confirmed' ? '#111827' : '#ef4444', color: '#ffffff', fontWeight: 500 }}
              >
                Yes, {confirmDialog.type === 'confirmed' ? 'Approve' : 'Decline'}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

// Helper component for identical key-value rows inside the cards
function DataRow({ label, value }: { label: string, value: string | number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px' }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: 'var(--text-main)', textAlign: 'right', maxWidth: '60%' }}>{value}</span>
    </div>
  );
}
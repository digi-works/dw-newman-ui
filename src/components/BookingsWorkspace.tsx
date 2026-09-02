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
  start_date_local?: string | Date;
  start_time_local?: string;
  end_time_local?: string;
  purpose?: string;
  status?: string;
  room_name?: string;
  booked_by_name?: string;
  booked_by_email?: string;
  role?: string;
}

export default function BookingsWorkspace({ onBookRoom, onCloseDrawer }: BookingsWorkspaceProps) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    id: string;
    type: 'confirmed' | 'rejected';
    roomName: string;
  } | null>(null);

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

  // Executes the permanent action ONLY after confirmation
  const executeAction = async () => {
    if (!confirmDialog) return;
    const { id, type } = confirmDialog;

    // Optimistically update the UI instantly
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status: type } : b));
    setSelectedBooking(null); // Close the email widget if open
    setConfirmDialog(null);   // Close the confirmation modal

    // Send to your Digiworks automation webhook
    try {
      const res = await fetch(`https://ap.digiworks.ai/api/v1/webhooks/9nCrG8NXMFE5jpiEuuVdE?status=${type}&booking_id=${id}`, { 
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
    awaiting: bookings.filter(b => {
      const s = (b.status || '').toLowerCase();
      return s === 'pending' || s === 'tentative';
    }).length,
    upcoming: bookings.filter(b => {
      const dateStr = b.start_date_local instanceof Date ? b.start_date_local.toISOString().split('T')[0] : String(b.start_date_local || '');
      return dateStr >= todayStr;
    }).length,
    confirmed: bookings.filter(b => {
      const s = (b.status || '').toLowerCase();
      return s === 'confirmed' || s === 'accepted' || s === 'approved';
    }).length,
    pending: bookings.filter(b => {
      const s = (b.status || '').toLowerCase();
      return s === 'pending' || s === 'tentative';
    }).length,
    rejected: bookings.filter(b => {
      const s = (b.status || '').toLowerCase();
      return s === 'rejected' || s === 'declined';
    }).length,
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

  const formatDate = (dateInput?: string | Date) => {
    if (!dateInput) return 'No Date';
    try {
      const date = new Date(String(dateInput));
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return String(dateInput); }
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
                  if (safeStatus === 'confirmed' || safeStatus === 'accepted' || safeStatus === 'approved') {
                    displayStatus = 'Confirmed';
                  } else if (safeStatus === 'rejected' || safeStatus === 'declined') {
                    displayStatus = 'Declined';
                  }

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
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{booking.role || 'General Request'}</span>
                      </td>
                      <td>
                        <strong style={{ display: 'block', fontSize: '14px', color: 'var(--text-main)' }}>{formatDate(booking.start_date_local)}</strong>
                        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                          {formatTime(booking.start_time_local)} - {formatTime(booking.end_time_local)}
                        </span>
                      </td>
                      <td>{booking.purpose || 'No purpose provided'}</td>

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

      {/* Picture-in-Picture Email Widget */}
      {selectedBooking && (
        <div className={`email-widget ${isFullScreen ? 'fullscreen' : 'pip'}`}>
          <div className="email-widget-header">
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)' }}>Booking Request: {selectedBooking.room_name || selectedBooking.room_id}</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>via digiviahire@gmail.com</span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setIsFullScreen(!isFullScreen)} className="widget-icon-btn">
                {isFullScreen ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}
              </button>
              <button onClick={() => setSelectedBooking(null)} className="widget-icon-btn">
                <X size={16}/>
              </button>
            </div>
          </div>

          <div className="email-widget-body">
            <div className="email-meta">
              <div className="avatar">{(selectedBooking.booked_by_name || 'U').charAt(0)}</div>
              <div>
                <strong style={{ color: 'var(--text-main)' }}>{selectedBooking.booked_by_name || 'Student / Faculty User'}</strong> &lt;{selectedBooking.booked_by_email || 'user@newman.edu'}&gt;
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>To: Facilities Office</div>
              </div>
            </div>

            <div className="email-content">
              <p>Hello Facilities Team,</p>
              <p>I would like to request the use of <strong>{selectedBooking.room_name || selectedBooking.room_id}</strong>.</p>

              <div className="request-details-box">
                <div><strong>Date:</strong> {formatDate(selectedBooking.start_date_local)}</div>
                <div><strong>Time:</strong> {formatTime(selectedBooking.start_time_local)} - {formatTime(selectedBooking.end_time_local)}</div>
                <div><strong>Purpose:</strong> {selectedBooking.purpose}</div>
              </div>

              <p>Please review this request and let me know if it is approved. Thank you!</p>
            </div>
          </div>

          {(filter === 'awaiting' || filter === 'pending') && ['pending', 'tentative'].includes((selectedBooking.status || 'pending').toLowerCase()) && (
             <div className="email-widget-footer" style={{ padding: '16px', display: 'flex', gap: '8px', justifyContent: 'flex-start' }}>
               <button 
                 onClick={(e) => { 
                   e.stopPropagation(); 
                   setConfirmDialog({ id: selectedBooking.id, type: 'rejected', roomName: selectedBooking.room_name || selectedBooking.room_id || 'Unknown Room' }); 
                 }}
                 style={{ padding: '8px 16px', fontSize: '14px', background: '#ffffff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
               >
                 Decline
               </button>
               <button 
                 onClick={(e) => { 
                   e.stopPropagation(); 
                   setConfirmDialog({ id: selectedBooking.id, type: 'confirmed', roomName: selectedBooking.room_name || selectedBooking.room_id || 'Unknown Room' }); 
                 }}
                 style={{ padding: '8px 16px', fontSize: '14px', background: '#111827', color: '#ffffff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
               >
                 Approve
               </button>
             </div>
          )}
        </div>
      )}

      {selectedBooking && isFullScreen && <div className="modal-overlay" onClick={() => setIsFullScreen(false)} />}

      {/* CONFIRMATION SAFETY MODAL */}
      {confirmDialog && (
        <>
          <div className="modal-overlay" style={{ zIndex: 10001 }} onClick={() => setConfirmDialog(null)} />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'var(--bg-page)',
            border: '1px solid var(--border-color)',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            borderRadius: '12px',
            padding: '24px',
            width: '90%',
            maxWidth: '400px',
            zIndex: 10002,
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
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
                style={{ padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', border: '1px solid #d1d5db', background: '#ffffff', color: '#374151', fontWeight: 500 }}
              >
                Cancel
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); executeAction(); }}
                style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: '#111827', color: '#ffffff', fontWeight: 500 }}
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
import { useState, useEffect } from 'react';
import { RefreshCw, List, Calendar as CalendarIcon, CheckCircle2, Clock, XCircle, Building2, Maximize2, Minimize2, X, Inbox } from 'lucide-react';

interface BookingsWorkspaceProps {
  onBookRoom: () => void;
}

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

type FilterType = 'all' | 'upcoming' | 'confirmed' | 'pending' | 'rejected' | 'awaiting';

export default function BookingsWorkspace({}: BookingsWorkspaceProps) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('awaiting'); // Default to the new queue
  
  // Email PiP Widget State
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);

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

  const handleAction = async (e: React.MouseEvent, id: string, newStatus: string) => {
    e.stopPropagation(); 
    
    // Optimistically update the UI instantly
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status: newStatus } : b));
    setSelectedBooking(null); // Close the widget
    
    // TODO: Create a PATCH route at /api/bookings/[id] later to save this permanently
    /*
    await fetch(`/api/bookings/${id}`, { 
      method: 'PATCH', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }) 
    });
    */
  };

  const todayStr = new Date().toISOString().split('T')[0];

  const stats = {
    all: bookings.length,
    awaiting: bookings.filter(b => (b.status || '').toLowerCase() === 'pending').length,
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
            <h3 className="bookings-sidebar-title">Manage Views</h3>

            <button className={`bookings-nav-item ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
              <div className="bookings-nav-left">
                <List size={16} style={{ color: '#7c3aed' }} /> All Bookings
              </div>
              <span className="bookings-badge">{stats.all}</span>
            </button>
            
            <button className={`bookings-nav-item ${filter === 'awaiting' ? 'active' : ''}`} onClick={() => setFilter('awaiting')}>
              <div className="bookings-nav-left">
                <Inbox size={16} style={{ color: '#ec4899' }} /> Awaiting Approvals
              </div>
              <span className="bookings-badge">{stats.awaiting}</span>
            </button>
            
            <button className={`bookings-nav-item ${filter === 'upcoming' ? 'active' : ''}`} onClick={() => setFilter('upcoming')}>
              <div className="bookings-nav-left">
                <CalendarIcon size={16} style={{ color: '#3b82f6' }} /> Upcoming
              </div>
              <span className="bookings-badge">{stats.upcoming}</span>
            </button>

            <button className={`bookings-nav-item ${filter === 'confirmed' ? 'active' : ''}`} onClick={() => setFilter('confirmed')}>
              <div className="bookings-nav-left">
                <CheckCircle2 size={16} style={{ color: '#10b981' }} /> Confirmed
              </div>
              <span className="bookings-badge">{stats.confirmed}</span>
            </button>

            <button className={`bookings-nav-item ${filter === 'pending' ? 'active' : ''}`} onClick={() => setFilter('pending')}>
              <div className="bookings-nav-left">
                <Clock size={16} style={{ color: '#f59e0b' }} /> Tentative
              </div>
              <span className="bookings-badge">{stats.pending}</span>
            </button>

            <button className={`bookings-nav-item ${filter === 'rejected' ? 'active' : ''}`} onClick={() => setFilter('rejected')}>
              <div className="bookings-nav-left">
                <XCircle size={16} style={{ color: '#ef4444' }} /> Declined
              </div>
              <span className="bookings-badge">{stats.rejected}</span>
            </button>
          </aside>

      {/* Main Content Area */}
      <div className="bookings-main">
        <div className="dashboard-header">
          <h2 className="dashboard-title">
            {filter === 'awaiting' ? 'Pending Approvals' : filter.charAt(0).toUpperCase() + filter.slice(1) + ' Bookings'}
          </h2>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              onClick={fetchBookings} 
              className="nav-btn" 
              style={{ background: 'var(--input-bg)', border: '1px solid var(--border-color)' }}
            >
              <RefreshCw size={16} className={isLoading ? "spin-animation" : ""} />
            </button>
          </div>
        </div>

        <div className="table-container">
          <div className="table-header-row">
            <h3>Booking Details</h3>
          </div>
          
          {error ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>
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
                  let displayStatus = safeStatus.charAt(0).toUpperCase() + safeStatus.slice(1);
                  let StatusIcon = Clock;
                  
                  if (safeStatus === 'confirmed' || safeStatus === 'accepted' || safeStatus === 'approved') {
                    StatusIcon = CheckCircle2;
                    displayStatus = 'Confirmed';
                  } else if (safeStatus === 'rejected' || safeStatus === 'declined') {
                    StatusIcon = XCircle;
                    displayStatus = 'Declined';
                  } else {
                    StatusIcon = Clock;
                    displayStatus = 'Tentative';
                  }
                  
                  return (
                    <tr 
                      key={booking.id} 
                      onClick={() => setSelectedBooking(booking)} 
                      style={{ cursor: 'pointer', background: selectedBooking?.id === booking.id ? 'var(--sidebar-hover)' : '' }}
                    >
                      <td>
                        <div className="room-cell">
                          <div className="room-icon"><Building2 size={16} /></div>
                          {booking.room_name || booking.room_id || 'Unknown Room'}
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
                        <div className={`status-badge status-${displayStatus.toLowerCase()}`}>
                          <StatusIcon size={14} />
                          {displayStatus}
                        </div>
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
          
          {(selectedBooking.status || 'pending').toLowerCase() === 'pending' && (
             <div className="email-widget-footer">
               <button className="btn-decline" onClick={(e) => handleAction(e, selectedBooking.id, 'declined')}>Decline Request</button>
               <button className="btn-approve" onClick={(e) => handleAction(e, selectedBooking.id, 'confirmed')}>Approve Request</button>
             </div>
          )}
        </div>
      )}
      
      {selectedBooking && isFullScreen && <div className="modal-overlay" onClick={() => setIsFullScreen(false)} />}
    </section>
  );
}
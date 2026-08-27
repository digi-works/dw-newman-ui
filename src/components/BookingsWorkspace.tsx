"use client";

import { useState, useEffect } from 'react';
import { RefreshCw, List, Calendar as CalendarIcon, CheckCircle2, Clock, XCircle, Building2 } from 'lucide-react';

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
}

type FilterType = 'all' | 'upcoming' | 'confirmed' | 'pending' | 'rejected';

export default function BookingsWorkspace({}: BookingsWorkspaceProps) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');

  const fetchBookings = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings");
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Failed to load bookings from Postgres");
      }
      setBookings(payload as Booking[]);
    } catch (err: unknown) {
      console.error("Error fetching bookings from Neon:", err);
      setError(err instanceof Error ? err.message : "Failed to load bookings from Postgres");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const todayStr = new Date().toISOString().split('T')[0];

  const stats = {
    all: bookings.length,
    upcoming: bookings.filter(b => {
      const dateStr = b.start_date_local instanceof Date 
        ? b.start_date_local.toISOString().split('T')[0] 
        : String(b.start_date_local || '');
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
    const dateStr = booking.start_date_local instanceof Date 
      ? booking.start_date_local.toISOString().split('T')[0] 
      : String(booking.start_date_local || '');

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
    } catch {
      return String(timeStr);
    }
  };

  const formatDate = (dateInput?: string | Date) => {
    if (!dateInput) return 'No Date';
    try {
      const date = new Date(String(dateInput));
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return String(dateInput);
    }
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
            {filter.charAt(0).toUpperCase() + filter.slice(1)} Bookings
          </h2>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              onClick={fetchBookings} 
              className="nav-btn" 
              style={{ background: 'var(--input-bg)', border: '1px solid var(--border-color)' }}
              title="Refresh data"
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
            <table className="bookings-table">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Date</th>
                  <th>Time</th>
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
                    <tr key={booking.id}>
                      <td>
                        <div className="room-cell">
                          <div className="room-icon">
                            <Building2 size={16} />
                          </div>
                          {booking.room_name || booking.room_id || 'Unknown Room'}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 500 }}>
                          {formatDate(booking.start_date_local)}
                        </span>
                      </td>
                      <td>
                        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
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
    </section>
  );
}
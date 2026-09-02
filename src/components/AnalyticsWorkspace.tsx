"use client";

import { useState, useEffect } from 'react';
import { BarChart3, CheckCircle, Clock, Building2, TrendingUp, Users, MessageSquare, MousePointerClick } from 'lucide-react';

interface Booking {
  id: string;
  room_id: string;
  room_name?: string;
  status?: string;
  start_date_local?: string | Date;
}

export default function AnalyticsWorkspace() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const res = await fetch("/api/bookings");
        const payload = await res.json();
        if (res.ok) setBookings(payload);
      } catch (err) {
        console.error("Failed to load analytics data", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchBookings();
  }, []);

  // --- Real Booking Metrics (From your Neon Database) ---
  const totalBookings = bookings.length;
  const confirmedBookings = bookings.filter(b => ['confirmed', 'accepted', 'approved'].includes((b.status || '').toLowerCase())).length;
  const pendingBookings = bookings.filter(b => ['pending', 'tentative'].includes((b.status || '').toLowerCase())).length;
  const approvalRate = totalBookings > 0 ? Math.round((confirmedBookings / totalBookings) * 100) : 0;

  // Calculate Most Popular Rooms from Real Data
  const roomCounts = bookings.reduce((acc, booking) => {
    const roomName = booking.room_name || booking.room_id || 'Unknown Room';
    acc[roomName] = (acc[roomName] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const topRooms = Object.entries(roomCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5); // Top 5 rooms

  return (
    <section className="bookings-workspace analytics-workspace">
      <div className="bookings-main">
        <div className="dashboard-header">
          <div>
            <h1 className="dashboard-title">Platform Analytics</h1>
            <p className="bookings-subtitle">Track application usage, user engagement, and booking metrics.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="analytics-loading">Loading analytics...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

            {/* SECTION 1: App Usage & Engagement (UI Ready for Web Analytics Integration) */}
            <div>
              <h2 className="analytics-section-title">Application Usage (Last 30 Days)</h2>
              <div className="analytics-metrics-grid">
                <MetricCard icon={<Users />} title="Unique Visitors" value="1,245" color="#8b5cf6" trend="+12%" />
                <MetricCard icon={<MousePointerClick />} title="Total Sessions" value="3,892" color="#3b82f6" trend="+8%" />
                <MetricCard icon={<MessageSquare />} title="AI Chat Queries" value="8,421" color="#10b981" trend="+24%" />
                <MetricCard icon={<Clock />} title="Avg Session Time" value="4m 12s" color="#f59e0b" />
              </div>
            </div>

            {/* SECTION 2: Room Bookings (Real Database Data) */}
            <div>
              <h2 className="analytics-section-title">Booking Fulfillments (All Time)</h2>
              <div className="analytics-metrics-grid">
                <MetricCard icon={<BarChart3 />} title="Total Requests" value={totalBookings} />
                <MetricCard icon={<CheckCircle />} title="Approved Requests" value={confirmedBookings} color="#10b981" />
                <MetricCard icon={<Clock />} title="Pending Approval" value={pendingBookings} color="#f59e0b" />
                <MetricCard icon={<TrendingUp />} title="Approval Rate" value={`${approvalRate}%`} color="#3b82f6" />
              </div>
            </div>

            {/* SECTION 3: Deep Dives (Rooms & Features) */}
            <div className="analytics-panels-grid">

              {/* Top Rooms List (Real Data) */}
              <div className="analytics-panel">
                <h3 className="analytics-panel-title">
                  <Building2 size={18} /> Most Requested Rooms
                </h3>
                <div className="analytics-list">
                  {topRooms.map(([room, count]) => (
                    <div key={room} className="analytics-list-row">
                      <span className="analytics-list-room">{room}</span>
                      <span className="analytics-list-count">{count} requests</span>
                    </div>
                  ))}
                  {topRooms.length === 0 && <div className="analytics-empty">No room data available.</div>}
                </div>
              </div>

              {/* Feature Breakdown (UI Ready for tracking) */}
              <div className="analytics-panel">
                <h3 className="analytics-panel-title">
                  <BarChart3 size={18} /> AI Feature Engagement
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
                  <ProgressBar label="Room Reservations" percentage={65} color="#3b82f6" />
                  <ProgressBar label="Campus Events Info" percentage={22} color="#10b981" />
                  <ProgressBar label="Athletics Fixtures" percentage={13} color="#f59e0b" />
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// --- Helper Components for clean UI ---

function MetricCard({ icon, title, value, color = 'var(--brand)', trend }: { icon: React.ReactNode, title: string, value: string | number, color?: string, trend?: string }) {
  return (
    <div className="metric-card">
      <div className="metric-card-icon" style={{ color }}>
        {icon}
      </div>
      <div className="metric-card-body">
        <div className="metric-card-title">{title}</div>
        <div className="metric-card-value">{value}</div>
      </div>
      {trend && <div className="metric-card-trend">{trend}</div>}
    </div>
  );
}

function ProgressBar({ label, percentage, color }: { label: string, percentage: number, color: string }) {
  return (
    <div className="progress-bar-row">
      <div className="progress-bar-labels">
        <span>{label}</span>
        <strong>{percentage}%</strong>
      </div>
      <div className="progress-bar-track">
        <div className="progress-bar-fill" style={{ width: `${percentage}%`, background: color }} />
      </div>
    </div>
  );
}
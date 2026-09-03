import { NextResponse } from "next/server";
import sql from "@/db";

export async function GET() {
  try {
    const data = await sql`
      SELECT
        b.id,
        b.room_id,
        b.booked_by_user_id,
        b.booked_by_name,
        b.phone as phone_number,
        b.title,
        b.description,
        b.start_date_local,
        b.end_date_local,
        b.start_time_local,
        b.end_time_local,
        b.timezone,
        b.all_day,
        b.purpose,
        b.status,
        b.attendee_count,
        b.approval_date,
        b.approved_by,
        b.created_at,
        b.updated_at,
        r.name as room_name,
        r.capacity as room_capacity,
        r.features as room_features,
        bld.name as building
      FROM room_booking_details b
      LEFT JOIN rooms r ON b.room_id = r.id
      LEFT JOIN buildings bld ON r.building_id = bld.id
      ORDER BY b.start_date_local DESC
    `;

    return NextResponse.json(data);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load bookings from Postgres";
    console.error("Error fetching bookings from Neon:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

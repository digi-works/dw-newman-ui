import { NextResponse } from "next/server";
import sql from "@/db";

export async function GET() {
  try {
    const data = await sql`
      SELECT
        b.id,
        b.room_id,
        b.start_date_local,
        b.start_time_local,
        b.end_time_local,
        b.purpose,
        b.status,
        r.name as room_name
      FROM room_booking_details b
      LEFT JOIN rooms r ON b.room_id = r.id
      ORDER BY b.start_date_local DESC
    `;

    return NextResponse.json(data);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load bookings from Postgres";
    console.error("Error fetching bookings from Database:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

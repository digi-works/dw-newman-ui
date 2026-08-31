import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const capacity = searchParams.get('capacity') || '0';
  const building = searchParams.get('building');
  
  // Extract the specific time requirements sent by the frontend
  const date = searchParams.get('date');
  const startTime = searchParams.get('startTime');
  const endTime = searchParams.get('endTime');

  try {
    const dbUrl = process.env.NEXT_PUBLIC_NEON_DB_URL;

    if (!dbUrl) {
      throw new Error("NEXT_PUBLIC_NEON_DB_URL is missing from environment variables.");
    }
    
    if (!date || !startTime || !endTime) {
      return NextResponse.json(
        { error: "Missing required date or time parameters." }, 
        { status: 400 }
      );
    }

    const sql = neon(dbUrl);
    let dbRooms;

    // We use a NOT EXISTS subquery against room_booking_details to prevent double-booking overlaps
    if (building && building !== 'No preference') {
      dbRooms = await sql`
        SELECT r.name as room_name, b.name as building_name 
        FROM rooms r
        JOIN buildings b ON r.building_id = b.id
        WHERE r.capacity >= ${parseInt(capacity, 10)}
        AND b.name = ${building}
        AND NOT EXISTS (
          SELECT 1 
          FROM room_booking_details rbd
          WHERE rbd.room_id = r.id
          AND rbd.start_date_local = ${date}::date
          AND rbd.start_time_local < ${endTime}::time
          AND rbd.end_time_local > ${startTime}::time
          AND rbd.status != 'rejected'
        )
      `;
    } else {
      // If "No preference", search all buildings but still strictly check for double bookings
      dbRooms = await sql`
        SELECT r.name as room_name, b.name as building_name 
        FROM rooms r
        JOIN buildings b ON r.building_id = b.id
        WHERE r.capacity >= ${parseInt(capacity, 10)}
        AND NOT EXISTS (
          SELECT 1 
          FROM room_booking_details rbd
          WHERE rbd.room_id = r.id
          AND rbd.start_date_local = ${date}::date
          AND rbd.start_time_local < ${endTime}::time
          AND rbd.end_time_local > ${startTime}::time
          AND rbd.status != 'rejected'
        )
      `;
    }

    // Extract and format the names from the database rows
    const exactMatches = dbRooms.map(row => `${row.building_name} - ${row.room_name}`);

    // Return the live, conflict-free database results to the frontend
    return NextResponse.json({
      exactMatches: exactMatches,
      alternatives: [], 
      rooms: exactMatches
    });

  } catch (error: any) {
    console.error("🔥 NEON DB ERROR:", error.message); 
    return NextResponse.json(
      { error: "Database failed", details: error.message }, 
      { status: 500 }
    );
  }
}
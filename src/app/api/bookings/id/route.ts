import { NextResponse } from "next/server";
import { Pool } from '@neondatabase/serverless';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const dbUrl = process.env.NEXT_PUBLIC_NEON_DB_URL;
    if (!dbUrl) throw new Error("Database URL missing");
    
    const body = await request.json();
    const { status } = body;
    
    if (!status) {
      return NextResponse.json({ error: "Status is required" }, { status: 400 });
    }

    const pool = new Pool({ connectionString: dbUrl });

    // Update the booking status safely
    const { rows } = await pool.query(
      `UPDATE room_booking_details 
       SET status = $1 
       WHERE id = $2 
       RETURNING *`,
      [status, params.id]
    );

    await pool.end();

    if (rows.length === 0) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, booking: rows[0] });

  } catch (error: any) {
    console.error("PATCH Booking Error:", error);
    return NextResponse.json(
      { error: "Failed to update booking status" },
      { status: 500 }
    );
  }
}
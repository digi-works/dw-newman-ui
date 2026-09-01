import { NextResponse } from "next/server";
import { Pool } from '@neondatabase/serverless';

// We use GET because clicking a link in an email always triggers a GET request
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const action = searchParams.get('action'); // expects 'confirmed' or 'declined'

    if (!id || !action) {
      return new NextResponse("Missing booking ID or action", { status: 400 });
    }

    const dbUrl = process.env.NEXT_PUBLIC_NEON_DB_URL;
    if (!dbUrl) throw new Error("Database URL missing");

    const pool = new Pool({ connectionString: dbUrl });

    // Update the database. This is the EXACT same table your UI reads from.
    const { rows } = await pool.query(
      `UPDATE room_booking_details 
       SET status = $1 
       WHERE id = $2 
       RETURNING *`,
      [action, id]
    );

    await pool.end();

    if (rows.length === 0) {
      return new NextResponse("Booking not found or already processed.", { status: 404 });
    }

    // Return a beautiful HTML success screen right in their browser
    const isApproved = action === 'confirmed';
    const color = isApproved ? '#10b981' : '#ef4444';
    const text = isApproved ? 'Approved' : 'Declined';

    const html = `
      <html>
        <body style="font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f8fafc; margin: 0;">
          <div style="background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); text-align: center; max-width: 400px;">
            <div style="background: ${color}; color: white; width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 32px; margin: 0 auto 20px;">
              ${isApproved ? '✓' : '✕'}
            </div>
            <h2 style="margin: 0 0 10px; color: #0f172a;">Request ${text}</h2>
            <p style="color: #64748b; margin: 0; line-height: 1.5;">
              The booking for <strong>${rows[0].room_id}</strong> has been successfully ${text.toLowerCase()}. Your dashboard has been updated automatically.
            </p>
          </div>
        </body>
      </html>
    `;

    return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });

  } catch (error) {
    console.error("Email Webhook Error:", error);
    return new NextResponse("An error occurred processing your request", { status: 500 });
  }
}
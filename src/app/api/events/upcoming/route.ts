import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { findTitleInText } from '@/lib/fuzzy';

// Upcoming campus events for the calendar invite form.
//   GET /api/events/upcoming            → { events: next 10 events }
//   GET /api/events/upcoming?match=text → also { match: the upcoming event whose
//                                          title appears in `text`, or null }
export async function GET(request: Request) {
  try {
    const dbUrl = process.env.NEXT_PUBLIC_NEON_DB_URL;

    if (!dbUrl) {
      throw new Error("NEXT_PUBLIC_NEON_DB_URL is missing from environment variables.");
    }

    const sql = neon(dbUrl);
    const matchText = new URL(request.url).searchParams.get('match')?.trim() ?? '';

    // starts_at_utc isn't populated, so "upcoming" is computed from the local
    // date/time columns against the current time on campus (Wichita).
    const events = await sql`
      SELECT o.id,
             e.title,
             to_char(o.start_date_local, 'YYYY-MM-DD') AS date,
             to_char(o.start_time_local, 'HH24:MI') AS "startTime",
             to_char(o.end_time_local, 'HH24:MI') AS "endTime",
             o.all_day AS "allDay",
             COALESCE(o.location_text, o.room_id) AS location
      FROM event_occurrences o
      JOIN events e ON e.id = o.event_id
      WHERE o.status = 'confirmed' AND o.cancelled_at IS NULL
        AND e.lifecycle_status = 'confirmed' AND e.archived_at IS NULL AND e.visibility = 'public'
        AND (o.start_date_local + COALESCE(o.start_time_local, '00:00')) >= (now() AT TIME ZONE 'America/Chicago')
      ORDER BY o.start_date_local, o.start_time_local NULLS FIRST
      LIMIT 10
    `;

    // The user named a specific event ("add Mision Orientaton to my calendar"):
    // fuzzy-match their message against upcoming event titles (typos and missing
    // small words are fine), then take that event's soonest occurrence.
    let match = null;
    if (matchText) {
      const upcoming = await sql`
        SELECT DISTINCT ON (e.title)
               o.id,
               e.title,
               to_char(o.start_date_local, 'YYYY-MM-DD') AS date,
               to_char(o.start_time_local, 'HH24:MI') AS "startTime",
               to_char(o.end_time_local, 'HH24:MI') AS "endTime",
               o.all_day AS "allDay",
               COALESCE(o.location_text, o.room_id) AS location
        FROM event_occurrences o
        JOIN events e ON e.id = o.event_id
        WHERE o.status = 'confirmed' AND o.cancelled_at IS NULL
          AND e.lifecycle_status = 'confirmed' AND e.archived_at IS NULL AND e.visibility = 'public'
          AND (o.start_date_local + COALESCE(o.start_time_local, '00:00')) >= (now() AT TIME ZONE 'America/Chicago')
        ORDER BY e.title, o.start_date_local, o.start_time_local NULLS FIRST
      `;
      const title = findTitleInText(matchText, upcoming.map(row => row.title));
      match = upcoming.find(row => row.title === title) ?? null;
    }

    return NextResponse.json({ events, match });

  } catch (error: any) {
    console.error("NEON DB ERROR (Upcoming events):", error.message);
    return NextResponse.json(
      { error: "Failed to fetch upcoming events from the database.", details: error.message },
      { status: 500 }
    );
  }
}

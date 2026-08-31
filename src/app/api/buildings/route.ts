import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export async function GET() {
  try {
    const dbUrl = process.env.NEXT_PUBLIC_NEON_DB_URL;
    
    if (!dbUrl) {
      throw new Error("NEXT_PUBLIC_NEON_DB_URL is missing from environment variables.");
    }
    
    const sql = neon(dbUrl);

    // Fetch building names directly from the 'buildings' table
    const dbBuildings = await sql`
      SELECT name 
      FROM buildings 
      ORDER BY name ASC
    `;

    // Extract just the string names from the database rows
    const buildingsList = dbBuildings.map(row => row.name);

    return NextResponse.json({ buildings: buildingsList });

  } catch (error: any) {
    console.error("🔥 NEON DB ERROR (Buildings):", error.message);
    return NextResponse.json(
      { error: "Failed to fetch buildings from the database.", details: error.message }, 
      { status: 500 }
    );
  }
}
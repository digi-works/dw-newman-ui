// src/db.ts
import { neon } from '@neondatabase/serverless';

// Next.js uses process.env instead of import.meta.env
// Prefixing with NEXT_PUBLIC_ makes it safely accessible in client components
const dbUrl = process.env.NEXT_PUBLIC_NEON_DB_URL || '';

if (!dbUrl) {
  console.warn("Missing NEXT_PUBLIC_NEON_DB_URL in .env file.");
}

const sql = neon(dbUrl);

export default sql;
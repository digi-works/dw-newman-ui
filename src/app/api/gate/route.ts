import { NextRequest, NextResponse } from "next/server";
import {
  GATE_PASSWORD,
  GATE_COOKIE_NAME,
  GATE_COOKIE_VALUE,
  GATE_COOKIE_MAX_AGE,
} from "@/lib/gate";

export async function POST(request: NextRequest) {
  let password: unknown;
  try {
    ({ password } = await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  if (typeof password !== "string" || password !== GATE_PASSWORD) {
    return NextResponse.json({ ok: false, error: "Incorrect password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(GATE_COOKIE_NAME, GATE_COOKIE_VALUE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GATE_COOKIE_MAX_AGE,
  });
  return response;
}

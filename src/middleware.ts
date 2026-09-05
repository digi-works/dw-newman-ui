import { NextRequest, NextResponse } from "next/server";
import { GATE_COOKIE_NAME, GATE_COOKIE_VALUE } from "./lib/gate";

// Blocks every route in the app until the visitor has passed the password
// gate at /gate. Only the gate page itself, its verification API, and
// static/public assets are allowed through unauthenticated.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicPath =
    pathname === "/gate" ||
    pathname.startsWith("/api/gate") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    /\.(png|jpg|jpeg|gif|svg|ico|webp|css|js|map|woff|woff2|ttf)$/.test(pathname);

  if (isPublicPath) {
    return NextResponse.next();
  }

  const isAuthed = request.cookies.get(GATE_COOKIE_NAME)?.value === GATE_COOKIE_VALUE;
  if (isAuthed) {
    return NextResponse.next();
  }

  const gateUrl = new URL("/gate", request.url);
  gateUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(gateUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};

// Shared constants for the site-wide password gate. Keep the password only
// here so the middleware and the verification API always agree.
export const GATE_PASSWORD = "newmandigi2026";
export const GATE_COOKIE_NAME = "nu_gate_pass";
export const GATE_COOKIE_VALUE = "granted";
export const GATE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

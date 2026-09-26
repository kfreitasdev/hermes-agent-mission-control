import { NextResponse } from "next/server";

/**
 * This legacy password endpoint is intentionally disabled.
 * Authentication is provided only by NextAuth/Google OAuth.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Password login is disabled; use Google OAuth" },
    { status: 410 },
  );
}

import { NextResponse } from "next/server";

export function GET() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL ?? null;
  return NextResponse.json({ convexUrl: url });
} 
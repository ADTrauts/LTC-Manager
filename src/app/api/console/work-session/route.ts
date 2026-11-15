import { NextResponse } from "next/server";

export function POST() {
  return NextResponse.json({ error: "Staff Facility workspace access is paused." }, { status: 410 });
}

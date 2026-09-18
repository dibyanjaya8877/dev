import { NextResponse } from "next/server";
import { getCurrentAccount } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentAccount();
  return NextResponse.json({ user });
}
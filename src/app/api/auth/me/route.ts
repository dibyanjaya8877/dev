import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getCurrentAccount } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";

export async function GET() {
  const user = await getCurrentAccount();
  if (!user) return NextResponse.json({ user: null });
  const account = await (await getDatabase()).collection("users").findOne({ _id: new ObjectId(user.id) }, { projection: { readReceipts: 1 } });
  return NextResponse.json({ user: { ...user, readReceipts: account?.readReceipts !== false } });
}

export async function PATCH(request: Request) {
  const user = await getCurrentAccount();
  const payload = await request.json().catch(() => null);
  if (!user || typeof payload?.readReceipts !== "boolean") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  await (await getDatabase()).collection("users").updateOne({ _id: new ObjectId(user.id) }, { $set: { readReceipts: payload.readReceipts, updatedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getCurrentAccount } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";

const updateSchema = z.object({ userId: z.string(), approved: z.boolean() });

export async function GET() {
  const admin = await getCurrentAccount();
  if (!admin || admin.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = await getDatabase();
  const users = await db.collection("users").find({}, { projection: { name: 1, email: 1, role: 1, approved: 1, createdAt: 1 } }).sort({ createdAt: -1 }).toArray();
  return NextResponse.json({ users: users.map((user) => ({ id: user._id.toString(), name: user.name, email: user.email, role: user.role ?? "user", approved: user.role === "admin" || user.approved === true, createdAt: user.createdAt })) });
}

export async function PATCH(request: Request) {
  const admin = await getCurrentAccount();
  if (!admin || admin.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success || !ObjectId.isValid(parsed.data.userId)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const db = await getDatabase();
  const target = await db.collection("users").findOne({ _id: new ObjectId(parsed.data.userId) });
  if (!target || target.role === "admin" || target.email === process.env.ADMIN_EMAIL) return NextResponse.json({ error: "This account cannot be changed." }, { status: 400 });
  await db.collection("users").updateOne({ _id: target._id }, { $set: { approved: parsed.data.approved, updatedAt: new Date() } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const admin = await getCurrentAccount();
  if (!admin || admin.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const payload = await request.json().catch(() => null);
  if (!ObjectId.isValid(payload?.userId)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const db = await getDatabase();
  const target = await db.collection("users").findOne({ _id: new ObjectId(payload.userId) });
  if (!target || target.role === "admin" || target.email === process.env.ADMIN_EMAIL) return NextResponse.json({ error: "This account cannot be deleted." }, { status: 400 });
  const userId = target._id.toString();
  await Promise.all([
    db.collection("messages").deleteMany({ $or: [{ senderId: userId }, { recipientId: userId }] }),
    db.collection("friendRequests").deleteMany({ $or: [{ senderId: userId }, { recipientId: userId }] }),
    db.collection("calls").deleteMany({ $or: [{ callerId: userId }, { recipientId: userId }, { userId }, { peerId: userId }] }),
    db.collection("users").deleteOne({ _id: target._id }),
  ]);
  return NextResponse.json({ ok: true });
}
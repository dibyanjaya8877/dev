import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getCurrentAccount } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";

const requestSchema = z.object({ recipientId: z.string() });

export async function GET() {
  const current = await getCurrentAccount();
  if (!current?.approved) return NextResponse.json({ error: "Approval required." }, { status: 403 });
  const db = await getDatabase();
  const requests = await db.collection("friendRequests").find({ $or: [{ senderId: current.id }, { recipientId: current.id }] }).sort({ createdAt: -1 }).toArray();
  return NextResponse.json({ requests: requests.map((item) => ({ id: item._id.toString(), senderId: item.senderId, recipientId: item.recipientId, status: item.status })) });
}

export async function POST(request: Request) {
  const current = await getCurrentAccount();
  if (!current?.approved) return NextResponse.json({ error: "Approval required." }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success || !ObjectId.isValid(parsed.data.recipientId) || parsed.data.recipientId === current.id) return NextResponse.json({ error: "Invalid recipient." }, { status: 400 });
  const db = await getDatabase();
  const recipient = await db.collection("users").findOne({ _id: new ObjectId(parsed.data.recipientId), approved: true });
  if (!recipient) return NextResponse.json({ error: "User is not available." }, { status: 404 });
  const pairId = [current.id, parsed.data.recipientId].sort().join(":");
  const existing = await db.collection("friendRequests").findOne({ pairId });
  if (existing) return NextResponse.json({ error: "A connection request already exists." }, { status: 409 });
  const result = await db.collection("friendRequests").insertOne({ pairId, senderId: current.id, recipientId: parsed.data.recipientId, status: "pending", createdAt: new Date() });
  return NextResponse.json({ request: { id: result.insertedId.toString(), senderId: current.id, recipientId: parsed.data.recipientId, status: "pending" } }, { status: 201 });
}
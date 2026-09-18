import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getCurrentAccount } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";

const schema = z.object({ action: z.enum(["accept", "reject"]) });

export async function PATCH(request: Request, context: { params: Promise<{ requestId: string }> }) {
  const current = await getCurrentAccount();
  if (!current?.approved) return NextResponse.json({ error: "Approval required." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  const { requestId } = await context.params;
  if (!parsed.success || !ObjectId.isValid(requestId)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const db = await getDatabase();
  const result = await db.collection("friendRequests").updateOne(
    { _id: new ObjectId(requestId), recipientId: current.id, status: "pending" },
    { $set: { status: parsed.data.action === "accept" ? "accepted" : "rejected", updatedAt: new Date() } },
  );
  if (!result.matchedCount) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
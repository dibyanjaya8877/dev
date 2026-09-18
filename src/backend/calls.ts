import { ObjectId } from "mongodb";
import { z } from "zod";
import { requireApprovedAccount, requireFriendship } from "@/backend/access";

const createSchema = z.object({ peerId: z.string(), type: z.enum(["voice", "video"]), direction: z.enum(["incoming", "outgoing"]), status: z.enum(["missed", "completed", "declined"]).default("missed") });
const updateSchema = z.object({ status: z.enum(["missed", "completed", "declined"]), durationSeconds: z.number().int().nonnegative().max(86400).default(0) });

export async function createCall(payload: unknown) {
  const current = await requireApprovedAccount();
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) throw new Response("Invalid call.", { status: 400 });
  const { db, pairId } = await requireFriendship(current.id, parsed.data.peerId);
  const document = { pairId, userId: current.id, ...parsed.data, startedAt: new Date(), durationSeconds: 0 };
  const result = await db.collection("calls").insertOne(document);
  return { id: result.insertedId.toString(), ...document };
}

export async function listCalls() {
  const current = await requireApprovedAccount();
  const { getDatabase } = await import("@/lib/mongodb");
  const db = await getDatabase();
  const calls = await db.collection("calls").find({ userId: current.id }).sort({ startedAt: -1 }).limit(50).toArray();
  return calls.map((call) => ({ id: call._id.toString(), peerId: call.peerId, type: call.type, direction: call.direction, status: call.status, startedAt: call.startedAt, durationSeconds: call.durationSeconds ?? 0 }));
}

export async function finishCall(callId: string, payload: unknown) {
  const current = await requireApprovedAccount();
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success || !ObjectId.isValid(callId)) throw new Response("Invalid call update.", { status: 400 });
  const { getDatabase } = await import("@/lib/mongodb");
  const db = await getDatabase();
  const result = await db.collection("calls").updateOne({ _id: new ObjectId(callId), userId: current.id }, { $set: { ...parsed.data, endedAt: new Date() } });
  if (!result.matchedCount) throw new Response("Call not found.", { status: 404 });
}
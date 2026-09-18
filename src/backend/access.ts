import { ObjectId } from "mongodb";
import { getCurrentAccount } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";

export async function requireApprovedAccount() {
  const account = await getCurrentAccount();
  if (!account?.approved) throw new Response("Approval required.", { status: 403 });
  return account;
}

export async function requireFriendship(firstId: string, secondId: string) {
  if (!ObjectId.isValid(secondId) || firstId === secondId) throw new Response("Invalid recipient.", { status: 400 });
  const db = await getDatabase();
  const pairId = [firstId, secondId].sort().join(":");
  const [friendship, otherUser] = await Promise.all([
    db.collection("friendRequests").findOne({ pairId, status: "accepted" }),
    db.collection("users").findOne({ _id: new ObjectId(secondId), approved: true }),
  ]);
  if (!friendship || !otherUser) throw new Response("Connect before messaging.", { status: 403 });
  return { db, pairId };
}

export function apiError(error: unknown) {
  if (error instanceof Response) return Response.json({ error: error.statusText || "Request denied." }, { status: error.status });
  console.error(error);
  return Response.json({ error: "The server could not complete this request." }, { status: 500 });
}
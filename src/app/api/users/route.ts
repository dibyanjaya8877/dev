import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getCurrentAccount } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";

export async function GET(request: Request) {
  const currentUser = await getCurrentAccount();
  if (!currentUser?.approved) return NextResponse.json({ error: "Approval required." }, { status: 403 });

  const db = await getDatabase();
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 60);
  const search = query ? { $or: [{ name: { $regex: query, $options: "i" } }, { email: { $regex: query, $options: "i" } }] } : {};
  const account = await db.collection("users").findOne({ _id: new ObjectId(currentUser.id) }, { projection: { hiddenContacts: 1 } });
  const hiddenContacts = Array.isArray(account?.hiddenContacts) ? account.hiddenContacts : [];
  const hiddenIds = hiddenContacts.filter((id: unknown): id is string => typeof id === "string" && ObjectId.isValid(id)).map((id: string) => new ObjectId(id));
  const users = await db
    .collection("users")
    .find({ _id: { $nin: [new ObjectId(currentUser.id), ...hiddenIds] }, approved: true, ...search }, { projection: { name: 1, email: 1, lastSeen: 1 } })
    .limit(30)
    .toArray();

  return NextResponse.json({
    users: users.map((user) => ({ id: user._id.toString(), name: user.name, email: user.email, lastSeen: user.lastSeen })),
  });
}
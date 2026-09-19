import { ObjectId } from "mongodb";
import { z } from "zod";
import { requireApprovedAccount, requireFriendship } from "@/backend/access";

const attachmentSchema = z.object({ url: z.string().min(1), name: z.string().max(240), mime: z.string().max(120), size: z.number().nonnegative() });
const messageSchema = z.object({
  recipientId: z.string(),
  body: z.string().trim().max(4000).default(""),
  type: z.enum(["text", "image", "video", "audio", "document", "gif", "sticker", "location", "voice"]).default("text"),
  attachments: z.array(attachmentSchema).max(10).default([]),
  location: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
}).refine((value) => value.body || value.attachments.length || value.location, "Message is empty.");

const emojiReactionSchema = z.string().min(1).max(32).refine(
  (value) => /\p{Extended_Pictographic}/u.test(value) && /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\u200d|\ufe0f)+$/u.test(value),
  "Invalid emoji reaction.",
);

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("edit"), body: z.string().trim().min(1).max(4000) }),
  z.object({ action: z.literal("react"), emoji: emojiReactionSchema }),
  z.object({ action: z.literal("deleteMe") }),
  z.object({ action: z.literal("deleteEveryone") }),
]);

function serialize(message: Record<string, unknown>, viewerId: string) {
  const deletedForEveryone = message.deletedForEveryone === true;
  return {
    id: String(message._id), senderId: message.senderId, recipientId: message.recipientId,
    body: deletedForEveryone ? "This message was deleted" : message.body,
    type: deletedForEveryone ? "text" : message.type ?? "text",
    attachments: deletedForEveryone ? [] : message.attachments ?? [], location: deletedForEveryone ? undefined : message.location,
    status: message.status ?? "sent", reactions: message.reactions ?? {}, editedAt: message.editedAt,
    deletedForEveryone, createdAt: message.createdAt, mine: message.senderId === viewerId,
  };
}

export async function createMessage(payload: unknown) {
  const current = await requireApprovedAccount();
  const parsed = messageSchema.safeParse(payload);
  if (!parsed.success) throw new Response("Invalid message.", { status: 400 });
  const { db, pairId } = await requireFriendship(current.id, parsed.data.recipientId);
  const document = { conversationId: pairId, senderId: current.id, ...parsed.data, status: "sent", reactions: {}, deletedFor: [], createdAt: new Date() };
  const result = await db.collection("messages").insertOne(document);
  return serialize({ _id: result.insertedId, ...document }, current.id);
}

export async function listMessages(otherUserId: string) {
  const current = await requireApprovedAccount();
  const { db, pairId } = await requireFriendship(current.id, otherUserId);
  const account = await db.collection("users").findOne({ _id: new ObjectId(current.id) }, { projection: { readReceipts: 1 } });
  if (account?.readReceipts !== false) await db.collection("messages").updateMany({ conversationId: pairId, recipientId: current.id, status: { $ne: "read" } }, { $set: { status: "read", readAt: new Date() } });
  const messages = await db.collection("messages").find({ conversationId: pairId, deletedFor: { $ne: current.id } }).sort({ createdAt: 1 }).limit(300).toArray();
  return messages.map((message) => serialize(message, current.id));
}

export async function listConversationSummaries() {
  const current = await requireApprovedAccount();
  const { getDatabase } = await import("@/lib/mongodb");
  const db = await getDatabase();
  const conversations = await db.collection("messages").aggregate([
    { $match: { $or: [{ senderId: current.id }, { recipientId: current.id }] } },
    { $sort: { createdAt: -1 } },
    { $group: {
      _id: "$conversationId",
      lastMessage: { $first: "$body" },
      lastMessageAt: { $first: "$createdAt" },
      unreadCount: { $sum: { $cond: [{ $and: [{ $eq: ["$recipientId", current.id] }, { $ne: ["$status", "read"] }, { $ne: ["$deletedForEveryone", true] }, { $not: [{ $in: [current.id, { $ifNull: ["$deletedFor", []] }] }] }] }, 1, 0] } },
    } },
  ]).toArray();
  return conversations.map((conversation) => ({ conversationId: String(conversation._id), lastMessage: String(conversation.lastMessage ?? ""), lastMessageAt: conversation.lastMessageAt, unreadCount: Number(conversation.unreadCount ?? 0) }));
}

export async function deleteConversation(otherUserId: string) {
  const current = await requireApprovedAccount();
  const { db, pairId } = await requireFriendship(current.id, otherUserId);
  await Promise.all([
    db.collection("messages").deleteMany({ conversationId: pairId }),
    db.collection("friendRequests").deleteMany({ pairId }),
    db.collection("calls").deleteMany({ $or: [{ callerId: current.id, recipientId: otherUserId }, { callerId: otherUserId, recipientId: current.id }, { userId: current.id, peerId: otherUserId }, { userId: otherUserId, peerId: current.id }] }),
    db.collection("users").updateOne({ _id: new ObjectId(current.id) }, { $addToSet: { hiddenContacts: otherUserId } }),
    db.collection("users").updateOne({ _id: new ObjectId(otherUserId) }, { $addToSet: { hiddenContacts: current.id } }),
  ]);
}

export async function updateMessage(messageId: string, payload: unknown) {
  const current = await requireApprovedAccount();
  if (!ObjectId.isValid(messageId)) throw new Response("Invalid message.", { status: 400 });
  const parsed = actionSchema.safeParse(payload);
  if (!parsed.success) throw new Response("Invalid action.", { status: 400 });
  const db = (await requireFriendshipForMessage(messageId, current.id)).db;
  const id = new ObjectId(messageId);
  if (parsed.data.action === "edit") {
    const result = await db.collection("messages").updateOne({ _id: id, senderId: current.id, deletedForEveryone: { $ne: true } }, { $set: { body: parsed.data.body, editedAt: new Date() } });
    if (!result.matchedCount) throw new Response("Only your message can be edited.", { status: 403 });
  } else if (parsed.data.action === "deleteMe") {
    await db.collection("messages").updateOne({ _id: id }, { $addToSet: { deletedFor: current.id } });
  } else if (parsed.data.action === "deleteEveryone") {
    const result = await db.collection("messages").updateOne({ _id: id, senderId: current.id }, { $set: { deletedForEveryone: true, deletedAt: new Date() } });
    if (!result.matchedCount) throw new Response("Only your message can be deleted for everyone.", { status: 403 });
  } else {
    const message = await db.collection("messages").findOne({ _id: id });
    const reactions = (message?.reactions as Record<string, string[]> | undefined) ?? {};
    for (const users of Object.values(reactions)) {
      const index = users.indexOf(current.id);
      if (index >= 0) users.splice(index, 1);
    }
    const users = reactions[parsed.data.emoji] ?? [];
    reactions[parsed.data.emoji] = users.includes(current.id) ? users.filter((id) => id !== current.id) : [...users, current.id];
    await db.collection("messages").updateOne({ _id: id }, { $set: { reactions } });
  }
  const updated = await db.collection("messages").findOne({ _id: id });
  return updated ? serialize(updated, current.id) : null;
}

async function requireFriendshipForMessage(messageId: string, currentId: string) {
  const { getDatabase } = await import("@/lib/mongodb");
  const db = await getDatabase();
  const message = await db.collection("messages").findOne({ _id: new ObjectId(messageId), $or: [{ senderId: currentId }, { recipientId: currentId }] });
  if (!message) throw new Response("Message not found.", { status: 404 });
  await requireFriendship(currentId, message.senderId === currentId ? message.recipientId : message.senderId);
  return { db, message };
}
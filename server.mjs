import { createServer } from "node:http";
import next from "next";
import { jwtVerify } from "jose";
import { MongoClient, ObjectId } from "mongodb";
import { Server } from "socket.io";

const port = Number(process.env.PORT ?? 3000);
const dev = process.env.NODE_ENV !== "production" && process.env.npm_lifecycle_event !== "start";
const rawHostname = process.env.HOSTNAME ?? (dev ? "localhost" : "0.0.0.0");
const hostname = rawHostname.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
let mongoClientPromise;

function getDatabase() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set.");
  mongoClientPromise ??= new MongoClient(process.env.MONGODB_URI).connect();
  return mongoClientPromise.then((client) => client.db(process.env.MONGODB_DB ?? "pairly"));
}

async function verifySession(token) {
  if (!token || !process.env.AUTH_SECRET) return null;
  try {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return { id: String(payload.id), name: String(payload.name) };
  } catch {
    return null;
  }
}

async function startServer() {
  await app.prepare();
  const httpServer = createServer((request, response) => handle(request, response));
  const io = new Server(httpServer);
  const onlineUsers = new Map();

  io.use(async (socket, nextSocket) => {
    const token = socket.handshake.headers.cookie
      ?.split(";")
      .map((part) => part.trim().split("="))
      .find(([name]) => name === "pairly_session")?.[1];
    const user = await verifySession(token);
    if (!user) return nextSocket(new Error("Unauthorized"));
    const db = await getDatabase();
    const account = ObjectId.isValid(user.id) ? await db.collection("users").findOne({ _id: new ObjectId(user.id) }) : null;
    if (!account || (account.role !== "admin" && account.approved !== true)) return nextSocket(new Error("Approval required"));
    socket.data.user = user;
    nextSocket();
  });

  io.on("connection", (socket) => {
    const user = socket.data.user;
    socket.join(user.id);
    onlineUsers.set(user.id, (onlineUsers.get(user.id) ?? 0) + 1);
    io.emit("presence:update", { userId: user.id, online: true });

    socket.on("message:new", async (message) => {
      if (message?.senderId === user.id && message?.recipientId && await areFriends(user.id, message.recipientId)) {
        io.to(message.recipientId).emit("message:new", message);
        io.to(user.id).emit("message:status", { messageId: message.id, status: onlineUsers.has(message.recipientId) ? "delivered" : "sent" });
        if (onlineUsers.has(message.recipientId)) {
          const db = await getDatabase();
          await db.collection("messages").updateOne({ _id: new ObjectId(message.id) }, { $set: { status: "delivered", deliveredAt: new Date() } });
        }
      }
    });

    socket.on("message:update", async (payload) => {
      if (payload?.targetId && await areFriends(user.id, payload.targetId)) io.to(payload.targetId).emit("message:update", payload.message);
    });

    socket.on("message:read", async (payload) => {
      if (!payload?.targetId || !await areFriends(user.id, payload.targetId)) return;
      const db = await getDatabase();
      const account = await db.collection("users").findOne({ _id: new ObjectId(user.id) }, { projection: { readReceipts: 1 } });
      if (account?.readReceipts === false) return;
      const pairId = [user.id, payload.targetId].sort().join(":");
      await db.collection("messages").updateMany({ conversationId: pairId, senderId: payload.targetId, status: { $ne: "read" } }, { $set: { status: "read", readAt: new Date() } });
      io.to(payload.targetId).emit("message:read", { readerId: user.id });
    });

    socket.on("conversation:delete", async (payload) => {
      if (payload?.targetId && await areFriends(user.id, payload.targetId)) io.to(payload.targetId).emit("conversation:delete", { userId: user.id });
    });

    for (const event of ["typing:start", "typing:stop", "recording:start", "recording:stop"]) {
      socket.on(event, async (payload) => {
        if (payload?.targetId && await areFriends(user.id, payload.targetId)) io.to(payload.targetId).emit(event, { userId: user.id, name: user.name });
      });
    }

    for (const event of ["call:offer", "call:answer", "call:ice", "call:restart", "call:end"]) {
      socket.on(event, async (payload) => {
        if (!payload?.targetId || !await areFriends(user.id, payload.targetId)) return;
        io.to(payload.targetId).emit(event, {
          ...payload,
          targetId: undefined,
          from: { id: user.id, name: user.name },
        });
      });
    }

    socket.on("disconnect", async () => {
      const remaining = (onlineUsers.get(user.id) ?? 1) - 1;
      if (remaining > 0) return onlineUsers.set(user.id, remaining);
      onlineUsers.delete(user.id);
      const lastSeen = new Date();
      const db = await getDatabase();
      await db.collection("users").updateOne({ _id: new ObjectId(user.id) }, { $set: { lastSeen } });
      io.emit("presence:update", { userId: user.id, online: false, lastSeen });
    });
  });

  httpServer.listen(port, hostname, () => console.log(`Pairly ready at http://${hostname}:${port}`));
}

async function areFriends(firstId, secondId) {
  const db = await getDatabase();
  const pairId = [firstId, secondId].sort().join(":");
  if (!ObjectId.isValid(firstId) || !ObjectId.isValid(secondId)) return false;
  const [friendship, approvedUsers] = await Promise.all([
    db.collection("friendRequests").findOne({ pairId, status: "accepted" }),
    db.collection("users").countDocuments({ _id: { $in: [new ObjectId(firstId), new ObjectId(secondId)] }, approved: true }),
  ]);
  return Boolean(friendship) && approvedUsers === 2;
}

startServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
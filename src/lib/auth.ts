import { jwtVerify, SignJWT } from "jose";
import { ObjectId } from "mongodb";
import { cookies } from "next/headers";
import { getDatabase } from "@/lib/mongodb";

export const SESSION_COOKIE = "pairly_session";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
};

export type AccountUser = SessionUser & {
  role: "admin" | "user";
  approved: boolean;
};

function getSecret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set. Add it to .env.local.");
  return new TextEncoder().encode(value);
}

export async function createSessionToken(user: SessionUser) {
  return new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifySessionToken(token?: string): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      id: String(payload.id),
      name: String(payload.name),
      email: String(payload.email),
    };
  } catch {
    return null;
  }
}

export async function getSessionUser() {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function getCurrentAccount(): Promise<AccountUser | null> {
  const session = await getSessionUser();
  if (!session || !ObjectId.isValid(session.id)) return null;
  const db = await getDatabase();
  const account = await db.collection("users").findOne({ _id: new ObjectId(session.id) });
  if (!account) return null;
  const role = account.role === "admin" || account.email === process.env.ADMIN_EMAIL ? "admin" : "user";
  return {
    id: account._id.toString(),
    name: String(account.name),
    email: String(account.email),
    role,
    approved: role === "admin" || account.approved === true,
  };
}

export function sessionCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}
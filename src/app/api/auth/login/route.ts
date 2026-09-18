import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSessionToken, sessionCookie } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
  }

  const db = await getDatabase();
  const account = await db.collection("users").findOne({ email: parsed.data.email });
  if (!account || !(await bcrypt.compare(parsed.data.password, String(account.passwordHash)))) {
    return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  }

  const role = account.role === "admin" || account.email === process.env.ADMIN_EMAIL ? "admin" : "user";
  const user = {
    id: account._id.toString(),
    name: String(account.name),
    email: String(account.email),
    role,
    approved: role === "admin" || account.approved === true,
  };
  const response = NextResponse.json({ user });
  response.cookies.set(sessionCookie(await createSessionToken(user)));
  return response;
}
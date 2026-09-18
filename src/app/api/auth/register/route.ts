import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSessionToken, sessionCookie } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";

const schema = z.object({
  name: z.string().trim().min(2).max(40),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(72),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Please check your details." }, { status: 400 });
    }

    const db = await getDatabase();
    const existing = await db.collection("users").findOne({ email: parsed.data.email });
    if (existing) {
      return NextResponse.json({ error: "An account already exists with this email." }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const role = parsed.data.email === process.env.ADMIN_EMAIL ? "admin" : "user";
    const approved = role === "admin";
    const result = await db.collection("users").insertOne({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role,
      approved,
      createdAt: new Date(),
    });
    const user = { id: result.insertedId.toString(), name: parsed.data.name, email: parsed.data.email, role, approved };
    const response = NextResponse.json({ user }, { status: 201 });
    response.cookies.set(sessionCookie(await createSessionToken(user)));
    return response;
  } catch (error) {
    console.error("Registration failed:", error);
    const configurationError = error instanceof Error &&
      (error.message.includes("MONGODB_URI") || error.message.includes("AUTH_SECRET"));
    return NextResponse.json(
      { error: configurationError ? "Server setup is incomplete. Add MongoDB and auth settings." : "Account creation failed. Please try again." },
      { status: 500 },
    );
  }
}
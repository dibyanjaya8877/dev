import { apiError } from "@/backend/access";
import { createCall, listCalls } from "@/backend/calls";

export async function GET() {
  try { return Response.json({ calls: await listCalls() }); } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try { return Response.json({ call: await createCall(await request.json()) }, { status: 201 }); } catch (error) { return apiError(error); }
}
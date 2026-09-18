import { apiError } from "@/backend/access";
import { createMessage } from "@/backend/messages";

export async function POST(request: Request) {
  try { return Response.json({ message: await createMessage(await request.json()) }, { status: 201 }); }
  catch (error) { return apiError(error); }
}
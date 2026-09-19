import { apiError } from "@/backend/access";
import { createMessage, listConversationSummaries } from "@/backend/messages";

export async function GET() {
  try { return Response.json({ conversations: await listConversationSummaries() }); }
  catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try { return Response.json({ message: await createMessage(await request.json()) }, { status: 201 }); }
  catch (error) { return apiError(error); }
}
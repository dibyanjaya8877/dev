import { apiError } from "@/backend/access";
import { listMessages } from "@/backend/messages";

export async function GET(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  try { const { userId } = await context.params; return Response.json({ messages: await listMessages(userId) }); }
  catch (error) { return apiError(error); }
}
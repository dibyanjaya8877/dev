import { apiError } from "@/backend/access";
import { deleteConversation, listMessages } from "@/backend/messages";

export async function GET(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  try { const { userId } = await context.params; return Response.json({ messages: await listMessages(userId) }); }
  catch (error) { return apiError(error); }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const { userId } = await context.params;
    await deleteConversation(userId);
    return new Response(null, { status: 204 });
  } catch (error) { return apiError(error); }
}
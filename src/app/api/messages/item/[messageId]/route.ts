import { apiError } from "@/backend/access";
import { updateMessage } from "@/backend/messages";

export async function PATCH(request: Request, context: { params: Promise<{ messageId: string }> }) {
  try {
    const { messageId } = await context.params;
    return Response.json({ message: await updateMessage(messageId, await request.json()) });
  } catch (error) { return apiError(error); }
}
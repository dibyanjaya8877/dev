import { apiError } from "@/backend/access";
import { finishCall } from "@/backend/calls";

export async function PATCH(request: Request, context: { params: Promise<{ callId: string }> }) {
  try { const { callId } = await context.params; await finishCall(callId, await request.json()); return Response.json({ ok: true }); }
  catch (error) { return apiError(error); }
}
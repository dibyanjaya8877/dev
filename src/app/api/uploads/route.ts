import { apiError } from "@/backend/access";
import { saveUploads } from "@/backend/uploads";

export async function POST(request: Request) {
  try { return Response.json({ attachments: await saveUploads(await request.formData()) }, { status: 201 }); }
  catch (error) { return apiError(error); }
}
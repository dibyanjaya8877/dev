import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { requireApprovedAccount } from "@/backend/access";

const allowedTypes = /^(image|video|audio)\//;

export async function saveUploads(formData: FormData) {
  await requireApprovedAccount();
  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File);
  if (!files.length || files.length > 10) throw new Response("Choose between 1 and 10 files.", { status: 400 });
  const directory = path.join(process.cwd(), "public", "uploads");
  await mkdir(directory, { recursive: true });
  return Promise.all(files.map(async (file) => {
    if (file.size > 20 * 1024 * 1024) throw new Response(`${file.name} is larger than 20 MB.`, { status: 413 });
    const extension = path.extname(file.name).replace(/[^.a-zA-Z0-9]/g, "").slice(0, 10);
    const filename = `${randomUUID()}${extension}`;
    await writeFile(path.join(directory, filename), Buffer.from(await file.arrayBuffer()));
    return { url: `/uploads/${filename}`, name: file.name.slice(0, 240), mime: file.type || "application/octet-stream", size: file.size, kind: allowedTypes.test(file.type) ? file.type.split("/")[0] : "document" };
  }));
}
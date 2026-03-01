import { NextRequest } from "next/server";
import { createSupabaseServer } from "../../../lib/supabase/server";
import { getOrCreateTenant } from "@exoskull/store";
import { insertMemory, insertBlob } from "@exoskull/store";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenant = await getOrCreateTenant(user.id, user.email);
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    // Read file content
    const buffer = Buffer.from(await file.arrayBuffer());
    const text = extractText(file.name, file.type, buffer);

    // Store blob metadata
    const blob = await insertBlob({
      tenant_id: tenant.id,
      kind: getKind(file.type),
      filename: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      storage_path: `uploads/${tenant.id}/${Date.now()}_${file.name}`,
      processing_status: "completed",
      extracted_text: text?.slice(0, 50_000) || null,
      metadata: {},
    });

    // Store in memory for RAG search
    if (text && text.length > 10) {
      await insertMemory({
        tenant_id: tenant.id,
        kind: "document",
        content: text.slice(0, 10_000),
        embedding: null,
        importance: 0.6,
        source: { filename: file.name, blob_id: blob.id, type: "upload" },
        metadata: { mime_type: file.type, size_bytes: file.size },
        expires_at: null,
      });
    }

    return Response.json({
      id: blob.id,
      filename: file.name,
      size: file.size,
      extracted_chars: text?.length || 0,
    });
  } catch (err) {
    console.error("[upload] Error:", err);
    return Response.json({ error: "Upload failed" }, { status: 500 });
  }
}

function getKind(mimeType: string): "document" | "audio" | "image" | "export" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.includes("pdf") || mimeType.includes("document") || mimeType.includes("text"))
    return "document";
  return "document";
}

function extractText(filename: string, mimeType: string, buffer: Buffer): string | null {
  // Plain text files
  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml" ||
    filename.endsWith(".md") ||
    filename.endsWith(".csv") ||
    filename.endsWith(".txt") ||
    filename.endsWith(".json")
  ) {
    return buffer.toString("utf-8");
  }

  // For PDF, DOCX, etc. — return null for now (would need pdf-parse, mammoth)
  // The blob is stored with extracted_text=null, can be processed later
  return null;
}

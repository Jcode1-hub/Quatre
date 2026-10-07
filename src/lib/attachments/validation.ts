import type { AttachmentKind } from "./types";

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const textTypes = new Set(["text/plain", "text/markdown", "text/csv", "application/json", "application/xml"]);
const codeExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".c", ".cpp", ".html", ".css", ".sql", ".sh"]);

export function classifyAttachment(file: Pick<File, "name" | "type" | "size">): { kind: AttachmentKind } | { error: string } {
  if (file.size <= 0) return { error: "This file is empty." };
  if (file.size > MAX_ATTACHMENT_BYTES) return { error: "Files must be 20 MB or smaller." };
  const mediaType = file.type.toLowerCase();
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (imageTypes.has(mediaType)) return { kind: "image" };
  if (mediaType === "application/pdf" || extension === ".pdf") return { kind: "pdf" };
  if (textTypes.has(mediaType)) return { kind: "text" };
  if (codeExtensions.has(extension)) return { kind: "code" };
  return { error: "This file type is not supported." };
}

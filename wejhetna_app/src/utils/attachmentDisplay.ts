/** Heuristic: treat URL as image unless it clearly ends with a document extension. */

const DOCUMENT_EXT = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|rtf|zip)(\?|#|$)/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|bmp|svg)(\?|#|$)/i;

export function isImageAttachmentUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  const path = url.split("?")[0].split("#")[0];
  if (DOCUMENT_EXT.test(path)) return false;
  if (IMAGE_EXT.test(path)) return true;
  // Legacy S3 keys without extension (hex uploads) — assume image
  return true;
}

export function attachmentFileLabel(url: string): string {
  const path = url.split("?")[0].split("#")[0];
  const name = path.split("/").pop() || "";
  try {
    return decodeURIComponent(name) || "document";
  } catch {
    return name || "document";
  }
}

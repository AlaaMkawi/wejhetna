import { API_BASE_URL } from "../../config";
import ReactNativeBlobUtil from "react-native-blob-util";

export const S3_UPLOAD_HELPER_VERSION = "2026-04-01.1";
try {
  // Log once on module load so we can confirm the bundle includes this file
  console.warn("[S3_UPLOAD] module loaded", { version: S3_UPLOAD_HELPER_VERSION, API_BASE_URL });
} catch {
  // ignore
}

type PickerAssetLike = {
  uri: string;
  fileName?: string | null;
  type?: string | null;
  base64?: string | null;
};

type PresignResponse = {
  upload_url: string;
  file_url: string;
  headers?: Record<string, string>;
  content_type?: string;
  method?: string;
};

function normalizeHeaders(headers?: Record<string, string> | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  for (const [k, v] of Object.entries(headers)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function pickContentType(presignJson: PresignResponse, asset: PickerAssetLike): string {
  const fromHeaders =
    presignJson.headers?.["Content-Type"] ||
    (presignJson.headers as any)?.["content-type"] ||
    presignJson.content_type;
  return (fromHeaders || asset.type || "application/octet-stream").trim();
}

function logStage(stage: string, extra?: Record<string, any>) {
  // Keep logs very explicit for debugging on-device
  try {
    console.log(`[S3_UPLOAD] ${stage}`, extra ?? "");
  } catch {
    // ignore logging failures
  }
}

async function resolveUploadPathFromAsset(asset: PickerAssetLike): Promise<string> {
  // Goal: return a real filesystem path (no Blob/ArrayBuffer) so we can upload via native code.
  // - If we get file:// -> strip scheme
  // - If we get content:// -> try contentUriToPath; if that fails, write base64 to temp file
  const uri = asset.uri;
  const isFileUri = /^file:\/\//i.test(uri);
  const isContentUri = /^content:\/\//i.test(uri);

  if (isFileUri) {
    const path = uri.replace(/^file:\/\//i, "");
    logStage("file:path:file_uri", { path });
    return path;
  }

  if (isContentUri) {
    try {
      const path = await (ReactNativeBlobUtil as any).android.contentUriToPath(uri);
      if (path && typeof path === "string") {
        logStage("file:path:content_uri_to_path", { path });
        return path;
      }
    } catch (e: any) {
      logStage("file:path:content_uri_to_path_failed", { message: e?.message || String(e) });
    }
  }

  // Last resort: base64 -> write to cache, return temp path
  if (asset.base64) {
    const cacheDir = (ReactNativeBlobUtil as any).fs.dirs.CacheDir;
    const ext = (asset.fileName && asset.fileName.includes(".")) ? asset.fileName.split(".").pop() : "bin";
    const tempPath = `${cacheDir}/wejhetna_upload_${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`;
    logStage("file:path:base64_to_temp", { tempPath, base64Length: asset.base64.length });
    await (ReactNativeBlobUtil as any).fs.writeFile(tempPath, asset.base64, "base64");
    return tempPath;
  }

  throw new Error("Failed to resolve local file path for upload (no base64 available).");
}

async function putFileViaBlobUtil(
  url: string,
  filePath: string,
  headers: Record<string, string>
): Promise<{ status: number; responseText: string }> {
  try {
    const u = new URL(url);
    logStage("put:blobutil:open", {
      host: (u as any).host || (u as any).hostname,
      protocol: (u as any).protocol,
      urlLength: url.length,
    });
  } catch {
    logStage("put:blobutil:open", { host: "invalid_url", urlLength: url.length });
  }

  logStage("put:blobutil:send", {
    contentType: headers["Content-Type"],
    filePath,
  });

  const resp = await (ReactNativeBlobUtil as any).fetch("PUT", url, headers, (ReactNativeBlobUtil as any).wrap(filePath));
  const status = resp?.info?.().status ?? resp?.respInfo?.status ?? resp?.status ?? 0;
  let responseText = "";
  try {
    responseText = await resp.text();
  } catch {
    responseText = "";
  }
  return { status, responseText };
}

/**
 * New backend flow:
 * 1) POST /files/upload with multipart (metadata)
 * 2) PUT binary directly to upload_url with returned headers
 * 3) return file_url only if PUT succeeded
 */
export async function uploadAssetToS3Presigned(asset: PickerAssetLike): Promise<string> {
  if (!asset?.uri) {
    throw new Error("Missing asset uri");
  }

  let stage = "init";
  try {
    console.warn("[S3_UPLOAD] function called", {
      version: S3_UPLOAD_HELPER_VERSION,
      uri: asset.uri,
      fileName: asset.fileName,
      type: asset.type,
    });
  } catch {
    // ignore
  }
  const formData = new FormData();
  formData.append(
    "file",
    {
      uri: asset.uri,
      name: asset.fileName || "upload.jpg",
      type: asset.type || "image/jpeg",
    } as any
  );

  try {
    stage = "presign:before_request";
    logStage(stage, { apiBaseUrl: API_BASE_URL, uri: asset.uri, fileName: asset.fileName, type: asset.type });
    const presignRes = await fetch(`${API_BASE_URL}/files/upload`, {
      method: "POST",
      body: formData,
    });

    stage = "presign:after_response";
    logStage(stage, { status: presignRes.status });

    const presignRaw = await presignRes.text().catch(() => "");
    let presignJson: PresignResponse | null = null;
    try {
      presignJson = presignRaw ? (JSON.parse(presignRaw) as PresignResponse) : null;
    } catch {
      presignJson = null;
    }

    if (!presignRes.ok) {
      stage = "presign:failed";
      const msg =
        (presignJson as any)?.detail ||
        `Presign failed (HTTP ${presignRes.status})${presignRaw ? `: ${presignRaw}` : ""}`;
      logStage(stage, { message: msg });
      throw new Error(msg);
    }

    if (!presignJson?.upload_url || !presignJson?.file_url) {
      stage = "presign:invalid_payload";
      logStage(stage, { presignJson });
      throw new Error("Presign succeeded but upload_url/file_url is missing");
    }

    stage = "file:before_resolve_path";
    logStage(stage, { uri: asset.uri, hasBase64: !!asset.base64 });
    const filePath = await resolveUploadPathFromAsset(asset);
    stage = "file:after_resolve_path";
    logStage(stage, { filePath });

    const putHeaders = normalizeHeaders(presignJson.headers);
    const contentType = pickContentType(presignJson, asset);
    // Ensure Content-Type matches what backend signed
    putHeaders["Content-Type"] = contentType;
    stage = "put:before_request";
    logStage(stage, {
      uploadHost: (() => {
        try {
          return (new URL(presignJson.upload_url) as any).host;
        } catch {
          return "unknown";
        }
      })(),
      contentType,
      headersKeys: Object.keys(putHeaders),
    });
    const putOut = await putFileViaBlobUtil(presignJson.upload_url, filePath, putHeaders);
    stage = "put:after_response";
    logStage(stage, { status: putOut.status });

    if (putOut.status < 200 || putOut.status >= 300) {
      stage = "put:failed";
      const msg = `S3 PUT failed (HTTP ${putOut.status})${putOut.responseText ? `: ${putOut.responseText}` : ""}`;
      logStage(stage, { message: msg });
      throw new Error(msg);
    }

    stage = "done";
    logStage(stage, { file_url: presignJson.file_url });
    return presignJson.file_url;
  } catch (e: any) {
    const msg = e?.message || String(e);
    logStage("catch", { stage, message: msg });
    throw new Error(`${msg} (stage=${stage})`);
  }
}


// Cloudflare R2 media storage (S3-compatible API, signed with aws4fetch).
//
// Replaces the old write-to-public/uploads approach: Next.js standalone
// snapshots `public/` at server start, so files written at runtime 404 until
// the next redeploy. R2 also has zero egress fees, which is what matters as
// media traffic grows.

import { AwsClient } from "aws4fetch";

/**
 * The R2 environment variables are missing. Kept distinct from an upload R2
 * refused, because the fix is a deploy-config change rather than a retry.
 */
export class StorageConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageConfigError";
  }
}

/** R2 was reachable and authenticated the request but refused the object. */
export class StorageUploadError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`R2 upload failed (${status}): ${detail}`);
    this.name = "StorageUploadError";
  }
}

const REQUIRED_VARS = [
  "R2_ENDPOINT",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
] as const;

type R2Var = (typeof REQUIRED_VARS)[number];

interface R2Config {
  endpoint: string;
  bucket: string;
  publicBaseUrl: string;
  client: AwsClient;
}

let cached: R2Config | null = null;

/** Reads the R2 environment, naming every variable that is absent. */
function readR2Env(): Record<R2Var, string> {
  const found = {} as Record<R2Var, string>;
  const missing: R2Var[] = [];

  for (const name of REQUIRED_VARS) {
    const value = process.env[name];
    if (value) found[name] = value;
    else missing.push(name);
  }

  // Name the missing variables: "storage is not configured" on its own sends
  // whoever is on call reading source to find out which one to set.
  if (missing.length > 0) {
    throw new StorageConfigError(`R2 storage is not configured. Missing: ${missing.join(", ")}.`);
  }
  return found;
}

function getR2(): R2Config {
  if (cached) return cached;

  const env = readR2Env();
  cached = {
    endpoint: env.R2_ENDPOINT.replace(/\/$/, ""),
    bucket: env.R2_BUCKET,
    publicBaseUrl: env.R2_PUBLIC_BASE_URL.replace(/\/$/, ""),
    client: new AwsClient({
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      service: "s3",
      region: "auto",
    }),
  };
  return cached;
}

/**
 * Upload a file to R2 and return its public URL.
 *
 * @param key object key, e.g. "images/<uuid>.jpg" — becomes the URL path
 */
export async function uploadToStorage(
  key: string,
  body: ArrayBuffer,
  contentType: string,
): Promise<string> {
  const r2 = getR2();

  const response = await r2.client.fetch(`${r2.endpoint}/${r2.bucket}/${key}`, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      // R2 has no chunked-upload support and answers 411 MissingContentLength
      // without this. undici streams any body at or above its 64 KiB
      // high-water mark, and a streamed body loses the Content-Length fetch
      // would otherwise derive, so send it explicitly. Omitting it fails only
      // above that mark, which is why small test images uploaded fine and
      // every real photo did not.
      "Content-Length": String(body.byteLength),
    },
    body,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new StorageUploadError(response.status, detail.slice(0, 200));
  }

  return `${r2.publicBaseUrl}/${key}`;
}

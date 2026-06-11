// Cloudflare R2 media storage (S3-compatible API, signed with aws4fetch).
//
// Replaces the old write-to-public/uploads approach: Next.js standalone
// snapshots `public/` at server start, so files written at runtime 404 until
// the next redeploy. R2 also has zero egress fees, which is what matters as
// media traffic grows.

import { AwsClient } from "aws4fetch";

interface R2Config {
  endpoint: string;
  bucket: string;
  publicBaseUrl: string;
  client: AwsClient;
}

let cached: R2Config | null = null;

function getR2(): R2Config {
  if (cached) return cached;

  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL;

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    throw new Error(
      "R2 storage is not configured — set R2_ENDPOINT, R2_ACCESS_KEY_ID, " +
        "R2_SECRET_ACCESS_KEY, R2_BUCKET, and R2_PUBLIC_BASE_URL.",
    );
  }

  cached = {
    endpoint: endpoint.replace(/\/$/, ""),
    bucket,
    publicBaseUrl: publicBaseUrl.replace(/\/$/, ""),
    client: new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" }),
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
    headers: { "Content-Type": contentType },
    body,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`R2 upload failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  return `${r2.publicBaseUrl}/${key}`;
}

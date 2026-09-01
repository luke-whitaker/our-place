// Dump the production database and store it in a PRIVATE R2 bucket.
//
// Railway's scheduled backups and PITR are Pro-plan features, so this covers
// the same ground on the current plan: a nightly `pg_dump` pushed to object
// storage, with old copies pruned so the bucket cannot grow without bound.
//
// The dump contains real names, emails, phone numbers, and password hashes,
// so it must NOT land in the media bucket (R2_BUCKET), which is served
// publicly. This script refuses to run if the two buckets match.
//
// Usage: npm run db:backup   (CI passes the prod DATABASE_URL as a secret;
// locally it reads .env.local, which points at the dev database on purpose)

import { config } from "dotenv";
import { spawn } from "node:child_process";
import { AwsClient } from "aws4fetch";

config({ path: ".env.local" });

const RETENTION_DAYS = 30;
const KEY_PREFIX = "db-backups/";
// S3 list responses cap at 1000 keys per page; this bounds the paging loop.
const MAX_LIST_PAGES = 20;

interface BackupConfig {
  endpoint: string;
  bucket: string;
  databaseUrl: string;
  client: AwsClient;
}

function loadConfig(): BackupConfig {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_BACKUP_ACCESS_KEY_ID ?? process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.R2_BACKUP_SECRET_ACCESS_KEY ?? process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BACKUP_BUCKET;
  const databaseUrl = process.env.DATABASE_URL;

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !databaseUrl) {
    throw new Error(
      "Backup is not configured — set R2_ENDPOINT, R2_BACKUP_BUCKET, DATABASE_URL, " +
        "and either R2_BACKUP_ACCESS_KEY_ID/R2_BACKUP_SECRET_ACCESS_KEY or the R2_* pair.",
    );
  }

  // The media bucket is public. A dump there would be world-readable.
  if (process.env.R2_BUCKET && bucket === process.env.R2_BUCKET) {
    throw new Error(
      `Refusing to write backups to "${bucket}": that is the public media bucket. ` +
        "Create a separate private bucket and set R2_BACKUP_BUCKET to it.",
    );
  }

  return {
    endpoint: endpoint.replace(/\/$/, ""),
    bucket,
    databaseUrl,
    client: new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" }),
  };
}

// Streams pg_dump's stdout into memory. Fine at this scale (a ~116 MB
// database compresses to well under Node's buffer limits); revisit with a
// streaming upload if the database grows past a couple of gigabytes.
function runPgDump(databaseUrl: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // -Fc is pg_dump's compressed custom format, restored with pg_restore.
    const child = spawn("pg_dump", ["--format=custom", "--no-owner", "--no-acl", databaseUrl], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.stderr.on("data", (c: Buffer) => errors.push(c));

    child.on("error", (err) =>
      reject(new Error(`Could not run pg_dump (is postgresql-client installed?): ${err.message}`)),
    );
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(`pg_dump exited ${code}: ${Buffer.concat(errors).toString().slice(0, 500)}`),
        );
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}

async function uploadBackup(cfg: BackupConfig, key: string, body: Buffer): Promise<void> {
  const response = await cfg.client.fetch(`${cfg.endpoint}/${cfg.bucket}/${key}`, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: new Uint8Array(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Backup upload failed (${response.status}): ${detail.slice(0, 200)}`);
  }
}

// Reads back what we just wrote. An upload that reports 200 but stores the
// wrong number of bytes is the failure mode a backup must never hide.
async function verifyUpload(cfg: BackupConfig, key: string, expectedBytes: number): Promise<void> {
  const response = await cfg.client.fetch(`${cfg.endpoint}/${cfg.bucket}/${key}`, {
    method: "HEAD",
  });
  if (!response.ok) {
    throw new Error(`Uploaded backup is not readable back (${response.status}).`);
  }
  const stored = Number(response.headers.get("content-length"));
  if (stored !== expectedBytes) {
    throw new Error(`Backup size mismatch: sent ${expectedBytes} bytes, stored ${stored}.`);
  }
}

interface StoredBackup {
  key: string;
  lastModified: Date;
}

// Minimal ListObjectsV2 XML reader. S3's response shape is stable and this
// avoids pulling an XML parser in for one ops script.
function parseListing(xml: string): { items: StoredBackup[]; nextToken: string | null } {
  const items: StoredBackup[] = [];
  for (const block of xml.split("<Contents>").slice(1)) {
    const key = block.match(/<Key>([^<]+)<\/Key>/)?.[1];
    const modified = block.match(/<LastModified>([^<]+)<\/LastModified>/)?.[1];
    if (key && modified) items.push({ key, lastModified: new Date(modified) });
  }
  const nextToken = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1];
  return { items, nextToken: nextToken ?? null };
}

async function listBackups(cfg: BackupConfig): Promise<StoredBackup[]> {
  const all: StoredBackup[] = [];
  let token: string | null = null;

  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const url = new URL(`${cfg.endpoint}/${cfg.bucket}`);
    url.searchParams.set("list-type", "2");
    url.searchParams.set("prefix", KEY_PREFIX);
    if (token) url.searchParams.set("continuation-token", token);

    const response = await cfg.client.fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Could not list existing backups (${response.status}).`);
    }
    const { items, nextToken } = parseListing(await response.text());
    all.push(...items);
    if (!nextToken) return all;
    token = nextToken;
  }
  throw new Error(`Backup listing exceeded ${MAX_LIST_PAGES} pages — refusing to prune blind.`);
}

async function pruneOldBackups(cfg: BackupConfig, keepNewest: string): Promise<number> {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const stale = (await listBackups(cfg)).filter(
    (b) => b.key !== keepNewest && b.lastModified.getTime() < cutoff,
  );

  let deleted = 0;
  for (const backup of stale) {
    const response = await cfg.client.fetch(`${cfg.endpoint}/${cfg.bucket}/${backup.key}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error(`Failed to delete old backup ${backup.key} (${response.status}).`);
    }
    console.log(`  pruned ${backup.key}`);
    deleted++;
  }
  return deleted;
}

async function main() {
  const cfg = loadConfig();

  // Log the host only. The URL carries the password.
  const host = new URL(cfg.databaseUrl).host;
  console.log(`Dumping ${host} -> bucket "${cfg.bucket}"`);

  const dump = await runPgDump(cfg.databaseUrl);
  if (dump.length === 0) {
    throw new Error("pg_dump produced an empty file.");
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const key = `${KEY_PREFIX}ourplace-${stamp}.dump`;

  await uploadBackup(cfg, key, dump);
  await verifyUpload(cfg, key, dump.length);
  console.log(`✓ ${key} (${(dump.length / 1024 / 1024).toFixed(1)} MB) verified`);

  const pruned = await pruneOldBackups(cfg, key);
  console.log(`Done. Kept backups newer than ${RETENTION_DAYS} days; pruned ${pruned}.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

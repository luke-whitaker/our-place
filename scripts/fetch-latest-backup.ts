// Download the newest database backup from the private R2 bucket.
//
// Used by the restore-verification workflow, which proves an archive can
// actually be restored rather than assuming it. Reads the same R2_BACKUP_*
// configuration as scripts/backup-db.ts.
//
// Usage: npx tsx scripts/fetch-latest-backup.ts <output-path>

import { config } from "dotenv";
import { writeFile } from "node:fs/promises";
import { AwsClient } from "aws4fetch";

config({ path: ".env.local" });

const KEY_PREFIX = "db-backups/";

function loadConfig() {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_BACKUP_ACCESS_KEY_ID ?? process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.R2_BACKUP_SECRET_ACCESS_KEY ?? process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BACKUP_BUCKET;

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("Set R2_ENDPOINT, R2_BACKUP_BUCKET, and the R2_BACKUP_* key pair.");
  }

  return {
    endpoint: endpoint.replace(/\/$/, ""),
    bucket,
    client: new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" }),
  };
}

// Keys are timestamped (ourplace-<ISO>.dump), so the lexically greatest key is
// also the newest. That avoids a second round trip for LastModified.
function newestKey(xml: string): string | null {
  const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
  if (keys.length === 0) return null;
  return keys.sort().at(-1) ?? null;
}

async function main() {
  const destination = process.argv[2];
  if (!destination) {
    throw new Error("Pass an output path, e.g. restore-check.dump");
  }

  const cfg = loadConfig();

  const listUrl = new URL(`${cfg.endpoint}/${cfg.bucket}`);
  listUrl.searchParams.set("list-type", "2");
  listUrl.searchParams.set("prefix", KEY_PREFIX);

  const listing = await cfg.client.fetch(listUrl.toString());
  if (!listing.ok) {
    throw new Error(`Could not list backups (${listing.status}).`);
  }

  const key = newestKey(await listing.text());
  if (!key) {
    throw new Error("The bucket holds no backups to verify.");
  }

  const object = await cfg.client.fetch(`${cfg.endpoint}/${cfg.bucket}/${key}`);
  if (!object.ok) {
    throw new Error(`Could not download ${key} (${object.status}).`);
  }

  const body = Buffer.from(await object.arrayBuffer());
  await writeFile(destination, body);
  console.log(`Downloaded ${key} (${body.length} bytes) -> ${destination}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

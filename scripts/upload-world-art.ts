// Upload the local world art (public/world/**) to R2 so production can serve it.
//
// The art packs are gitignored (license: no redistribution), so the prod image
// doesn't contain them — they live in object storage like uploaded media. Keys
// mirror the path under public/, so:
//   public/world/objects/house.png  ->  key "world/objects/house.png"
//   public URL = R2_PUBLIC_BASE_URL + "/world/objects/house.png"
// which is exactly what the engine requests once NEXT_PUBLIC_WORLD_ASSET_BASE is
// set to R2_PUBLIC_BASE_URL.
//
// Usage: npm run world:upload   (reads R2_* from .env.local)

import { config } from "dotenv";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

config({ path: ".env.local" });

const PUBLIC_DIR = path.resolve("public");
const WORLD_DIR = path.join(PUBLIC_DIR, "world");

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

async function main() {
  // Import after dotenv has loaded so storage.ts reads the R2 env.
  const { uploadToStorage } = await import("../src/lib/storage");

  let count = 0;
  for await (const file of walk(WORLD_DIR)) {
    const ext = path.extname(file).toLowerCase();
    const contentType = CONTENT_TYPES[ext];
    if (!contentType) {
      console.warn(`skip (unhandled type): ${path.relative(PUBLIC_DIR, file)}`);
      continue;
    }
    const key = path.relative(PUBLIC_DIR, file).split(path.sep).join("/");
    const buf = await readFile(file);
    const body = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const url = await uploadToStorage(key, body, contentType);
    console.log(`✓ ${key} -> ${url}`);
    count++;
  }
  console.log(`\nUploaded ${count} world art file(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { NextResponse } from "next/server";

// Reports the commit this running instance was built from.
//
// Railway deploys without always writing a GitHub deployment record, so those
// records cannot answer "is my latest push actually live?". Asking the running
// app is the one source of truth that cannot drift from reality. The repo is
// public, so the commit sha is not sensitive; nothing else is exposed here.
//
// Railway injects RAILWAY_GIT_COMMIT_SHA into the service environment. It is
// absent in local development, where "unknown" is the honest answer.

// Read the environment per request rather than baking it in at build time.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? "unknown" });
}

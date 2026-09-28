import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { presenceStreamLimiter } from "@/lib/rate-limit";
import { presenceMoveSchema } from "@/lib/schemas";
import { presenceHub, type PresenceEvent } from "@/lib/presence";
import { checkWorldAccess } from "@/lib/presence-access";

export const runtime = "nodejs";

/** A comment line every 20 s keeps proxies from closing a quiet stream. */
const PING_EVERY_MS = 20_000;
/** Some proxies and browsers hold the first bytes of a response until a
 * kilobyte or two has arrived; an opening comment this long gets past them. */
const OPENING_PAD = `: ${" ".repeat(2048)}\n\n`;

// GET ?world=<id>: a Server-Sent Events stream of everyone else in a world. A
// `snapshot` first, then `update` and `leave` as they happen. The stream ends
// when the client disconnects; EventSource reconnects on its own.
export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const userId = auth.user.userId;

    const limit = presenceStreamLimiter.check(userId);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const world = presenceMoveSchema.shape.world_id.safeParse(
      new URL(request.url).searchParams.get("world"),
    );
    if (!world.success) return NextResponse.json({ error: "Unknown world." }, { status: 400 });
    const worldId = world.data;

    const access = await checkWorldAccess(userId, worldId);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    return openStream(request, userId, worldId);
  } catch (error) {
    console.error("Presence stream error:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

function openStream(request: Request, userId: string, worldId: string): Response {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let ping: ReturnType<typeof setInterval> | null = null;
  let unsubscribe = () => {};
  let closed = false;

  // Idempotent: the client leaving, a failed write, and the stream being
  // cancelled can each arrive first, and each ends up here.
  function close() {
    if (closed) return;
    closed = true;
    if (ping) clearInterval(ping);
    unsubscribe();
    request.signal.removeEventListener("abort", close);
    try {
      controller.close();
    } catch {
      // Already closed or errored by the runtime: nothing left to release.
    }
  }

  // Throws once the connection is gone; the hub drops a subscriber whose
  // send throws, and close() releases the rest.
  function write(text: string) {
    try {
      controller.enqueue(encoder.encode(text));
    } catch (error) {
      close();
      throw error;
    }
  }

  // start() runs synchronously inside the constructor, so `controller` is set
  // before anything below uses it.
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel: close,
  });

  write(OPENING_PAD);
  write("retry: 3000\n\n");
  const result = presenceHub().subscribe({
    userId,
    worldId,
    send: (event: PresenceEvent, data: unknown) =>
      write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
  });
  if (!result.ok) {
    close();
    const message =
      result.reason === "user-limit"
        ? "You have the world open in too many tabs. Close one and try again."
        : "The world is full right now. Try again in a minute.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
  unsubscribe = result.unsubscribe;

  ping = setInterval(() => {
    try {
      write(": ping\n\n");
    } catch {
      // write() already closed the stream; the interval is cleared with it.
    }
  }, PING_EVERY_MS);
  if (request.signal.aborted) close();
  else request.signal.addEventListener("abort", close);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform keeps any compression layer from buffering the stream.
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

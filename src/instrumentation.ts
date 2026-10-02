// Runs once when a server instance starts. The gathering sweep is an
// in-process timer, like the presence hub: this app runs as a single instance.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startGatheringSweep } = await import("@/lib/gathering-sweep");
  startGatheringSweep();
}

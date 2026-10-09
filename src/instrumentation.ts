/** Runs once when the server starts (Node runtime): database migrations and the first administrator. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { start } = await import("./server/bootstrap");
  await start();
}

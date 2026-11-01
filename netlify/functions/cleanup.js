import { createServer, cleanup } from "../lib/server.js";
// Netlify scheduled functions run on published production deployments.
export const config = { schedule: "15 * * * *" };
export default async function () {
  const result = await cleanup(createServer());
  console.info("LITVERSE cleanup", {
    attempted: result.attempted,
    failed: result.failed,
  });
  return new Response(null, { status: result.failed ? 500 : 204 });
}

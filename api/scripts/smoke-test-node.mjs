// Boots the compiled output under plain Node.js and invokes the exact
// handler Vercel calls in production (GET from api/index.ts), rather
// than starting an HTTP server — Vercel never listens on a port, it
// calls this Web-standard Request -> Response function directly.
// Bun's local dev server auto-starts one for convenience, which masks
// Node-only failures (extensionless imports, missing browser globals
// like DOMMatrix) that only surface under Vercel's actual runtime.
import { GET } from "../dist/api/index.js";

const response = await GET(new Request("http://localhost/health"));
if (response.status !== 200) {
  console.error(`Expected 200 from /health, got ${response.status}`);
  process.exit(1);
}

const body = await response.json();
if (body.status !== "ok") {
  console.error(`Expected {status: "ok"}, got ${JSON.stringify(body)}`);
  process.exit(1);
}

console.log("Node.js boot smoke test passed: GET /health -> 200 {status: \"ok\"}");

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const root = new URL("../", import.meta.url);
// The Vite/Vitest resolver accepts extensionless imports that native Node ESM rejects.
// Compile and actually import the endpoint before shipping it to Vercel.
execFileSync(
  process.execPath,
  [
    fileURLToPath(new URL("node_modules/typescript/bin/tsc", root)),
    "--noEmit",
    "false",
    "--outDir",
    "node_modules/.cache/reposita-function-check",
    "--target",
    "ES2020",
    "--module",
    "ESNext",
    "--moduleResolution",
    "Bundler",
    "--skipLibCheck",
    "--esModuleInterop",
    "api/demand.ts",
  ],
  { cwd: fileURLToPath(root), stdio: "inherit" },
);
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.TURNSTILE_SECRET_KEY;
const endpoint = await import(
  new URL("node_modules/.cache/reposita-function-check/api/demand.js", root)
);
const readiness = endpoint.GET();
assert.equal(readiness.status, 200);
assert.deepEqual(await readiness.json(), { enabled: false });
const disabled = await endpoint.POST(
  new Request("https://test.example/api/demand", { method: "POST" }),
);
assert.equal(disabled.status, 503);
console.log(
  "Function Node ESM: importação e bloqueio sem credenciais verificados.",
);

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("..", import.meta.url));
function run(args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, env, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(`Test process exited with code ${code}`)));
  });
}
async function available(url) {
  try { return (await fetch(url, { signal: AbortSignal.timeout(1000) })).ok; }
  catch { return false; }
}

let server;
try {
  await run(["--test", "tests/settings.test.js"]);
  const url = process.env.BASSIFIER_TEST_URL || "http://127.0.0.1:5187";
  if (!process.env.BASSIFIER_TEST_URL && (process.env.CI || !await available(url))) {
    // Own Vite in this process so teardown needs no shell or Windows taskkill.
    const { createServer } = await import("vite");
    server = await createServer({ root: cwd, logLevel: "error",
      server: { host: "127.0.0.1", port: 5187, strictPort: true, open: false } });
    await server.listen();
  }
  await run(["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)],
    { ...process.env, BASSIFIER_TEST_URL: url });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await server?.close();
}

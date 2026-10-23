import { spawn } from "node:child_process";
import { access, rename } from "node:fs/promises";

const api = "src/app/api";
const parked = ".api-parked";

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env, shell: false });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} a fini avec le code ${code}`))));
  });
}

if (await exists(parked)) {
  throw new Error("Un build précédent a laissé .api-parked. Remets src/app/api en place avant de relancer.");
}

await rename(api, parked);
try {
  await run("npx", ["next", "build"], { ...process.env, NEXT_PUBLIC_DEVICE_APP: "1" });
  await run("npx", ["cap", "sync", "ios"], process.env);
} finally {
  if (await exists(parked)) await rename(parked, api);
}

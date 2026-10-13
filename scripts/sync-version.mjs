import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const { version } = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const match = typeof version === "string" && version.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/);
if (!match || match[4]?.split(".").some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith("0"))) {
  throw new Error("package.json must contain a valid semantic version, such as 0.1.0.");
}

// Change only the application's package section, preserving dependency versions.
async function syncCargo(filename, heading) {
  const file = new URL(filename, root);
  const original = await readFile(file, "utf8");
  const headingMatch = original.match(heading);
  if (!headingMatch) throw new Error(`Application package section missing in ${filename}.`);
  const start = headingMatch.index + headingMatch[0].length;
  const rest = original.slice(start);
  const nextSection = rest.search(/^\[/m);
  const end = nextSection < 0 ? original.length : start + nextSection;
  const section = original.slice(start, end);
  if (!/^version\s*=\s*"[^"]*"/m.test(section)) throw new Error(`Application version missing in ${filename}.`);
  const updated = original.slice(0, start) + section.replace(/^(version\s*=\s*)"[^"]*"/m, `$1"${version}"`) + original.slice(end);
  if (updated !== original) await writeFile(file, updated);
}

await syncCargo("src-tauri/Cargo.toml", /^\[package\]\s*\r?\n/m);
await syncCargo("src-tauri/Cargo.lock", /^\[\[package\]\]\r?\nname = "app"\r?\n/m);
const lockFile = new URL("package-lock.json", root);
const originalLock = await readFile(lockFile, "utf8");
const lock = JSON.parse(originalLock);
if (lock.version !== version || lock.packages?.[""]?.version !== version) {
  lock.version = version;
  if (lock.packages?.[""]) lock.packages[""].version = version;
  const newline = originalLock.includes("\r\n") ? "\r\n" : "\n";
  await writeFile(lockFile, (JSON.stringify(lock, null, 2) + "\n").replace(/\n/g, newline));
}
console.log(`Scribe version synced: ${version}`);

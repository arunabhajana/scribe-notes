import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

// Scan tracked and new non-ignored text files. Report locations, never secrets.
const files = [...new Set(execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\0").filter(Boolean))];
let scanned = 0;
const findings = [];
for (const path of files) {
  const buffer = await readFile(path);
  if (buffer.includes(0)) continue;
  const text = buffer.toString("utf8"); scanned++;
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const patterns = [/sb_secret_[A-Za-z0-9_-]{24,}/, /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/, /AKIA[A-Z0-9]{16}/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
    let secret = patterns.some((pattern) => pattern.test(line));
    for (const match of line.matchAll(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
      try { secret ||= JSON.parse(Buffer.from(match[1], "base64url").toString()).role === "service_role"; } catch { /* Non-JWT text. */ }
    }
    if (secret) findings.push(`${path}:${index+1}`);
  }
}
if (findings.length) { console.error("Possible privileged credentials found at:\n" + findings.join("\n")); process.exitCode = 1; }
else console.log(`PASS secret-pattern scan of ${scanned} tracked/new text files (current tree only; ignored files and Git history excluded).`);

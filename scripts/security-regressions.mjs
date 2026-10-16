import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { clientConfigError } from "../src/features/auth/clientConfig.ts";
import { matchesEmailIntent } from "../src/features/auth/callbackIntent.ts";
import { documentToMarkdown, markdownToDocument } from "../src/features/notes/richTextDocument.ts";
import { inlineLinkPreview } from "../src/components/editor/inlineLinkPreview.ts";
import { validateNotesReply, syncId, syncCursor } from "../src/features/notes/syncValidation.ts";

let checks = 0;
function check(condition, label) { assert.ok(condition, label); checks++; console.log(`PASS ${label}`); }
function rejects(callback, label) { assert.throws(callback); checks++; console.log(`PASS ${label}`); }
const project = "https://yyhjxemoxkelswrakabm.supabase.co";
const jwt = (role) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
check(clientConfigError(project, "sb_publishable_public", false) === null, "public client key accepted");
check(clientConfigError(project, jwt("anon"), false) === null, "legacy anon client key accepted");
check(clientConfigError(project, jwt("service_role"), false) !== null, "service-role key rejected");
check(clientConfigError(project, "sb_secret_private", false) !== null, "secret key rejected");
check(clientConfigError("http://127.0.0.1:54321", "sb_publishable_public", false) !== null, "production HTTP backend rejected");
check(clientConfigError("http://127.0.0.1:54321", "sb_publishable_public", true) === null, "development loopback exception accepted");
check(clientConfigError("https://user:password@example.com", "sb_publishable_public", false) !== null, "credential-bearing backend URL rejected");
check(clientConfigError(`${project}/evil`, "sb_publishable_public", false) !== null, "backend URL path rejected");
const now = Date.now(), intent = { type: "recovery", email: "victim@example.com", requestedAt: now };
check(matchesEmailIntent(intent, "recovery", "victim@example.com", now), "requested email callback accepted");
check(!matchesEmailIntent(intent, "recovery", "attacker@example.com", now), "other-account callback rejected");
check(!matchesEmailIntent(intent, "signup", "victim@example.com", now), "wrong callback purpose rejected");
check(!matchesEmailIntent(intent, "recovery", "victim@example.com", now + 3600001), "expired callback rejected");
check(!matchesEmailIntent(intent, "recovery", "victim@example.com", now - 1), "future-dated callback intent rejected");
check(!matchesEmailIntent(null, "recovery", "victim@example.com", now), "unsolicited callback rejected");
const note = "# Title\n\nHello **there**\n\n- [ ] A task\n\n[Safe](https://example.com)";
check(documentToMarkdown(markdownToDocument(note)) === note, "normal rich-text document round trip preserved");
for (const value of [null, {}, { type: "doc", version: 1, content: [null] }, { type: "doc", version: 1, content: [{ type: "heading", attrs: { level: 10000000 }, content: [] }] }, { type: "doc", version: 1, content: [{ type: "paragraph", content: "bad" }] }, { type: "doc", version: 1, content: [{ type: "codeBlock", content: [{}] }] }, { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "bad", marks: [{type: "link"}] }] }] }]) {
  rejects(() => documentToMarkdown(value), "malformed cloud document rejected without blank-note fallback");
}
for (const url of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "file:///C:/secret", "https://user:password@example.com"]) check(inlineLinkPreview(url) === null, `unsafe link scheme or credentials rejected: ${new URL(url).protocol}`);

// Exercise the real React renderer; only native platform APIs are stubbed.
const require = createRequire(import.meta.url);
const helperSource = await readFile(new URL("../src/components/editor/inlineLinkPreview.ts", import.meta.url), "utf8");
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
async function transferModule(name, imports = {}) {
  let compiled = ts.transpileModule(await readFile(new URL(`../src/features/transfer/${name}.ts`, import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  for (const [name, url] of Object.entries(imports)) compiled = compiled.replaceAll(`from "./${name}"`, `from "${url}"`);
  return moduleUrl(compiled);
}
const transferTypesModule = await transferModule("transferTypes");
const zipModule = await transferModule("markdownZip", { transferTypes: transferTypesModule });
const { readMarkdownZip, createMarkdownZip } = await import(zipModule);
const { parseScribeBackup } = await import(await transferModule("portableData", { transferDigest: await transferModule("transferDigest"), transferTypes: transferTypesModule, markdownZip: zipModule }));
const helper = moduleUrl(ts.transpileModule(helperSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
let source = await readFile(new URL("../src/components/editor/MarkdownPreview.tsx", import.meta.url), "utf8");
source = source.replace('from "./inlineLinkPreview"', `from "${helper}"`)
  .replace('import { isTauri } from "@tauri-apps/api/core";', 'const isTauri = () => false;')
  .replace('import { openUrl } from "@tauri-apps/plugin-opener";', 'const openUrl = async () => {};')
  .replace('import "./linkPreviews.css";', '');
let compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
for (const name of ["react", "react/jsx-runtime"]) compiled = compiled.replaceAll(`from "${name}"`, `from "${pathToFileURL(require.resolve(name)).href}"`);
const { MarkdownPreview } = await import(moduleUrl(compiled));
for (const value of ['<img src=x onerror="alert(1)"><script>alert(1)</script>', '[evil](javascript:alert(1))', '- [ ] "><img src=x onerror="alert(1)">', '[<svg onload="alert(1)">](https://example.com)', 'https://example.com/\"onclick=\"alert(1)', '<u><iframe src="https://evil.example"></iframe></u>', '\uE0000\uE001 https://example.com']) {
  const html = renderToStaticMarkup(React.createElement(MarkdownPreview, { value }));
  check(!/<(?:script|img|svg|iframe|object)\b|\s(on\w+)=["']|href=["'](?:javascript|data|file):/i.test(html), "malicious Markdown cannot produce executable markup");
}
const codeHtml = renderToStaticMarkup(React.createElement(MarkdownPreview, {value: "`https://example.com`"}));
check(!codeHtml.includes("<a "), "URLs in inline code remain inert");
const linkHtml = renderToStaticMarkup(React.createElement(MarkdownPreview, {value: "Before https://example.com after"}));
check(linkHtml.includes('rel="noopener noreferrer"') && linkHtml.indexOf("Before") < linkHtml.indexOf("<a ") && linkHtml.indexOf("<a ") < linkHtml.indexOf(" after"), "link previews preserve position and isolate external windows");
const hostileMarkdown = "[".repeat(50_000) + "\n" + "<u>".repeat(10_000);
const hostileHtml = renderToStaticMarkup(React.createElement(MarkdownPreview, { value: hostileMarkdown }));
check(!hostileHtml.includes("<script") && hostileHtml.includes("&lt;u&gt;"), "repeated unmatched markup remains inert and can be rendered");
check(documentToMarkdown(markdownToDocument("[".repeat(50_000))).length === 50_000, "unmatched bracket runs preserve text during sync encoding");
rejects(() => documentToMarkdown({ type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "https://example.com/" + "a".repeat(8192) } }] }] }] }), "oversized link marks cannot expand decoded cloud notes");
const emptyReply = { cursor: "0", full: false, hasMore: false, changes: [], results: [] };
validateNotesReply(emptyReply);
check(!syncId("__proto__") && !syncCursor("1".repeat(100_000)), "prototype keys and unbounded cursors rejected at the sync boundary");
for (const value of [null, { ...emptyReply, changes: [{ entity: "note", id: "__proto__", snapshot: null }] }, { ...emptyReply, results: [{ revisionId: "bad", entity: "script", status: "applied", snapshot: null }] }]) rejects(() => validateNotesReply(value), "malformed sync response rejected before a cache write");
const emptyBackup = { format: "scribe-backup", version: 1, exportedAt: new Date().toISOString(), data: { notes: [], folders: [], reminders: [] } };
check(parseScribeBackup(JSON.stringify(emptyBackup)).notes.length === 0, "valid empty portable backup remains supported");
rejects(() => parseScribeBackup(JSON.stringify({ ...emptyBackup, data: { ...emptyBackup.data, notes: [{ id: "__proto__" }] } })), "malformed portable records rejected");
const zip = createMarkdownZip([{ name: "note.md", text: "# Safe\n\nhello" }]);
check((await readMarkdownZip(zip)).files[0].text.includes("hello"), "valid portable ZIP round trip supported");
for (const name of ["../note.md", "/note.md", "C:/note.md", "folder\\note.md"]) {
  await assert.rejects(() => readMarkdownZip(createMarkdownZip([{ name, text: "hello" }])));
  checks++; console.log("PASS unsafe ZIP path rejected without extracting files");
}
for (const filename of ["default", "quick-capture"]) {
  const capability = JSON.parse(await readFile(new URL(`../src-tauri/capabilities/${filename}.json`, import.meta.url)));
  check(capability.local === true && !capability.remote && !capability.permissions.includes("core:default"), `${filename} capability has explicit local permissions`);
  check(!capability.permissions.some(item => typeof item === "string" && /allow-(emit|emit-to|from-path|new|create-webview-window)$/.test(item)), `${filename} cannot emit native events or read arbitrary image paths`);
}
const nativePermissions = await readFile(new URL("../src-tauri/permissions/workspace.toml", import.meta.url), "utf8");
const captureCommands = nativePermissions.split('identifier = "capture-commands"')[1];
check(Boolean(captureCommands) && !/save_export_file|set_capture_account|clear_workspace_notifications/.test(captureCommands), "capture commands exclude account changes, exports and destructive cleanup");
const captureCapability = JSON.parse(await readFile(new URL('../src-tauri/capabilities/quick-capture.json', import.meta.url)));
check(!captureCapability.permissions.some(item => typeof item === 'string' && item.startsWith('updater:')) && !/updater_configured|prepare_app_update|finish_app_update/.test(captureCommands), 'Quick Capture cannot check, download or install app updates');
const nativeSource = await readFile(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
const nativeBuild = await readFile(new URL("../src-tauri/build.rs", import.meta.url), "utf8");
const registeredCommands = nativeSource.match(/generate_handler!\[([\s\S]*?)\]/)[1].split(",").map(name => name.trim().split("::").pop()).filter(Boolean).sort();
const manifestCommands = [...nativeBuild.match(/\.commands\(&\[([\s\S]*?)\]/)[1].matchAll(/"([a-z_]+)"/g)].map(match => match[1]).sort();
check(JSON.stringify(registeredCommands) === JSON.stringify(manifestCommands), "all registered app commands participate in explicit ACL enforcement");
const config = JSON.parse(await readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url)));
check(!config.app.security.csp.includes("'unsafe-eval'") && config.app.security.csp.includes("object-src 'none'"), "production CSP disables eval and plugins");
check(config.app.security.headers["X-Content-Type-Options"] === "nosniff", "native response security headers configured");
for (const [overrides, succeeds, label] of [
  [{}, true, "public production build configuration accepted"],
  [{ VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_private" }, false, "secret-key production build blocked"],
  [{ VITE_SUPABASE_PUBLISHABLE_KEY: jwt("service_role") }, false, "service-role production build blocked"],
  [{ VITE_SUPABASE_URL: "http://127.0.0.1:54321" }, false, "HTTP production build blocked"],
  [{ VITE_SUPABASE_URL: `${project}.evil.example` }, false, "wrong project origin cannot bypass CSP build check"],
  [{ VITE_OTHER_SECRET_KEY: "private" }, false, "other exposed privileged build variables blocked"],
  [{ VITE_SUPABASE_URL: "invalid-sensitive-url" }, false, "malformed config rejected without echoing its value"],
]) {
  const result = spawnSync(process.execPath, ["scripts/check-production-security.mjs"], { encoding: "utf8", env: { ...process.env, VITE_SUPABASE_URL: project, VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_public", ...overrides } });
  check((result.status === 0) === succeeds && !result.stderr.includes("invalid-sensitive-url"), label);
}
console.log(`Completed ${checks} client security regression checks. Native UI and hosted Auth require separate release smoke checks.`);

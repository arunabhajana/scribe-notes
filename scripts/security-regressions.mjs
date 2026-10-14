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

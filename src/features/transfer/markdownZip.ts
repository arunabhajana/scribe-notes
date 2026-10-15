import { TRANSFER_LIMIT, TRANSFER_RECORD_LIMIT } from "./transferTypes";

// Standard single-disk ZIP (STORE output; STORE/DEFLATE input). No filesystem
// extraction, executable entries, ZIP64, encryption, or third-party runtime.
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
export function createMarkdownZip(files: { name: string; text: string }[]) {
  if (files.length > TRANSFER_RECORD_LIMIT) throw new Error("Export up to 10,000 notes at a time.");
  const entries = files.map(file => ({ name: encoder.encode(file.name), data: encoder.encode(file.text) }));
  if (entries.some(file => file.data.length > 10 * 1024 * 1024)) throw new Error("A Markdown file exceeds 10 MB. Split that note before exporting.");
  const length = entries.reduce((total, file) => total + 76 + file.name.length * 2 + file.data.length, 22);
  if (length > TRANSFER_LIMIT) throw new Error("This ZIP exceeds 50 MB. Export a smaller selection.");
  const output = new Uint8Array(length);
  const view = new DataView(output.buffer);
  let offset = 0;
  const directory: { start: number; crc: number; name: Uint8Array; data: Uint8Array }[] = [];
  for (const file of entries) {
    const start = offset, crc = crc32(file.data);
    view.setUint32(offset, 0x04034b50, true); view.setUint16(offset + 4, 20, true); view.setUint16(offset + 6, 0x800, true);
    view.setUint16(offset + 12, 33, true); view.setUint32(offset + 14, crc, true);
    view.setUint32(offset + 18, file.data.length, true); view.setUint32(offset + 22, file.data.length, true); view.setUint16(offset + 26, file.name.length, true);
    output.set(file.name, offset + 30); output.set(file.data, offset + 30 + file.name.length);
    offset += 30 + file.name.length + file.data.length;
    directory.push({ start, crc, ...file });
  }
  const directoryStart = offset;
  for (const file of directory) {
    view.setUint32(offset, 0x02014b50, true); view.setUint16(offset + 4, 20, true); view.setUint16(offset + 6, 20, true); view.setUint16(offset + 8, 0x800, true);
    view.setUint16(offset + 14, 33, true); view.setUint32(offset + 16, file.crc, true);
    view.setUint32(offset + 20, file.data.length, true); view.setUint32(offset + 24, file.data.length, true); view.setUint16(offset + 28, file.name.length, true); view.setUint32(offset + 42, file.start, true);
    output.set(file.name, offset + 46); offset += 46 + file.name.length;
  }
  view.setUint32(offset, 0x06054b50, true); view.setUint16(offset + 8, entries.length, true); view.setUint16(offset + 10, entries.length, true);
  view.setUint32(offset + 12, offset - directoryStart, true); view.setUint32(offset + 16, directoryStart, true);
  return output;
}
async function inflateBounded(data: Uint8Array, expected: number) {
  let stream: ReadableStream<Uint8Array>;
  try { stream = new Blob([data.slice().buffer]).stream().pipeThrough(new DecompressionStream("deflate-raw")); }
  catch { throw new Error("This WebView cannot read compressed ZIPs. Update WebView2 or select extracted Markdown files instead."); }
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > expected || size > TRANSFER_LIMIT) { await reader.cancel(); throw new Error("ZIP content exceeds its declared size."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (size !== expected) throw new Error("The ZIP is incomplete or damaged.");
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}
export async function readMarkdownZip(input: Uint8Array) {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const fail = () => new Error("This ZIP is damaged or unsupported. Use a standard, unencrypted Markdown ZIP.");
  if (input.length < 22 || input.length > TRANSFER_LIMIT) throw fail();
  let end = input.length - 22;
  while (end >= Math.max(0, input.length - 65557) && (view.getUint32(end, true) !== 0x06054b50 || end + 22 + view.getUint16(end + 20, true) !== input.length)) end--;
  if (end < Math.max(0, input.length - 65557) || view.getUint32(end, true) !== 0x06054b50 || end + 22 + view.getUint16(end + 20, true) !== input.length) throw fail();
  const count = view.getUint16(end + 10, true), directorySize = view.getUint32(end + 12, true), start = view.getUint32(end + 16, true);
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || count !== view.getUint16(end + 8, true) || count > TRANSFER_RECORD_LIMIT || start + directorySize !== end) throw fail();
  const descriptors: { name: string; method: number; size: number; crc: number; begin: number; finish: number }[] = [];
  const names = new Set<string>();
  let offset = start, total = 0, ignored = 0;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) throw fail();
    const flags = view.getUint16(offset + 8, true), method = view.getUint16(offset + 10, true), crc = view.getUint32(offset + 16, true);
    const compressed = view.getUint32(offset + 20, true), size = view.getUint32(offset + 24, true), nameLength = view.getUint16(offset + 28, true);
    const extra = view.getUint16(offset + 30, true), comment = view.getUint16(offset + 32, true), local = view.getUint32(offset + 42, true);
    if (offset + 46 + nameLength + extra + comment > end || view.getUint16(offset + 34, true) || flags & 0x2041 || ![0, 8].includes(method) || ((view.getUint32(offset + 38, true) >>> 16) & 0xf000) === 0xa000) throw fail();
    const rawName = input.subarray(offset + 46, offset + 46 + nameLength);
    if (!(flags & 0x800) && rawName.some(byte => byte > 127)) throw new Error("Use a ZIP with UTF-8 file names, or import extracted Markdown files.");
    const name = decoder.decode(rawName);
    // eslint-disable-next-line no-control-regex -- Archive paths must reject control characters.
    if (!name || name.length > 1024 || /[\\:\u0000-\u001f]/.test(name) || name.startsWith("/") || name.split("/").some(part => part === ".." || part === ".") || names.has(name.toLowerCase())) throw fail();
    names.add(name.toLowerCase());
    if (local + 30 > start || view.getUint32(local, true) !== 0x04034b50 || view.getUint16(local + 6, true) !== flags || view.getUint16(local + 8, true) !== method) throw fail();
    const localNameLength = view.getUint16(local + 26, true), localExtra = view.getUint16(local + 28, true), begin = local + 30 + localNameLength + localExtra;
    if (begin + compressed > start || localNameLength !== nameLength || decoder.decode(input.subarray(local + 30, local + 30 + localNameLength)) !== name) throw fail();
    total += size;
    if (total > TRANSFER_LIMIT || size > 10 * 1024 * 1024 || (method === 0 && size !== compressed)) throw new Error("Extracted ZIP content exceeds the import limits (50 MB total, 10 MB per file).");
    if (!name.endsWith("/") && /\.(md|markdown)$/i.test(name) && !name.startsWith("__MACOSX/")) descriptors.push({ name, method, size, crc, begin, finish: begin + compressed });
    else if (!name.endsWith("/")) ignored++;
    offset += 46 + nameLength + extra + comment;
  }
  if (offset !== end) throw fail();
  const files: { name: string; text: string }[] = [];
  for (const file of descriptors) {
    const raw = input.subarray(file.begin, file.finish);
    const data = file.method === 0 ? raw : await inflateBounded(raw, file.size);
    if (crc32(data) !== file.crc) throw new Error("A Markdown file failed its integrity check. Nothing was imported.");
    files.push({ name: file.name, text: decoder.decode(data) });
  }
  return { files, ignored };
}

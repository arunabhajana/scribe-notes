import { createHash, createPublicKey, verify } from 'node:crypto';

// Verify Tauri's base64-encoded Minisign signature before creating release
// assets. Installation still uses Tauri's independent native verifier.
export function verifyUpdateSignature(bytes: Uint8Array, publicKey: string, signature: string): void {
  const pubLines = Buffer.from(publicKey, 'base64').toString('utf8').trim().split(/\r?\n/);
  const sigLines = Buffer.from(signature, 'base64').toString('utf8').trim().split(/\r?\n/);
  const pub = Buffer.from(pubLines[1] ?? '', 'base64');
  const sig = Buffer.from(sigLines[1] ?? '', 'base64');
  const comment = sigLines[2]?.replace(/^trusted comment: /, '');
  if (pub.length !== 42 || sig.length !== 74 || pub.subarray(0, 2).toString() !== 'Ed' ||
      !pub.subarray(2, 10).equals(sig.subarray(2, 10)) || !sigLines[2]?.startsWith('trusted comment: ') || !comment) {
    throw new Error('Update signature does not match the configured public key.');
  }
  const algorithm = sig.subarray(0, 2).toString();
  if (algorithm !== 'Ed' && algorithm !== 'ED') throw new Error('Unsupported update signature algorithm.');
  const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), pub.subarray(10)]), format: 'der', type: 'spki' });
  const data = algorithm === 'ED' ? createHash('blake2b512').update(bytes).digest() : bytes;
  if (!verify(null, data, key, sig.subarray(10)) ||
      !verify(null, Buffer.concat([sig.subarray(10), Buffer.from(comment)]), key, Buffer.from(sigLines[3] ?? '', 'base64'))) {
    throw new Error('Update signature verification failed. No release assets were created.');
  }
}

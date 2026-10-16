import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyUpdateSignature } from '../scripts/lib/update-signature.mts';

function fixture(prehashed: boolean) {
  const pair = generateKeyPairSync('ed25519');
  const keyId = randomBytes(8);
  const rawKey = pair.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  const bytes = Buffer.from('Test installer contents');
  const signed = sign(null, prehashed ? createHash('blake2b512').update(bytes).digest() : bytes, pair.privateKey);
  const trustedComment = 'timestamp:1\tfile:Scribe-setup.exe';
  const global = sign(null, Buffer.concat([signed, Buffer.from(trustedComment)]), pair.privateKey);
  const publicKey = Buffer.from(`untrusted comment: public key\n${Buffer.concat([Buffer.from('Ed'), keyId, rawKey]).toString('base64')}`).toString('base64');
  const signature = Buffer.from(`untrusted comment: signature\n${Buffer.concat([Buffer.from(prehashed ? 'ED' : 'Ed'), keyId, signed]).toString('base64')}\ntrusted comment: ${trustedComment}\n${global.toString('base64')}`).toString('base64');
  return { bytes, publicKey, signature };
}

describe('release signature verification', () => {
  it.each([false, true])('verifies a matching updater key pair (prehashed %s)', prehashed => {
    const f = fixture(prehashed);
    expect(() => verifyUpdateSignature(f.bytes, f.publicKey, f.signature)).not.toThrow();
  });
  it('rejects modified installer bytes', () => {
    const f = fixture(true);
    expect(() => verifyUpdateSignature(Buffer.from('Modified installer'), f.publicKey, f.signature)).toThrow();
  });
  it('rejects a different configured key before publishing', () => {
    const f = fixture(true);
    expect(() => verifyUpdateSignature(f.bytes, fixture(true).publicKey, f.signature)).toThrow();
  });
  it('rejects a changed trusted signature comment', () => {
    const f = fixture(true);
    const signature = Buffer.from(Buffer.from(f.signature, 'base64').toString().replace('timestamp:1', 'timestamp:2')).toString('base64');
    expect(() => verifyUpdateSignature(f.bytes, f.publicKey, signature)).toThrow();
  });
});

import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
const ENC_PREFIX = 'enc:';

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor() {
    const raw = process.env.FIELD_ENCRYPTION_KEY ?? 'local_dev_encryption_key_change_in_prod';
    this.key = crypto.createHash('sha256').update(raw).digest();
  }

  encrypt(plaintext: string): string {
    if (!plaintext) return plaintext;
    if (plaintext.startsWith(ENC_PREFIX)) return plaintext;
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return ENC_PREFIX + iv.toString('hex') + ':' + encrypted.toString('hex');
  }

  decrypt(ciphertext: string): string {
    if (!ciphertext) return ciphertext;
    if (!ciphertext.startsWith(ENC_PREFIX)) return ciphertext;
    try {
      const payload = ciphertext.slice(ENC_PREFIX.length);
      const colonIdx = payload.indexOf(':');
      const ivHex = payload.slice(0, colonIdx);
      const encHex = payload.slice(colonIdx + 1);
      const iv = Buffer.from(ivHex, 'hex');
      const encrypted = Buffer.from(encHex, 'hex');
      const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch {
      return ciphertext;
    }
  }
}

import argon2 from 'argon2';

// Per SRS §4.12.2: Argon2id, memory 64 MiB, iterations 3, parallelism 1.
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

// Per SRS §4.12.1: 8+ chars, must include digit + special char.
const PASSWORD_RE = /^(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]).{8,}$/;

export function isStrongPassword(plain: string): boolean {
  return PASSWORD_RE.test(plain);
}

/**
 * Хеширование паролей: argon2id — текущая рекомендация OWASP.
 * В БД попадает только хеш, восстановить из него пароль нельзя.
 */
import argon2 from "argon2";

const OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB — минимум по OWASP
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/** Минимальные требования к паролю. Проверяются и на клиенте, и здесь. */
export function isStrongEnough(password: string): boolean {
  return password.length >= 10 && /[a-zA-Zа-яА-Я]/.test(password) && /\d/.test(password);
}

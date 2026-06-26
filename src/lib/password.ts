import 'server-only'

// PBKDF2 のストレッチング回数とハッシュ長（バイト）
const ITERATIONS = 100_000
const KEY_LENGTH = 32

// ArrayBuffer を16進数文字列に変換する
function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// 16進数文字列を Uint8Array に変換する
function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2))
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

// パスワードを PBKDF2-SHA256 でハッシュ化する。DB 保存形式は "saltHex:hashHex"
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16)) as Uint8Array<ArrayBuffer>
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    keyMaterial,
    KEY_LENGTH * 8
  )
  return `${toHex(salt.buffer)}:${toHex(hash)}`
}

// 入力パスワードを DB 保存ハッシュと照合する
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  const salt = fromHex(saltHex)
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    keyMaterial,
    KEY_LENGTH * 8
  )
  return toHex(hash) === hashHex
}

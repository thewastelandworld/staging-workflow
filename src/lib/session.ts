import 'server-only'

export type Permission = 'admin' | 'team_leader' | 'user' | 'readonly'
export interface Session { user: string; permission: Permission; exp: number }

function secret() {
  return process.env.SESSION_SECRET ?? 'dev-secret-change-in-production'
}

function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function b64decode(str: string): ArrayBuffer {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)
  const bytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0))
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

async function getKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

export async function signSession(payload: Session): Promise<string> {
  const data = btoa(JSON.stringify(payload)).replace(/=/g, '')
  const key = await getKey()
  const sig = b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)))
  return `${data}.${sig}`
}

export async function verifySession(token: string): Promise<Session | null> {
  const dot = token.lastIndexOf('.')
  if (dot === -1) return null
  const data = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  try {
    const key = await getKey()
    const valid = await crypto.subtle.verify(
      'HMAC', key,
      b64decode(sig),
      new TextEncoder().encode(data)
    )
    if (!valid) return null
    const raw = JSON.parse(atob(data)) as Record<string, unknown>
    // 旧トークンは `role` フィールドを使っていたため、移行期間中は両方を許容する
    const payload: Session = {
      user: raw.user as string,
      permission: ((raw.permission ?? raw.role) as Permission),
      exp: raw.exp as number,
    }
    if (payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

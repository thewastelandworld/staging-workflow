import 'server-only'

// セッションの権限レベル。admin > team_leader > user > readonly の順で権限が強い
export type Permission = 'admin' | 'team_leader' | 'user' | 'readonly'

// セッショントークンに埋め込むペイロード。exp は Unix ミリ秒
export interface Session { user: string; permission: Permission; exp: number }

// HMAC 署名に使う秘密鍵。本番では SESSION_SECRET 環境変数を必ず設定すること
function secret() {
  return process.env.SESSION_SECRET ?? 'dev-secret-change-in-production'
}

// Base64url エンコード（RFC 4648 §5）
function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// Base64url デコード。パディングを補完してから atob に渡す
function b64decode(str: string): ArrayBuffer {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)
  const bytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0))
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

// Web Crypto API で HMAC-SHA256 の CryptoKey を生成する
async function getKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

// セッションペイロードを Base64url(JSON).HMAC 形式のトークンに署名する
export async function signSession(payload: Session): Promise<string> {
  const data = btoa(JSON.stringify(payload)).replace(/=/g, '')
  const key = await getKey()
  const sig = b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)))
  return `${data}.${sig}`
}

// トークンの署名を検証し、有効なら Session を返す。改ざん・期限切れは null
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

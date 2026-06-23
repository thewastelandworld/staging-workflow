import { assertAdmin } from '@/lib/auth'
import { getSupabase } from '@/lib/supabase'
import { hashPassword } from '@/lib/password'
import { v4 as uuid } from 'uuid'
import { read, utils } from 'xlsx'
import { revalidateTag } from 'next/cache'
import { log } from '@/lib/logger'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']
const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/

type ParsedMember = {
  username: string
  role: string
  displayName: string
  email: string
  password: string
}
type ParsedTeam = { name: string; members: ParsedMember[] }

function buildColOf(headers: string[]) {
  return function colOf(...keys: string[]): number {
    for (const key of keys) {
      const i = headers.findIndex((h) => h.includes(key))
      if (i !== -1) return i
    }
    return -1
  }
}

function parseMemberRow(
  r: unknown[],
  cols: { username: number; role: number; displayName: number; email: number; password: number }
): ParsedMember | null {
  const username = String(r[cols.username] ?? '').trim()
  if (!username) return null
  return {
    username,
    role:        cols.role        !== -1 ? String(r[cols.role]        ?? '').trim() : '',
    displayName: cols.displayName !== -1 ? String(r[cols.displayName] ?? '').trim() : '',
    email:       cols.email       !== -1 ? String(r[cols.email]       ?? '').trim() : '',
    password:    cols.password    !== -1 ? String(r[cols.password]    ?? '').trim() : '',
  }
}

// ── Parser A: flat single-sheet ──────────────────────────────────────────────
// Headers: チーム名 | ユーザー名 | 役割 | 表示名 | メール | 初期パスワード
function parseFlatSheet(rows: unknown[][]): ParsedTeam[] {
  const headers = (rows[0] ?? []).map((h) => String(h).trim().toLowerCase())
  const colOf = buildColOf(headers)

  const teamCol = colOf('チーム名', 'team')
  const cols = {
    username:    colOf('ユーザー名', 'username', 'user'),
    role:        colOf('役割', 'role'),
    displayName: colOf('表示名', 'display', 'name'),
    email:       colOf('メール', 'email'),
    password:    colOf('初期パスワード', 'password', 'pass'),
  }

  if (teamCol === -1 || cols.username === -1) return []

  const teamMap = new Map<string, ParsedMember[]>()
  let lastTeamName = ''

  for (const row of rows.slice(1)) {
    const teamName = String(row[teamCol] ?? '').trim() || lastTeamName
    const member = parseMemberRow(row, cols)
    if (!member) continue
    lastTeamName = teamName
    if (!teamMap.has(teamName)) teamMap.set(teamName, [])
    teamMap.get(teamName)!.push(member)
  }

  return Array.from(teamMap.entries()).map(([name, members]) => ({ name, members }))
}

// ── Parser B: multi-sheet (sheet name = team name) ───────────────────────────
// Each sheet: headers row with ユーザー名 | 役割 | 表示名 | メール | 初期パスワード
function parseMultiSheet(sheetName: string, rows: unknown[][]): ParsedTeam {
  const headers = (rows[0] ?? []).map((h) => String(h).trim().toLowerCase())
  const colOf = buildColOf(headers)

  const cols = {
    username:    colOf('ユーザー名', 'username', 'user'),
    role:        colOf('役割', 'role'),
    displayName: colOf('表示名', 'display', 'name'),
    email:       colOf('メール', 'email'),
    password:    colOf('初期パスワード', 'password', 'pass'),
  }

  if (cols.username === -1) return { name: sheetName, members: [] }

  const members = rows.slice(1)
    .map((r) => parseMemberRow(r, cols))
    .filter((m): m is ParsedMember => m !== null)

  return { name: sheetName, members }
}

function generatePassword(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(10)))
    .map((b) => chars[b % chars.length])
    .join('')
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const deny = await assertAdmin()
  if (deny) return deny

  let formData: FormData
  try { formData = await req.formData() } catch {
    return Response.json({ error: 'multipart/form-data が必要です' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return Response.json({ error: 'file フィールドがありません' }, { status: 400 })

  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!['xlsx', 'xls'].includes(ext ?? '')) {
    return Response.json({ error: '.xlsx または .xls ファイルのみ対応しています' }, { status: 400 })
  }

  let wb: ReturnType<typeof read>
  try {
    wb = read(Buffer.from(await file.arrayBuffer()), { type: 'buffer' })
  } catch {
    return Response.json({ error: 'Excel の読み込みに失敗しました' }, { status: 400 })
  }

  const supabase = getSupabase()

  const { data: existingTeams } = await supabase.from('teams').select('id, name')
  const { data: existingUsers } = await supabase.from('users').select('id, username')

  const teamMap  = new Map((existingTeams ?? []).map((t) => [t.name as string, t.id as string]))
  const userMap  = new Map((existingUsers ?? []).map((u) => [u.username as string, u.id as string]))
  const colorIdx = existingTeams?.length ?? 0

  // Parse Excel
  let parsedTeams: ParsedTeam[]
  const isMultiSheet = wb.SheetNames.length > 1

  if (isMultiSheet) {
    parsedTeams = wb.SheetNames.map((name) => {
      const rows = utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: '' })
      return parseMultiSheet(name, rows)
    }).filter((t) => t.name && t.members.length > 0)
  } else {
    const rows = utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
    parsedTeams = parseFlatSheet(rows).filter((t) => t.members.length > 0)
  }

  if (parsedTeams.length === 0) {
    return Response.json({ error: 'インポートできるデータが見つかりませんでした' }, { status: 400 })
  }

  type ResultRow = {
    teamName: string
    created: boolean
    added: number
    skipped: number
    usersCreated: { username: string; password: string }[]
    invalidUsernames: string[]
  }
  const results: ResultRow[] = []

  for (let ti = 0; ti < parsedTeams.length; ti++) {
    const parsed = parsedTeams[ti]

    // Resolve or create team
    let teamId = teamMap.get(parsed.name)
    let teamCreated = false
    if (!teamId) {
      teamId = uuid()
      const { error } = await supabase.from('teams').insert({
        id: teamId,
        name: parsed.name,
        color: COLORS[(colorIdx + ti) % COLORS.length],
        created_at: new Date().toISOString(),
      })
      if (error) {
        results.push({ teamName: parsed.name, created: false, added: 0, skipped: 0, usersCreated: [], invalidUsernames: [] })
        continue
      }
      teamMap.set(parsed.name, teamId)
      teamCreated = true
      log.info('Team created via import', { name: parsed.name })
    }

    // Fetch existing memberships
    const { data: existingMemberships } = await supabase
      .from('user_teams').select('user_id').eq('team_id', teamId)
    const existingUserIds = new Set((existingMemberships ?? []).map((r) => r.user_id as string))

    let added = 0
    let skipped = 0
    const usersCreated: { username: string; password: string }[] = []
    const invalidUsernames: string[] = []

    for (const member of parsed.members) {
      // Resolve or create user
      let userId = userMap.get(member.username)

      if (!userId) {
        // Validate username format
        if (!USERNAME_RE.test(member.username)) {
          invalidUsernames.push(member.username)
          continue
        }

        const plainPassword = member.password || generatePassword()
        const password_hash = await hashPassword(plainPassword)

        const { data: newUser, error } = await supabase.from('users').insert({
          id: uuid(),
          username: member.username,
          password_hash,
          permission: 'user',
          status: 'approved',
          display_name: member.displayName || null,
          email: member.email || null,
        }).select('id').single()

        if (error || !newUser) {
          log.error('Failed to create user during team import', { username: member.username, error: error?.message })
          invalidUsernames.push(member.username)
          continue
        }

        userId = newUser.id as string
        userMap.set(member.username, userId)
        usersCreated.push({ username: member.username, password: plainPassword })
        log.info('User created via team import', { username: member.username })
      }

      if (existingUserIds.has(userId as string)) {
        skipped++
        continue
      }

      const { error } = await supabase.from('user_teams').insert({
        user_id: userId as string,
        team_id: teamId,
        role: member.role || null,
      })
      if (!error) {
        added++
        existingUserIds.add(userId as string)
      }
    }

    results.push({ teamName: parsed.name, created: teamCreated, added, skipped, usersCreated, invalidUsernames })
    log.info('Team import result', { name: parsed.name, teamCreated, added, skipped, usersCreated: usersCreated.length })
  }

  revalidateTag('teams', { expire: 0 })

  return Response.json({ ok: true, results }, { status: 201 })
}

import { assertAdmin } from '@/lib/auth'
import { getSupabase } from '@/lib/supabase'
import { v4 as uuid } from 'uuid'
import { read, utils } from 'xlsx'
import { revalidateTag } from 'next/cache'
import { log } from '@/lib/logger'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

type ParsedMember = { username: string; role: string }
type ParsedTeam   = { name: string; members: ParsedMember[] }

// ── Parser A: flat single-sheet ──────────────────────────────────────────────
// Headers: チーム名 | ユーザー名 | 役割
// Team name may be omitted on rows after the first row of the same team.
function parseFlatSheet(rows: unknown[][]): ParsedTeam[] {
  const headers = (rows[0] ?? []).map((h) => String(h).trim().toLowerCase())

  function colOf(...keys: string[]): number {
    for (const key of keys) {
      const i = headers.findIndex((h) => h.includes(key))
      if (i !== -1) return i
    }
    return -1
  }

  const teamCol     = colOf('チーム名', 'team')
  const usernameCol = colOf('ユーザー名', 'username', 'user')
  const roleCol     = colOf('役割', 'role')

  if (teamCol === -1 || usernameCol === -1) return []

  const teamMap = new Map<string, ParsedMember[]>()
  let lastTeamName = ''

  for (const row of rows.slice(1)) {
    const teamName = String(row[teamCol] ?? '').trim() || lastTeamName
    const username = String(row[usernameCol] ?? '').trim()
    if (!username) continue
    lastTeamName = teamName
    if (!teamMap.has(teamName)) teamMap.set(teamName, [])
    teamMap.get(teamName)!.push({
      username,
      role: roleCol !== -1 ? String(row[roleCol] ?? '').trim() : '',
    })
  }

  return Array.from(teamMap.entries()).map(([name, members]) => ({ name, members }))
}

// ── Parser B: multi-sheet (sheet name = team name) ───────────────────────────
// Each sheet: headers row with ユーザー名 | 役割, then member rows
function parseMultiSheet(sheetName: string, rows: unknown[][]): ParsedTeam {
  const headers = (rows[0] ?? []).map((h) => String(h).trim().toLowerCase())

  function colOf(...keys: string[]): number {
    for (const key of keys) {
      const i = headers.findIndex((h) => h.includes(key))
      if (i !== -1) return i
    }
    return -1
  }

  const usernameCol = colOf('ユーザー名', 'username', 'user')
  const roleCol     = colOf('役割', 'role')

  if (usernameCol === -1) return { name: sheetName, members: [] }

  const members: ParsedMember[] = rows.slice(1)
    .map((r) => ({
      username: String(r[usernameCol] ?? '').trim(),
      role: roleCol !== -1 ? String(r[roleCol] ?? '').trim() : '',
    }))
    .filter((m) => m.username)

  return { name: sheetName, members }
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

  // Pre-load existing teams and users
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

  const results: { teamName: string; created: boolean; added: number; skipped: number; notFound: string[] }[] = []

  for (let ti = 0; ti < parsedTeams.length; ti++) {
    const parsed = parsedTeams[ti]

    // Resolve or create team
    let teamId = teamMap.get(parsed.name)
    let created = false
    if (!teamId) {
      teamId = uuid()
      const { error } = await supabase.from('teams').insert({
        id: teamId,
        name: parsed.name,
        color: COLORS[(colorIdx + ti) % COLORS.length],
        created_at: new Date().toISOString(),
      })
      if (error) {
        results.push({ teamName: parsed.name, created: false, added: 0, skipped: 0, notFound: [], })
        continue
      }
      teamMap.set(parsed.name, teamId)
      created = true
      log.info('Team created via import', { name: parsed.name })
    }

    // Fetch existing memberships for this team
    const { data: existingMemberships } = await supabase
      .from('user_teams')
      .select('user_id')
      .eq('team_id', teamId)
    const existingUserIds = new Set((existingMemberships ?? []).map((r) => r.user_id as string))

    let added = 0
    let skipped = 0
    const notFound: string[] = []

    for (const member of parsed.members) {
      const userId = userMap.get(member.username)
      if (!userId) {
        notFound.push(member.username)
        continue
      }
      if (existingUserIds.has(userId)) {
        skipped++
        continue
      }
      const { error } = await supabase.from('user_teams').insert({
        user_id: userId,
        team_id: teamId,
        role: member.role || null,
      })
      if (!error) {
        added++
        existingUserIds.add(userId)
      }
    }

    results.push({ teamName: parsed.name, created, added, skipped, notFound })
    log.info('Team import result', { name: parsed.name, created, added, skipped })
  }

  revalidateTag('teams', { expire: 0 })

  return Response.json({ ok: true, results }, { status: 201 })
}

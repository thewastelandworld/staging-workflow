import { assertWritable, getSession } from '@/lib/auth'
import { getSupabase } from '@/lib/supabase'
import { v4 as uuid } from 'uuid'
import { read, utils } from 'xlsx'
import { revalidateTag } from 'next/cache'
import { log } from '@/lib/logger'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

async function resolveTeam(name: string, teamMap: Map<string, string>, colorIndex: number): Promise<string> {
  const trimmed = name.trim()
  if (teamMap.has(trimmed)) return teamMap.get(trimmed)!
  const id = uuid()
  await getSupabase().from('teams').insert({
    id,
    name: trimmed,
    color: COLORS[colorIndex % COLORS.length],
    created_at: new Date().toISOString(),
  })
  teamMap.set(trimmed, id)
  revalidateTag('teams', { expire: 0 })
  log.info('Team auto-created during import', { name: trimmed, id })
  return id
}

type ParsedStage = {
  name: string
  description: string
  teamName: string
  reviewerTeamName: string
  deadline: string
}

function parseTemplate(rows: unknown[][]): { projectName: string; description: string; stages: ParsedStage[] } {
  // Template format:
  //   Row 1 (idx 0): B(idx 1) = project title
  //   Row 2 (idx 1): B(idx 1) = description
  //   Row 4 (idx 3): headers
  //   Row 5+ (idx 4+): [#, name, desc, team, reviewer, status] at cols B-G (idx 1-6)
  const projectName = String(rows[0]?.[1] ?? '').trim()
  const description = String(rows[1]?.[1] ?? '').trim()

  const defaultDeadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  const stages: ParsedStage[] = rows
    .slice(4)
    .filter((r) => String(r[2] ?? '').trim())
    .map((r) => ({
      name: String(r[2]).trim(),
      description: String(r[3] ?? '').trim(),
      teamName: String(r[4] ?? '').trim(),
      reviewerTeamName: String(r[5] ?? '').trim(),
      deadline: defaultDeadline,
    }))

  return { projectName, description, stages }
}

function parseSimple(rows: unknown[][]): { projectName: string; description: string; stages: ParsedStage[] } {
  // Simple format: row 1 = headers, row 2+ = data
  // Expected headers (flexible matching): ステージ名/名前/name, 説明/description, 担当チーム/team, 確認チーム/reviewer, 期限/deadline
  const headers = (rows[0] ?? []).map((h) => String(h).trim().toLowerCase())

  function colOf(...keys: string[]): number {
    for (const key of keys) {
      const i = headers.findIndex((h) => h.includes(key))
      if (i !== -1) return i
    }
    return -1
  }

  const nameCol     = colOf('ステージ名', '名前', 'name')
  const descCol     = colOf('説明', 'description', '内容')
  const teamCol     = colOf('担当チーム', '担当', 'team')
  const reviewerCol = colOf('確認チーム', '確認', 'reviewer')
  const deadlineCol = colOf('期限', 'deadline', '締切')
  const titleCol    = colOf('プロジェクト名', 'ケース名', 'project')

  if (nameCol === -1) throw new Error('「ステージ名」列が見つかりません')

  const projectName = titleCol !== -1 ? String(rows[1]?.[titleCol] ?? '').trim() : 'インポートプロジェクト'
  const defaultDeadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  const stages: ParsedStage[] = rows
    .slice(1)
    .filter((r) => String(r[nameCol] ?? '').trim())
    .map((r) => ({
      name: String(r[nameCol]).trim(),
      description: descCol !== -1 ? String(r[descCol] ?? '').trim() : '',
      teamName: teamCol !== -1 ? String(r[teamCol] ?? '').trim() : '',
      reviewerTeamName: reviewerCol !== -1 ? String(r[reviewerCol] ?? '').trim() : '',
      deadline: deadlineCol !== -1 && r[deadlineCol]
        ? new Date(String(r[deadlineCol])).toISOString()
        : defaultDeadline,
    }))

  return { projectName, description: '', stages }
}

export async function POST(req: Request) {
  const deny = await assertWritable()
  if (deny) return deny
  const session = await getSession()

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return Response.json({ error: 'multipart/form-data が必要です' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return Response.json({ error: 'file フィールドがありません' }, { status: 400 })

  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!['xlsx', 'xls'].includes(ext ?? '')) {
    return Response.json({ error: '.xlsx または .xls ファイルのみ対応しています' }, { status: 400 })
  }

  let rows: unknown[][]
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const wb = read(buffer, { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    rows = utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
  } catch {
    return Response.json({ error: 'Excel の読み込みに失敗しました' }, { status: 400 })
  }

  if (rows.length < 2) {
    return Response.json({ error: 'データが見つかりません' }, { status: 400 })
  }

  // Detect format: if B1 has content and row 4 looks like headers → template format
  const isTemplate = String(rows[0]?.[1] ?? '').trim().length > 0 &&
    String(rows[3]?.[2] ?? '').includes('ステージ')

  let parsed: { projectName: string; description: string; stages: ParsedStage[] }
  try {
    parsed = isTemplate ? parseTemplate(rows) : parseSimple(rows)
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400 })
  }

  const { projectName, description, stages } = parsed

  if (!projectName) return Response.json({ error: 'プロジェクト名が見つかりません' }, { status: 400 })
  if (stages.length === 0) return Response.json({ error: 'ステージデータが見つかりません' }, { status: 400 })

  // Resolve teams
  const { data: existingTeams } = await getSupabase().from('teams').select('id, name')
  const teamMap = new Map((existingTeams ?? []).map((t) => [t.name as string, t.id as string]))
  let colorIndex = existingTeams?.length ?? 0

  // Create project
  const projectId = uuid()
  const { error: projErr } = await getSupabase().from('projects').insert({
    id: projectId,
    name: projectName,
    description,
    created_at: new Date().toISOString(),
    created_by: session?.user ?? null,
  })
  if (projErr) {
    log.error('Import: project create failed', { error: projErr.message })
    return Response.json({ error: projErr.message }, { status: 500 })
  }

  // Create stages
  let createdCount = 0
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i]
    if (!s.teamName) {
      log.warn('Import: stage skipped (no team)', { stage: s.name })
      continue
    }

    const teamId = await resolveTeam(s.teamName, teamMap, colorIndex++)
    const stageId = uuid()

    const { error: stageErr } = await getSupabase().from('stages').insert({
      id: stageId,
      project_id: projectId,
      order: i + 1,
      name: s.name,
      description: s.description || null,
      team_id: teamId,
      deadline: s.deadline,
      status: 'pending',
      email_sent: false,
    })
    if (stageErr) {
      log.error('Import: stage create failed', { stage: s.name, error: stageErr.message })
      continue
    }

    if (s.reviewerTeamName) {
      const reviewerId = await resolveTeam(s.reviewerTeamName, teamMap, colorIndex++)
      await getSupabase().from('stage_reviewers').insert({
        stage_id: stageId,
        team_id: reviewerId,
        order: 1,
        check_content: '確認完了',
        checked_at: null,
        note: null,
      })
    }

    createdCount++
  }

  revalidateTag('projects', { expire: 0 })
  log.info('Import complete', { projectId, projectName, stageCount: createdCount })

  return Response.json({ ok: true, projectId, name: projectName, stageCount: createdCount }, { status: 201 })
}

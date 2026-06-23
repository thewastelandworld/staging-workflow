import { assertWritable, getSession } from '@/lib/auth'
import { getSupabase } from '@/lib/supabase'
import { v4 as uuid } from 'uuid'
import { read, utils } from 'xlsx'
import { revalidateTag } from 'next/cache'
import { log } from '@/lib/logger'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

type ParsedReviewer = {
  teamName: string
  checkContent: string
}

type ParsedStage = {
  name: string
  description: string
  teamName: string
  reviewers: ParsedReviewer[]
  deadline: string
}

type ParsedProject = {
  name: string
  description: string
  stages: ParsedStage[]
}

const DEFAULT_DEADLINE = () =>
  new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

// Detect all (確認チーム*, 確認内容*) column index pairs from a header row.
// Handles: 確認チーム①/②/③, 確認チーム1/2/3, reviewer1/2/3, and plain 確認チーム.
function findReviewerColumns(headers: string[]): { teamCol: number; contentCol: number }[] {
  const pairs: { teamCol: number; contentCol: number }[] = []

  headers.forEach((h, i) => {
    const isTeamCol =
      (h.includes('確認チーム') || (h.includes('reviewer') && !h.includes('content') && !h.includes('check')))
    if (!isTeamCol) return

    // Extract suffix (e.g. '①', '1', '' )
    const suffix = h.replace(/確認チーム|reviewer/gi, '').trim()

    // Find matching content column: must come after, must contain suffix if suffix is non-empty
    const contentIdx = headers.findIndex((ch, ci) => {
      if (ci <= i) return false
      const isContent = ch.includes('確認内容') || ch.includes('check_content') || ch.includes('check content')
      if (!isContent) return false
      if (suffix === '') return true
      return ch.includes(suffix)
    })

    pairs.push({ teamCol: i, contentCol: contentIdx })
  })

  return pairs
}

// ── Parser A: our app's template format (single sheet, title in row 1) ──────
function parseTemplateSheet(rows: unknown[][]): ParsedProject {
  // xlsx shifts empty leading columns, so column B becomes index 0
  const name = String(rows[0]?.[0] ?? '').trim()
  const description = String(rows[1]?.[0] ?? '').trim()
  const headerRowIdx = rows.findIndex((r) =>
    r.some((cell) => String(cell).includes('ステージ'))
  )
  if (headerRowIdx === -1) throw new Error('ヘッダー行が見つかりません')

  const headers = (rows[headerRowIdx] ?? []).map((h) => String(h).trim().toLowerCase())
  const reviewerCols = findReviewerColumns(headers)

  const deadline = DEFAULT_DEADLINE()
  const stages: ParsedStage[] = rows
    .slice(headerRowIdx + 1)
    .filter((r) => String(r[1] ?? '').trim())
    .map((r) => ({
      name: String(r[1]).trim(),
      description: String(r[2] ?? '').trim(),
      teamName: String(r[3] ?? '').trim(),
      reviewers: reviewerCols
        .map(({ teamCol, contentCol }) => ({
          teamName: String(r[teamCol] ?? '').trim(),
          checkContent: contentCol !== -1 ? String(r[contentCol] ?? '').trim() : '',
        }))
        .filter((rv) => rv.teamName),
      deadline,
    }))

  return { name, description, stages }
}

// ── Parser B: per-sheet format (sheet name = case name) ────────────────────
// Format:
//   Row 1 (optional): "ケース説明" | <description text>
//   Row 2 (or 1):     headers — ステージ名 | 説明 | 担当チーム | 確認チーム | 期限
//   Row 3+ (or 2+):   stage data
function parsePerSheet(sheetName: string, rows: unknown[][]): ParsedProject {
  // Detect optional description row: first cell contains "ケース説明" or "case"
  const firstCell = String(rows[0]?.[0] ?? '').trim().toLowerCase()
  const hasDescRow = firstCell.includes('ケース説明') || firstCell.includes('case description')
  const description = hasDescRow ? String(rows[0]?.[1] ?? '').trim() : ''
  const headerRow = hasDescRow ? 1 : 0
  const dataStartRow = headerRow + 1

  const headers = (rows[headerRow] ?? []).map((h) => String(h).trim().toLowerCase())

  function colOf(...keys: string[]): number {
    for (const key of keys) {
      const i = headers.findIndex((h) => h.includes(key))
      if (i !== -1) return i
    }
    return -1
  }

  const nameCol    = colOf('ステージ名', '名前', 'stage', 'name')
  const descCol    = colOf('説明', 'description')           // '内容' alone would match '確認内容'
  const teamCol    = colOf('担当チーム', '担当', 'team')
  const deadlineCol = colOf('期限', 'deadline', '締切')

  if (nameCol === -1) throw new Error(`シート「${sheetName}」に「ステージ名」列が見つかりません`)

  const reviewerCols = findReviewerColumns(headers)

  const deadline = DEFAULT_DEADLINE()
  const stages: ParsedStage[] = rows
    .slice(dataStartRow)
    .filter((r) => String(r[nameCol] ?? '').trim())
    .map((r) => ({
      name: String(r[nameCol]).trim(),
      description: descCol !== -1 ? String(r[descCol] ?? '').trim() : '',
      teamName: teamCol !== -1 ? String(r[teamCol] ?? '').trim() : '',
      reviewers: reviewerCols
        .map(({ teamCol: tc, contentCol: cc }) => ({
          teamName: String(r[tc] ?? '').trim(),
          checkContent: cc !== -1 ? String(r[cc] ?? '').trim() : '',
        }))
        .filter((rv) => rv.teamName),
      deadline: deadlineCol !== -1 && r[deadlineCol]
        ? (() => { try { return new Date(String(r[deadlineCol])).toISOString() } catch { return deadline } })()
        : deadline,
    }))

  return { name: sheetName, description, stages }
}

// ── DB helpers ───────────────────────────────────────────────────────────────
async function resolveTeam(
  name: string,
  teamMap: Map<string, string>,
  colorIndex: { n: number },
): Promise<string> {
  const trimmed = name.trim()
  if (teamMap.has(trimmed)) return teamMap.get(trimmed)!
  const id = uuid()
  await getSupabase().from('teams').insert({
    id, name: trimmed,
    color: COLORS[colorIndex.n++ % COLORS.length],
    created_at: new Date().toISOString(),
  })
  teamMap.set(trimmed, id)
  revalidateTag('teams', { expire: 0 })
  log.info('Team auto-created during import', { name: trimmed })
  return id
}

async function createProject(
  project: ParsedProject,
  createdBy: string | null,
  teamMap: Map<string, string>,
  colorIndex: { n: number },
): Promise<{ projectId: string; stageCount: number; error?: string }> {
  const projectId = uuid()
  const { error: projErr } = await getSupabase().from('projects').insert({
    id: projectId,
    name: project.name,
    description: project.description,
    created_at: new Date().toISOString(),
    created_by: createdBy,
  })
  if (projErr) return { projectId, stageCount: 0, error: projErr.message }

  let stageCount = 0
  for (let i = 0; i < project.stages.length; i++) {
    const s = project.stages[i]
    if (!s.teamName) continue

    const teamId = await resolveTeam(s.teamName, teamMap, colorIndex)
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
    if (stageErr) continue

    for (let ri = 0; ri < s.reviewers.length; ri++) {
      const rv = s.reviewers[ri]
      const reviewerId = await resolveTeam(rv.teamName, teamMap, colorIndex)
      await getSupabase().from('stage_reviewers').insert({
        stage_id: stageId,
        team_id: reviewerId,
        order: ri + 1,
        check_content: rv.checkContent || null,
        checked_at: null,
        note: null,
      })
    }
    stageCount++
  }

  return { projectId, stageCount }
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const deny = await assertWritable()
  if (deny) return deny
  const session = await getSession()

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

  // Resolve teams shared across all sheets
  const { data: existingTeams } = await getSupabase().from('teams').select('id, name')
  const teamMap = new Map((existingTeams ?? []).map((t) => [t.name as string, t.id as string]))
  const colorIndex = { n: existingTeams?.length ?? 0 }
  const createdBy = session?.user ?? null

  const results: { name: string; stageCount: number; error?: string }[] = []

  const isMultiSheet = wb.SheetNames.length > 1

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    const rows = utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
    if (rows.length < 2) continue

    let project: ParsedProject
    try {
      if (isMultiSheet) {
        // Multi-sheet mode: each sheet = 1 case, sheet name = project name
        project = parsePerSheet(sheetName, rows)
      } else {
        // Single-sheet mode: auto-detect template vs simple format
        const hasTitle = String(rows[0]?.[0] ?? '').trim().length > 0
        const hasStageHeader = rows.some((r) => r.some((c) => String(c).includes('ステージ')))
        project = hasTitle && hasStageHeader
          ? parseTemplateSheet(rows)
          : parsePerSheet(sheetName, rows)
      }
    } catch (e) {
      results.push({ name: sheetName, stageCount: 0, error: String(e) })
      continue
    }

    if (!project.name || project.stages.length === 0) {
      results.push({ name: sheetName, stageCount: 0, error: 'ステージデータが見つかりません' })
      continue
    }

    const result = await createProject(project, createdBy, teamMap, colorIndex)
    log.info('Import: project created', { name: project.name, stageCount: result.stageCount })
    results.push({ name: project.name, stageCount: result.stageCount, error: result.error })
  }

  if (results.length === 0) {
    return Response.json({ error: 'インポートできるデータが見つかりませんでした' }, { status: 400 })
  }

  revalidateTag('projects', { expire: 0 })

  const totalStages = results.reduce((s, r) => s + r.stageCount, 0)
  return Response.json({ ok: true, projects: results, totalStages }, { status: 201 })
}

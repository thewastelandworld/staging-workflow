import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import type { Stage, StageReviewer, StageStatus, Team } from '@/lib/types'
import { toStage, type StageRow } from '@/lib/mappers'
import { revalidateTag } from 'next/cache'
import { log, notifyProblem, notifyProblemResolved, notifyStageStart, notifyReviewerTurn } from '@/lib/logger'
import { assertWritable } from '@/lib/auth'

type Params = { params: Promise<{ id: string; stageId: string }> }

// stage_reviewers テーブルの行型（ローカル定義）
type StageReviewerRow = {
  stage_id: string
  team_id: string
  order: number
  check_content: string | null
  checked_at: string | null
  note: string | null
}

// ステージ行にプロジェクト情報をジョインした型
type StageRowWithProject = StageRow & {
  stage_reviewers: StageReviewerRow[]
  projects: { id: string; name: string }
}

// ステージをレビュアー・プロジェクト情報付きで取得する
async function getStageRow(stageId: string): Promise<StageRowWithProject | null> {
  const { data, error } = await getSupabase()
    .from('stages')
    .select('*, stage_reviewers(*), projects(id, name)')
    .eq('id', stageId)
    .single()
  if (error || !data) return null
  return data as StageRowWithProject
}

// チーム一覧を取得する（通知先の特定に使用）
async function getTeams(): Promise<Team[]> {
  const { data } = await getSupabase().from('teams').select('*')
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    name: row.name as string,
    color: row.color as string,
    createdAt: row.created_at as string,
    members: (row.members as Team['members']) ?? [],
  }))
}

// 完了ステージの次のステージを in_progress に進め、担当チームに Slack 通知する。
// email_sent フラグで重複通知を防いでいる
async function advanceNextStage(
  projectId: string,
  projectName: string,
  completedStageId: string,
  completedStageOrder: number,
  teams: Team[],
  completedStageName: string,
) {
  const { data: nextRow } = await getSupabase()
    .from('stages')
    .select('id, name, description, team_id, deadline, email_sent')
    .eq('project_id', projectId)
    .gt('order', completedStageOrder)
    .order('order', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!nextRow) {
    log.info('All stages completed, no next stage', { projectId, completedStageName })
    return null
  }
  if (nextRow.email_sent) return null

  const nextTeam = teams.find((t) => t.id === nextRow.team_id)
  if (!nextTeam) {
    log.warn('Next stage has no team assigned', { projectId, nextStageId: nextRow.id })
    return null
  }
  if (nextTeam.members.length === 0) {
    log.warn('Next stage team has no members', { projectId, nextStageId: nextRow.id, teamId: nextTeam.id })
    return null
  }

  const now = new Date().toISOString()
  await getSupabase()
    .from('stages')
    .update({ status: 'in_progress', started_at: now, email_sent: true })
    .eq('id', nextRow.id)

  await notifyStageStart(projectId, projectName, nextRow.name, nextRow.description, nextRow.deadline, nextTeam.name, completedStageName)
    .then(() => log.info('Stage start notified', { projectId, nextStageId: nextRow.id, team: nextTeam.name }))
    .catch((err) => log.error('Stage start notification failed', { projectId, nextStageId: nextRow.id, error: String(err) }))

  return { success: true }
}

// PATCH /api/projects/[id]/stages/[stageId] — ステージを更新する
// body.reviewerCheck がある場合は確認チェック処理を行い、ない場合は通常更新（状態・内容変更）を行う
export async function PATCH(req: Request, { params }: Params) {
  const deny = await assertWritable()
  if (deny) return deny
  const { id, stageId } = await params
  const body = await req.json()

  const stageRow = await getStageRow(stageId)
  if (!stageRow || stageRow.project_id !== id) {
    log.warn('Stage not found', { projectId: id, stageId })
    return NextResponse.json({ error: 'Stage not found' }, { status: 404 })
  }

  const projectId = stageRow.project_id
  const projectName = stageRow.projects.name

  // ── Reviewer check ──
  if (body.reviewerCheck) {
    const { teamId } = body.reviewerCheck
    const reviewerRows = [...stageRow.stage_reviewers]
    const ri = reviewerRows.findIndex((r) => r.team_id === teamId)

    if (ri !== -1 && !reviewerRows[ri].checked_at) {
      const now = new Date().toISOString()
      const note = body.reviewerCheck.note ?? ''
      const { error: updateErr } = await getSupabase()
        .from('stage_reviewers')
        .update({ checked_at: now, note })
        .eq('stage_id', stageId)
        .eq('team_id', teamId)

      if (updateErr) {
        log.error('Failed to save reviewer check', { projectId, stageId, error: updateErr.message })
        return NextResponse.json({ error: updateErr.message }, { status: 500 })
      }
      reviewerRows[ri] = { ...reviewerRows[ri], checked_at: now, note }
      log.info('Reviewer checked', { projectId, stageId, stageName: stageRow.name, teamId })
    }

    const allChecked = reviewerRows.every((r) => r.checked_at)
    if (allChecked) {
      const now = new Date().toISOString()
      await getSupabase()
        .from('stages')
        .update({ status: 'completed', completed_at: now })
        .eq('id', stageId)
      log.info('All reviewers completed, stage done', { projectId, stageId, stageName: stageRow.name })
    }

    const teams = await getTeams()
    let emailResult = null

    if (allChecked) {
      emailResult = await advanceNextStage(projectId, projectName, stageId, stageRow.order, teams, stageRow.name)
    } else {
      const nextReviewer = [...reviewerRows].sort((a, b) => a.order - b.order).find((r) => !r.checked_at)
      if (nextReviewer) {
        const nextTeam = teams.find((t) => t.id === nextReviewer.team_id)
        const prevTeam = teams.find((t) => t.id === teamId)
        if (nextTeam && nextTeam.members.length > 0 && prevTeam) {
          await notifyReviewerTurn(projectId, projectName, stageRow.name, nextReviewer.check_content ?? undefined, stageRow.deadline, nextTeam.name, prevTeam.name)
            .then(() => log.info('Reviewer notified', { projectId, stageId, nextTeam: nextTeam.name }))
            .catch((err) => log.error('Reviewer notification failed', { projectId, stageId, error: String(err) }))
        }
      }
    }

    const stage = toStage({
      ...stageRow,
      status: allChecked ? 'completed' : stageRow.status,
      completed_at: allChecked && !stageRow.completed_at ? new Date().toISOString() : stageRow.completed_at,
      stage_reviewers: reviewerRows,
    })

    revalidateTag('projects', { expire: 0 })
    revalidateTag(`project-${projectId}`, { expire: 0 })
    return NextResponse.json({ stage, emailResult })
  }

  // ── Normal update ──
  const stage = toStage(stageRow)
  const prevStatus = stage.status
  let newStatus: StageStatus = body.status ?? stage.status
  const isRestart = (prevStatus === 'completed' || prevStatus === 'reviewing') && newStatus === 'in_progress'

  if (newStatus === 'reviewing' && prevStatus !== 'reviewing' && prevStatus !== 'completed') {
    const pendingReviewers = ((body.reviewers ?? stage.reviewers) ?? []).filter((r: { checkedAt?: string }) => !r.checkedAt)
    if (pendingReviewers.length === 0) {
      newStatus = 'completed'
    }
  }

  if (prevStatus !== newStatus) {
    log.info('Stage status changed', { projectId, stageId, stageName: stage.name, prevStatus, newStatus })
  }
  if (isRestart) {
    log.warn('Stage restarted', { projectId, stageId, stageName: stage.name })
  }

  const now = new Date().toISOString()
  const updated: Stage = {
    ...stage,
    ...body,
    status: newStatus,
    startedAt: newStatus === 'in_progress' && !stage.startedAt ? now : stage.startedAt,
    completedAt: isRestart
      ? undefined
      : newStatus === 'completed' && !stage.completedAt
        ? now
        : stage.completedAt,
    emailSent: isRestart ? false : (body.emailSent ?? stage.emailSent),
    reviewers: isRestart
      ? (stage.reviewers ?? []).map(({ checkedAt: _c, note: _n, ...rest }) => rest)
      : (body.reviewers ?? stage.reviewers ?? []),
  }

  const updatedAny = updated as unknown as Record<string, unknown>
  if (updatedAny.problem === undefined || updatedAny.problem === '') delete updatedAny.problem
  Object.keys(updatedAny).forEach((k) => updatedAny[k] === undefined && delete updatedAny[k])

  const { error: updateErr } = await getSupabase()
    .from('stages')
    .update({
      name: updated.name,
      description: updated.description ?? null,
      team_id: updated.teamId,
      deadline: updated.deadline,
      status: updated.status,
      notes: updated.notes ?? null,
      problem: (updatedAny.problem as string | undefined) ?? null,
      problem_team_id: (updatedAny.problem as string | undefined)
        ? ((updatedAny.problemTeamId as string | undefined) ?? null)
        : null,
      email_sent: updated.emailSent ?? false,
      started_at: updated.startedAt ?? null,
      completed_at: updated.completedAt ?? null,
    })
    .eq('id', stageId)

  if (updateErr) {
    log.error('Failed to update stage', { projectId, stageId, error: updateErr.message })
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  if (isRestart) {
    await getSupabase()
      .from('stage_reviewers')
      .update({ checked_at: null, note: null })
      .eq('stage_id', stageId)
  } else if (body.reviewers !== undefined) {
    await getSupabase().from('stage_reviewers').delete().eq('stage_id', stageId)
    const newReviewerRows = (body.reviewers as StageReviewer[]).map((r: StageReviewer) => ({
      stage_id: stageId,
      team_id: r.teamId,
      order: r.order,
      check_content: r.checkContent ?? null,
      checked_at: r.checkedAt ?? null,
      note: r.note ?? null,
    }))
    if (newReviewerRows.length > 0) {
      await getSupabase().from('stage_reviewers').insert(newReviewerRows)
    }
  }

  const newProblem = typeof body.problem === 'string' ? body.problem.trim() : undefined
  const prevProblem = stage.problem ?? ''
  const problemChanged = newProblem !== undefined && newProblem !== '' && newProblem !== prevProblem
  const problemResolved = newProblem === '' && prevProblem !== ''

  if (problemChanged) {
    log.warn('Stage problem reported', { projectId, stageName: stage.name, problem: newProblem })
    await notifyProblem(projectId, projectName, stage.name, newProblem!).catch((err) => {
      log.error('Failed to send Slack notification', { projectId, stageId, error: String(err) })
    })
  }
  if (problemResolved) {
    log.info('Stage problem resolved', { projectId, stageName: stage.name })
    await notifyProblemResolved(projectId, projectName, stage.name).catch((err) => {
      log.error('Failed to send problem resolved notification', { projectId, stageId, error: String(err) })
    })
  }

  let emailResult = null
  if (newStatus === 'reviewing' && prevStatus !== 'reviewing' && prevStatus !== 'completed') {
    const teams = await getTeams()
    const pendingReviewers = (updated.reviewers ?? [])
      .filter((r) => !r.checkedAt)
      .sort((a, b) => a.order - b.order)
    const firstReviewer = pendingReviewers[0]
    const reviewerTeam = teams.find((t) => t.id === firstReviewer.teamId)
    const workingTeam = teams.find((t) => t.id === updated.teamId)
    if (reviewerTeam && workingTeam) {
      await notifyReviewerTurn(projectId, projectName, updated.name, firstReviewer.checkContent, updated.deadline, reviewerTeam.name, workingTeam.name)
        .then(() => log.info('First reviewer notified on reviewing', { projectId, stageId, reviewerTeam: reviewerTeam.name }))
        .catch((err) => log.error('First reviewer notification failed', { projectId, stageId, error: String(err) }))
    }
  } else if (prevStatus !== 'completed' && newStatus === 'completed') {
    const teams = await getTeams()
    emailResult = await advanceNextStage(projectId, projectName, stageId, stageRow.order, teams, stage.name)
  }

  revalidateTag('projects', { expire: 0 })
  revalidateTag(`project-${projectId}`, { expire: 0 })
  return NextResponse.json({ stage: updated, emailResult })
}

// DELETE /api/projects/[id]/stages/[stageId] — ステージを削除する（stage_reviewers はカスケード削除）
export async function DELETE(_req: Request, { params }: Params) {
  const deny = await assertWritable()
  if (deny) return deny
  const { id, stageId } = await params

  const { data: stageRow, error: fetchErr } = await getSupabase()
    .from('stages')
    .select('name, project_id')
    .eq('id', stageId)
    .maybeSingle()

  if (fetchErr || !stageRow || stageRow.project_id !== id) {
    log.warn('Stage not found when deleting stage', { projectId: id, stageId })
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { error: deleteErr } = await getSupabase().from('stages').delete().eq('id', stageId)
  if (deleteErr) {
    log.error('Failed to delete stage', { projectId: id, stageId, error: deleteErr.message })
    return NextResponse.json({ error: deleteErr.message }, { status: 500 })
  }

  revalidateTag('projects', { expire: 0 })
  revalidateTag(`project-${id}`, { expire: 0 })
  log.info('Stage deleted', { projectId: id, stageId, stageName: stageRow.name })
  return NextResponse.json({ ok: true })
}

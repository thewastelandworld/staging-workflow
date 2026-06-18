import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import type { Stage, StageStatus, Team } from '@/lib/types'
import { revalidateTag } from 'next/cache'
import { log, notifyProblem, notifyProblemResolved, notifyStageStart, notifyReviewerTurn } from '@/lib/logger'
import { assertWritable } from '@/lib/auth'

type Params = { params: Promise<{ id: string; stageId: string }> }

async function getProjectRow(id: string) {
  const { data, error } = await getSupabase()
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()
  if (error || !data) return null
  return data
}

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

async function saveStages(projectId: string, stages: Stage[]) {
  const { error } = await getSupabase()
    .from('projects')
    .update({ stages })
    .eq('id', projectId)
  return error
}

async function advanceNextStage(
  projectId: string,
  projectName: string,
  stages: Stage[],
  teams: Team[],
  completedStageId: string,
  completedStageName: string,
) {
  const sorted = [...stages].sort((a, b) => a.order - b.order)
  const currentIndex = sorted.findIndex((s) => s.id === completedStageId)
  const nextStage = sorted[currentIndex + 1]
  if (!nextStage) {
    log.info('All stages completed, no next stage', { projectId, completedStageName })
    return null
  }
  if (nextStage.emailSent) return null

  const nextTeam = teams.find((t) => t.id === nextStage.teamId)
  if (!nextTeam) {
    log.warn('Next stage has no team assigned', { projectId, nextStageId: nextStage.id })
    return null
  }
  if (nextTeam.members.length === 0) {
    log.warn('Next stage team has no members', { projectId, nextStageId: nextStage.id, teamId: nextTeam.id })
    return null
  }

  const idx = stages.findIndex((s) => s.id === nextStage.id)
  stages[idx] = {
    ...stages[idx],
    status: 'in_progress',
    startedAt: new Date().toISOString(),
    emailSent: true,
  }

  const s = stages[idx]
  await notifyStageStart(projectId, projectName, s.name, s.description, s.deadline, nextTeam.name, completedStageName)
    .then(() => log.info('Stage start notified', { projectId, nextStageId: nextStage.id, team: nextTeam.name }))
    .catch((err) => log.error('Stage start notification failed', { projectId, nextStageId: nextStage.id, error: String(err) }))

  return { success: true }
}

export async function PATCH(req: Request, { params }: Params) {
  const deny = await assertWritable()
  if (deny) return deny
  const { id, stageId } = await params
  const body = await req.json()

  const row = await getProjectRow(id)
  if (!row) {
    log.warn('Project not found', { projectId: id })
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const stages: Stage[] = row.stages ?? []
  const stageIdx = stages.findIndex((s) => s.id === stageId)
  if (stageIdx === -1) {
    log.warn('Stage not found', { projectId: id, stageId })
    return NextResponse.json({ error: 'Stage not found' }, { status: 404 })
  }

  const stage = stages[stageIdx]

  // ── Reviewer check ──
  if (body.reviewerCheck) {
    const { teamId } = body.reviewerCheck
    const reviewers = [...(stage.reviewers ?? [])]
    const ri = reviewers.findIndex((r) => r.teamId === teamId)
    if (ri !== -1 && !reviewers[ri].checkedAt) {
      reviewers[ri] = {
        ...reviewers[ri],
        checkedAt: new Date().toISOString(),
        note: body.reviewerCheck.note ?? '',
      }
      log.info('Reviewer checked', { projectId: id, stageId, stageName: stage.name, teamId })
    }

    const allChecked = reviewers.every((r) => r.checkedAt)
    stages[stageIdx] = {
      ...stage,
      reviewers,
      status: (allChecked ? 'completed' : stage.status) as StageStatus,
      completedAt: allChecked && !stage.completedAt ? new Date().toISOString() : stage.completedAt,
    }

    if (allChecked) {
      log.info('All reviewers completed, stage done', { projectId: id, stageId, stageName: stage.name })
    }

    const saveErr = await saveStages(id, stages)
    if (saveErr) {
      log.error('Failed to save reviewer check', { projectId: id, stageId, error: saveErr.message })
      return NextResponse.json({ error: saveErr.message }, { status: 500 })
    }

    let emailResult = null
    const teams = await getTeams()

    if (allChecked) {
      emailResult = await advanceNextStage(id, row.name, stages, teams, stageId, stage.name)
      if (emailResult) await saveStages(id, stages)
    } else if (!allChecked) {
      const nextReviewer = reviewers.find((r) => !r.checkedAt)
      if (nextReviewer) {
        const nextTeam = teams.find((t) => t.id === nextReviewer.teamId)
        const prevTeam = teams.find((t) => t.id === teamId)
        if (nextTeam && nextTeam.members.length > 0 && prevTeam) {
          await notifyReviewerTurn(id, row.name, stage.name, nextReviewer.checkContent, stage.deadline, nextTeam.name, prevTeam.name)
            .then(() => log.info('Reviewer notified', { projectId: id, stageId, nextTeam: nextTeam.name }))
            .catch((err) => log.error('Reviewer notification failed', { projectId: id, stageId, error: String(err) }))
        }
      }
    }

    return NextResponse.json({ stage: stages[stageIdx], emailResult })
  }

  // ── Normal update ──
  const prevStatus = stage.status
  let newStatus: StageStatus = body.status ?? stage.status
  const isRestart = (prevStatus === 'completed' || prevStatus === 'reviewing') && newStatus === 'in_progress'

  // reviewing → completed auto-transition when no pending reviewers
  if (newStatus === 'reviewing' && prevStatus !== 'reviewing' && prevStatus !== 'completed') {
    const pendingReviewers = ((body.reviewers ?? stage.reviewers) ?? []).filter((r: { checkedAt?: string }) => !r.checkedAt)
    if (pendingReviewers.length === 0) {
      newStatus = 'completed'
    }
  }

  if (prevStatus !== newStatus) {
    log.info('Stage status changed', { projectId: id, stageId, stageName: stage.name, prevStatus, newStatus })
  }
  if (isRestart) {
    log.warn('Stage restarted', { projectId: id, stageId, stageName: stage.name })
  }

  const updated: Stage = {
    ...stage,
    ...body,
    status: newStatus,
    startedAt:
      newStatus === 'in_progress' && !stage.startedAt
        ? new Date().toISOString()
        : stage.startedAt,
    completedAt: isRestart
      ? undefined
      : newStatus === 'completed' && !stage.completedAt
        ? new Date().toISOString()
        : stage.completedAt,
    emailSent: isRestart ? false : (body.emailSent ?? stage.emailSent),
    reviewers: isRestart
      ? (stage.reviewers ?? []).map(({ checkedAt: _c, note: _n, ...rest }) => rest)
      : (body.reviewers ?? stage.reviewers ?? []),
  }

  // Remove undefined/empty-string problem field and other undefined keys
  const updatedAny = updated as unknown as Record<string, unknown>
  if (updatedAny.problem === undefined || updatedAny.problem === '') delete updatedAny.problem
  Object.keys(updatedAny).forEach((k) => updatedAny[k] === undefined && delete updatedAny[k])

  const newProblem = typeof body.problem === 'string' ? body.problem.trim() : undefined
  const prevProblem = stage.problem ?? ''
  const problemChanged = newProblem !== undefined && newProblem !== '' && newProblem !== prevProblem
  const problemResolved = newProblem === '' && prevProblem !== ''

  stages[stageIdx] = updated
  const saveErr = await saveStages(id, stages)
  if (saveErr) {
    log.error('Failed to update stage', { projectId: id, stageId, error: saveErr.message })
    return NextResponse.json({ error: saveErr.message }, { status: 500 })
  }

  if (problemChanged) {
    log.warn('Stage problem reported', { projectId: id, stageName: stage.name, problem: newProblem })
    await notifyProblem(id, row.name, stage.name, newProblem!).catch((err) => {
      log.error('Failed to send Slack notification', { projectId: id, stageId, error: String(err) })
    })
  }
  if (problemResolved) {
    log.info('Stage problem resolved', { projectId: id, stageName: stage.name })
    await notifyProblemResolved(id, row.name, stage.name).catch((err) => {
      log.error('Failed to send problem resolved notification', { projectId: id, stageId, error: String(err) })
    })
  }

  let emailResult = null
  if (newStatus === 'reviewing' && prevStatus !== 'reviewing' && prevStatus !== 'completed') {
    // 確認中へ遷移 → 最初の確認チームへ通知（確認チームなしの場合は上でcompletedに変換済み）
    const teams = await getTeams()
    const pendingReviewers = (updated.reviewers ?? [])
      .filter((r) => !r.checkedAt)
      .sort((a, b) => a.order - b.order)
    const firstReviewer = pendingReviewers[0]
    const reviewerTeam = teams.find((t) => t.id === firstReviewer.teamId)
    const workingTeam = teams.find((t) => t.id === updated.teamId)
    if (reviewerTeam && workingTeam) {
      await notifyReviewerTurn(id, row.name, updated.name, firstReviewer.checkContent, updated.deadline, reviewerTeam.name, workingTeam.name)
        .then(() => log.info('First reviewer notified on reviewing', { projectId: id, stageId, reviewerTeam: reviewerTeam.name }))
        .catch((err) => log.error('First reviewer notification failed', { projectId: id, stageId, error: String(err) }))
    }
  } else if (prevStatus !== 'completed' && newStatus === 'completed') {
    // 確認チームなし（auto-transition）または直接completedへ → 次ステージを即時開始
    const teams = await getTeams()
    emailResult = await advanceNextStage(id, row.name, stages, teams, stageId, stage.name)
    if (emailResult) await saveStages(id, stages)
  }

  revalidateTag('projects', { expire: 0 })
  revalidateTag(`project-${id}`, { expire: 0 })
  return NextResponse.json({ stage: stages[stageIdx], emailResult })
}

export async function DELETE(_req: Request, { params }: Params) {
  const deny = await assertWritable()
  if (deny) return deny
  const { id, stageId } = await params

  const row = await getProjectRow(id)
  if (!row) {
    log.warn('Project not found when deleting stage', { projectId: id, stageId })
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const stageName = (row.stages as Stage[]).find((s: Stage) => s.id === stageId)?.name
  const stages: Stage[] = (row.stages ?? []).filter((s: Stage) => s.id !== stageId)
  const saveErr2 = await saveStages(id, stages)
  if (saveErr2) {
    log.error('Failed to delete stage', { projectId: id, stageId, error: saveErr2.message })
    return NextResponse.json({ error: saveErr2.message }, { status: 500 })
  }

  revalidateTag('projects', { expire: 0 })
  revalidateTag(`project-${id}`, { expire: 0 })
  log.info('Stage deleted', { projectId: id, stageId, stageName })
  return NextResponse.json({ ok: true })
}

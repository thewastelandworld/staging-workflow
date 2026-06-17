import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { sendStageStartEmail, sendReviewerEmail } from '@/lib/email'
import type { Stage, StageStatus, Team } from '@/lib/types'
import { revalidateTag } from 'next/cache'
import { log, notifyProblem } from '@/lib/logger'
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

  const project = { id: projectId, name: projectName, stages, description: '', createdAt: '' }
  const result = await sendStageStartEmail(project, stages[idx], nextTeam, completedStageName)

  if (result.success) {
    log.info('Stage start email sent', { projectId, nextStageId: nextStage.id, team: nextTeam.name, previewUrl: result.previewUrl })
  } else {
    log.error('Stage start email failed', { projectId, nextStageId: nextStage.id, error: result.error })
  }
  return result
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

    if (allChecked && stage.status !== 'completed') {
      emailResult = await advanceNextStage(id, row.name, stages, teams, stageId, stage.name)
      if (emailResult) await saveStages(id, stages)
    } else if (!allChecked) {
      const nextReviewer = reviewers.find((r) => !r.checkedAt)
      if (nextReviewer) {
        const nextTeam = teams.find((t) => t.id === nextReviewer.teamId)
        const prevTeam = teams.find((t) => t.id === teamId)
        if (nextTeam && nextTeam.members.length > 0 && prevTeam) {
          emailResult = await sendReviewerEmail(
            { id, name: row.name, stages, description: '', createdAt: '' },
            stage,
            nextReviewer,
            nextTeam,
            prevTeam.name,
          )
          if (emailResult?.success) {
            log.info('Reviewer email sent', { projectId: id, stageId, nextTeam: nextTeam.name, previewUrl: emailResult.previewUrl })
          } else {
            log.error('Reviewer email failed', { projectId: id, stageId, error: emailResult?.error })
          }
        }
      }
    }

    return NextResponse.json({ stage: stages[stageIdx], emailResult })
  }

  // ── Normal update ──
  const prevStatus = stage.status
  const newStatus: StageStatus = body.status ?? stage.status
  const isRestart = prevStatus === 'completed' && newStatus === 'in_progress'

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

  let emailResult = null
  if (prevStatus !== 'completed' && newStatus === 'completed') {
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

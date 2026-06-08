import { NextResponse } from 'next/server'
import { readDB, writeDB } from '@/lib/db'
import { sendStageStartEmail, sendReviewerEmail } from '@/lib/email'
import type { StageStatus } from '@/lib/types'

type Params = { params: Promise<{ id: string; stageId: string }> }

async function advanceNextStage(
  db: ReturnType<typeof readDB>,
  project: (typeof db.projects)[number],
  stageId: string,
  stageName: string,
) {
  const sortedStages = [...project.stages].sort((a, b) => a.order - b.order)
  const currentIndex = sortedStages.findIndex((s) => s.id === stageId)
  const nextStage = sortedStages[currentIndex + 1]
  if (!nextStage || nextStage.emailSent) return null

  const nextTeam = db.teams.find((t) => t.id === nextStage.teamId)
  if (!nextTeam || nextTeam.members.length === 0) return null

  const nextIdx = project.stages.findIndex((s) => s.id === nextStage.id)
  project.stages[nextIdx].status = 'in_progress'
  project.stages[nextIdx].startedAt = new Date().toISOString()
  project.stages[nextIdx].emailSent = true
  writeDB(db)

  return sendStageStartEmail(project, project.stages[nextIdx], nextTeam, stageName)
}

export async function PATCH(req: Request, { params }: Params) {
  const { id, stageId } = await params
  const body = await req.json()
  const db = readDB()

  const project = db.projects.find((p) => p.id === id)
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const stageIdx = project.stages.findIndex((s) => s.id === stageId)
  if (stageIdx === -1) return NextResponse.json({ error: 'Stage not found' }, { status: 404 })

  const stage = project.stages[stageIdx]

  // Handle reviewer check
  if (body.reviewerCheck) {
    const { teamId } = body.reviewerCheck
    const reviewers = [...(stage.reviewers ?? [])]
    const ri = reviewers.findIndex((r) => r.teamId === teamId)
    if (ri !== -1 && !reviewers[ri].checkedAt) {
      reviewers[ri] = { ...reviewers[ri], checkedAt: new Date().toISOString(), note: body.reviewerCheck.note ?? '' }
    }
    const allChecked = reviewers.every((r) => r.checkedAt)
    const updated = {
      ...stage,
      reviewers,
      status: (allChecked ? 'completed' : stage.status) as StageStatus,
      completedAt: allChecked && !stage.completedAt ? new Date().toISOString() : stage.completedAt,
    }
    project.stages[stageIdx] = updated
    writeDB(db)

    let emailResult = null
    if (allChecked && stage.status !== 'completed') {
      // 全員確認済み → 次ステージへ
      emailResult = await advanceNextStage(db, project, stageId, stage.name)
    } else if (!allChecked) {
      // 次のレビュアーへ通知
      const nextReviewer = reviewers.find((r) => !r.checkedAt)
      if (nextReviewer) {
        const nextTeam = db.teams.find((t) => t.id === nextReviewer.teamId)
        const prevTeam = db.teams.find((t) => t.id === body.reviewerCheck.teamId)
        if (nextTeam && nextTeam.members.length > 0 && prevTeam) {
          emailResult = await sendReviewerEmail(project, stage, nextReviewer, nextTeam, prevTeam.name)
        }
      }
    }
    return NextResponse.json({ stage: updated, emailResult })
  }

  const prevStatus = stage.status
  const newStatus: StageStatus = body.status ?? stage.status

  // Update stage — when restarting, clear completedAt and emailSent
  const isRestart = prevStatus === 'completed' && newStatus === 'in_progress'
  const updated = {
    ...stage,
    ...body,
    status: newStatus,
    startedAt: newStatus === 'in_progress' && !stage.startedAt
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
  // Remove undefined keys so they don't persist in JSON
  Object.keys(updated).forEach((k) => (updated as Record<string, unknown>)[k] === undefined && delete (updated as Record<string, unknown>)[k])
  project.stages[stageIdx] = updated as typeof stage

  writeDB(db)

  let emailResult = null

  // Auto-send email to next team when stage is completed
  if (prevStatus !== 'completed' && newStatus === 'completed') {
    emailResult = await advanceNextStage(db, project, stageId, stage.name)
  }

  return NextResponse.json({
    stage: project.stages[stageIdx],
    emailResult,
  })
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id, stageId } = await params
  const db = readDB()
  const project = db.projects.find((p) => p.id === id)
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  project.stages = project.stages.filter((s) => s.id !== stageId)
  writeDB(db)
  return NextResponse.json({ ok: true })
}

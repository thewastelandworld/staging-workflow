import { NextResponse } from 'next/server'
import { readDB, writeDB } from '@/lib/db'
import { sendStageStartEmail } from '@/lib/email'
import type { StageStatus } from '@/lib/types'

type Params = { params: Promise<{ id: string; stageId: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const { id, stageId } = await params
  const body = await req.json()
  const db = readDB()

  const project = db.projects.find((p) => p.id === id)
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const stageIdx = project.stages.findIndex((s) => s.id === stageId)
  if (stageIdx === -1) return NextResponse.json({ error: 'Stage not found' }, { status: 404 })

  const stage = project.stages[stageIdx]
  const prevStatus = stage.status
  const newStatus: StageStatus = body.status ?? stage.status

  // Update stage
  project.stages[stageIdx] = {
    ...stage,
    ...body,
    status: newStatus,
    startedAt: newStatus === 'in_progress' && !stage.startedAt
      ? new Date().toISOString()
      : stage.startedAt,
    completedAt: newStatus === 'completed' && !stage.completedAt
      ? new Date().toISOString()
      : stage.completedAt,
  }

  writeDB(db)

  let emailResult = null

  // Auto-send email to next team when stage is completed
  if (prevStatus !== 'completed' && newStatus === 'completed') {
    const sortedStages = [...project.stages].sort((a, b) => a.order - b.order)
    const currentIndex = sortedStages.findIndex((s) => s.id === stageId)
    const nextStage = sortedStages[currentIndex + 1]

    if (nextStage && !nextStage.emailSent) {
      const nextTeam = db.teams.find((t) => t.id === nextStage.teamId)
      if (nextTeam && nextTeam.members.length > 0) {
        // Update next stage to in_progress
        const nextIdx = project.stages.findIndex((s) => s.id === nextStage.id)
        project.stages[nextIdx].status = 'in_progress'
        project.stages[nextIdx].startedAt = new Date().toISOString()
        project.stages[nextIdx].emailSent = true
        writeDB(db)

        emailResult = await sendStageStartEmail(project, project.stages[nextIdx], nextTeam, stage.name)
      }
    }
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

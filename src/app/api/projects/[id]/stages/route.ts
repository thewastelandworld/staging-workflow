import { NextResponse } from 'next/server'
import { readDB, writeDB } from '@/lib/db'
import { v4 as uuid } from 'uuid'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const db = readDB()
  const project = db.projects.find((p) => p.id === id)
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const stage = {
    id: uuid(),
    projectId: id,
    order: body.order ?? (project.stages.length + 1),
    name: body.name,
    description: body.description ?? '',
    teamId: body.teamId,
    deadline: body.deadline,
    status: 'pending' as const,
    emailSent: false,
    reviewers: (body.reviewers ?? []) as { teamId: string; order: number; checkedAt?: string }[],
  }

  project.stages.push(stage)
  project.stages.sort((a, b) => a.order - b.order)
  writeDB(db)
  return NextResponse.json(stage, { status: 201 })
}

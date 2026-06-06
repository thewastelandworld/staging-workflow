import { NextResponse } from 'next/server'
import { readDB, writeDB } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = readDB()
  const project = db.projects.find((p) => p.id === id)
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(project)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const db = readDB()
  const idx = db.projects.findIndex((p) => p.id === id)
  if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  db.projects[idx] = { ...db.projects[idx], ...body }
  writeDB(db)
  return NextResponse.json(db.projects[idx])
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = readDB()
  db.projects = db.projects.filter((p) => p.id !== id)
  writeDB(db)
  return NextResponse.json({ ok: true })
}

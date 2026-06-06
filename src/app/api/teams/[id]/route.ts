import { NextResponse } from 'next/server'
import { readDB, writeDB } from '@/lib/db'
import { v4 as uuid } from 'uuid'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  const body = await req.json()
  const db = readDB()
  const idx = db.teams.findIndex((t) => t.id === id)
  if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  db.teams[idx] = { ...db.teams[idx], ...body }
  writeDB(db)
  return NextResponse.json(db.teams[idx])
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const db = readDB()
  db.teams = db.teams.filter((t) => t.id !== id)
  writeDB(db)
  return NextResponse.json({ ok: true })
}

// Add member to team
export async function POST(req: Request, { params }: Params) {
  const { id } = await params
  const body = await req.json()
  const db = readDB()
  const team = db.teams.find((t) => t.id === id)
  if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const member = {
    id: uuid(),
    name: body.name,
    email: body.email,
    role: body.role ?? '',
  }
  team.members.push(member)
  writeDB(db)
  return NextResponse.json(member, { status: 201 })
}

import { NextResponse } from 'next/server'
import { readDB, writeDB } from '@/lib/db'
import { v4 as uuid } from 'uuid'

const TEAM_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
]

export async function GET() {
  const db = readDB()
  return NextResponse.json(db.teams)
}

export async function POST(req: Request) {
  const body = await req.json()
  const db = readDB()

  const team = {
    id: uuid(),
    name: body.name,
    color: body.color ?? TEAM_COLORS[db.teams.length % TEAM_COLORS.length],
    members: [],
    createdAt: new Date().toISOString(),
  }

  db.teams.push(team)
  writeDB(db)
  return NextResponse.json(team, { status: 201 })
}

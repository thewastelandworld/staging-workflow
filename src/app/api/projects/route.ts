import { NextResponse } from 'next/server'
import { readDB, writeDB } from '@/lib/db'
import { v4 as uuid } from 'uuid'

export async function GET() {
  const db = readDB()
  return NextResponse.json(db.projects)
}

export async function POST(req: Request) {
  const body = await req.json()
  const db = readDB()

  const project = {
    id: uuid(),
    name: body.name,
    description: body.description ?? '',
    createdAt: new Date().toISOString(),
    stages: [],
  }

  db.projects.push(project)
  writeDB(db)
  return NextResponse.json(project, { status: 201 })
}

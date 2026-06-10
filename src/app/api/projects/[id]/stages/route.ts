import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { v4 as uuid } from 'uuid'
import type { Stage } from '@/lib/types'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  const { data: row, error: fetchErr } = await supabase
    .from('projects')
    .select('stages')
    .eq('id', id)
    .single()
  if (fetchErr || !row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const stage: Stage = {
    id: uuid(),
    projectId: id,
    order: body.order ?? ((row.stages as Stage[]).length + 1),
    name: body.name,
    description: body.description ?? '',
    teamId: body.teamId,
    deadline: body.deadline,
    status: 'pending',
    emailSent: false,
    reviewers: (body.reviewers ?? []),
  }

  const stages: Stage[] = [...(row.stages as Stage[]), stage].sort((a, b) => a.order - b.order)

  const { error: updateErr } = await supabase
    .from('projects')
    .update({ stages })
    .eq('id', id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json(stage, { status: 201 })
}

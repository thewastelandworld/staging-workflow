import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { log, notifyOverdue } from '@/lib/logger'
import type { Stage } from '@/lib/types'

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = getSupabase()
  const { data: rows, error } = await supabase.from('projects').select('id, name, stages')
  if (error) {
    log.error('Cron: failed to fetch projects', { error: error.message })
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  const now = new Date()
  const overdue: { project: string; projectId: string; stage: string; deadline: string }[] = []

  for (const row of rows ?? []) {
    for (const stage of (row.stages ?? []) as Stage[]) {
      if ((stage.status === 'in_progress' || stage.status === 'reviewing') && new Date(stage.deadline) < now) {
        overdue.push({ project: row.name, projectId: row.id, stage: stage.name, deadline: stage.deadline })
      }
    }
  }

  log.info('Cron: overdue check done', { overdue: overdue.length })

  if (overdue.length > 0) {
    await notifyOverdue(overdue).catch((err) => {
      log.error('Cron: Slack notification failed', { error: String(err) })
    })
  }

  return NextResponse.json({ ok: true, overdue: overdue.length })
}

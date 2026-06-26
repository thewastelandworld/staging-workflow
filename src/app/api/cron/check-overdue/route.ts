import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { log, notifyOverdue } from '@/lib/logger'

// GET /api/cron/check-overdue — 期限超過ステージを検出して Slack に通知するバッチ処理
// CRON_SECRET が設定されている場合は Bearer トークンで認証する
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const now = new Date()
  const { data: rows, error } = await getSupabase()
    .from('stages')
    .select('id, name, deadline, project_id, projects(name)')
    .in('status', ['in_progress', 'reviewing'])
    .lt('deadline', now.toISOString())

  if (error) {
    log.error('Cron: failed to fetch overdue stages', { error: error.message })
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  const overdue = (rows ?? []).map((row) => ({
    project: (row.projects as unknown as { name: string } | null)?.name ?? '',
    projectId: row.project_id as string,
    stage: row.name as string,
    deadline: row.deadline as string,
  }))

  log.info('Cron: overdue check done', { overdue: overdue.length })

  if (overdue.length > 0) {
    await notifyOverdue(overdue).catch((err) => {
      log.error('Cron: Slack notification failed', { error: String(err) })
    })
  }

  return NextResponse.json({ ok: true, overdue: overdue.length })
}

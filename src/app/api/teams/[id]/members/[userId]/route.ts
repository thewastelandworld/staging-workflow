import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { revalidateTag } from 'next/cache'
import { log } from '@/lib/logger'
import { assertWritable } from '@/lib/auth'

type Params = { params: Promise<{ id: string; userId: string }> }

export async function DELETE(_req: Request, { params }: Params) {
  const deny = await assertWritable()
  if (deny) return deny
  const { id, userId } = await params
  const { error } = await getSupabase()
    .from('user_teams')
    .delete()
    .eq('team_id', id)
    .eq('user_id', userId)
  if (error) {
    log.error('Failed to remove member', { teamId: id, userId, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  revalidateTag('teams', { expire: 0 })
  log.info('Member removed', { teamId: id, userId })
  return NextResponse.json({ ok: true })
}

import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { v4 as uuid } from 'uuid'
import { toTeam } from '@/lib/mappers'
import { cacheLife, cacheTag, revalidateTag } from 'next/cache'
import { log } from '@/lib/logger'
import { assertAdmin } from '@/lib/auth'

// メンバー・権限・ステータスまで取得するためのジョイン SELECT 句
const MEMBER_SELECT = 'user_teams(role, users(id, username, display_name, email, permission, status))'

// 全チームをメンバー付きで取得する
async function fetchTeams() {
  'use cache'
  cacheLife('minutes')
  cacheTag('teams')
  const { data, error } = await getSupabase()
    .from('teams')
    .select(`*, ${MEMBER_SELECT}`)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map(toTeam)
}

// GET /api/teams — チーム一覧を返す（認証不要）
export async function GET() {
  try {
    return NextResponse.json(await fetchTeams())
  } catch (e) {
    log.error('Failed to fetch teams', { error: String(e) })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST /api/teams — 新規チームを作成する（admin 専用）
// color が省略された場合はプリセットの 8 色をチーム数でローテーションして割り当てる
export async function POST(req: Request) {
  const deny = await assertAdmin()
  if (deny) return deny
  const body = await req.json()
  const { data: existing } = await getSupabase().from('teams').select('id')
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

  const team = {
    id: uuid(),
    name: body.name as string,
    color: (body.color as string) ?? COLORS[(existing?.length ?? 0) % COLORS.length],
    created_at: new Date().toISOString(),
  }
  const { error } = await getSupabase().from('teams').insert(team)
  if (error) {
    log.error('Failed to create team', { name: team.name, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  revalidateTag('teams', { expire: 0 })
  log.info('Team created', { id: team.id, name: team.name, color: team.color })
  return NextResponse.json(toTeam(team), { status: 201 })
}

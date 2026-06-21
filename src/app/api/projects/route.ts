import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { v4 as uuid } from 'uuid'
import { toProject } from '@/lib/mappers'
import { cacheLife, cacheTag, revalidateTag } from 'next/cache'
import { log } from '@/lib/logger'
import { assertWritable, getSession } from '@/lib/auth'

async function fetchProjects() {
  'use cache'
  cacheLife('minutes')
  cacheTag('projects')
  const { data, error } = await getSupabase()
    .from('projects')
    .select('*, stages(*, stage_reviewers(*))')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(toProject)
}

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const allProjects = await fetchProjects()

    if (session.permission === 'admin') {
      return NextResponse.json(allProjects)
    }

    // Find teams where this user is a member (via user_teams FK table)
    const { data: currentUser } = await getSupabase()
      .from('users')
      .select('id')
      .eq('username', session.user)
      .maybeSingle()

    const userTeamIds = new Set<string>()
    if (currentUser) {
      const { data: userTeams } = await getSupabase()
        .from('user_teams')
        .select('team_id')
        .eq('user_id', currentUser.id)
      for (const row of userTeams ?? []) userTeamIds.add(row.team_id as string)
    }

    // Return only projects the user created or where their team has a stage
    const visible = allProjects.filter(
      (p) =>
        p.createdBy === session.user ||
        p.stages.some((s) => userTeamIds.has(s.teamId))
    )

    return NextResponse.json(visible)
  } catch (e) {
    log.error('Failed to fetch projects', { error: String(e) })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const deny = await assertWritable()
  if (deny) return deny
  const session = await getSession()
  const body = await req.json()
  const project = {
    id: uuid(),
    name: body.name as string,
    description: (body.description as string) ?? '',
    created_at: new Date().toISOString(),
    created_by: session?.user ?? null,
  }
  const { error } = await getSupabase().from('projects').insert(project)
  if (error) {
    log.error('Failed to create project', { name: project.name, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  revalidateTag('projects', { expire: 0 })
  log.info('Project created', { id: project.id, name: project.name })
  return NextResponse.json(toProject(project), { status: 201 })
}

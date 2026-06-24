import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ from: mockFrom }),
}))
vi.mock('uuid', () => ({ v4: () => 'mock-uuid' }))
vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({
  assertWritable: vi.fn().mockResolvedValue(null),
  assertAdmin: vi.fn().mockResolvedValue(null),
  getSession: vi.fn().mockResolvedValue({ user: 'admin', permission: 'admin', exp: Date.now() + 10000 }),
}))
vi.mock('@/lib/logger', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { GET, POST } from '../teams/route'
import { PATCH, DELETE, POST as addMember } from '../teams/[id]/route'

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

const TEAM_ROW = {
  id: 't1', name: 'Design', color: '#3b82f6',
  created_at: '2024-01-01',
  user_teams: [],
}

describe('GET /api/teams', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns mapped team list', async () => {
    const q: Record<string, () => unknown> = {}
    q.select = () => q
    q.order = () => Promise.resolve({ data: [TEAM_ROW], error: null })
    mockFrom.mockReturnValue(q)

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body[0]).toMatchObject({ id: 't1', name: 'Design', color: '#3b82f6' })
    expect(body[0].members).toEqual([])
  })

  it('returns 500 on error', async () => {
    const q: Record<string, () => unknown> = {}
    q.select = () => q
    q.order = () => Promise.resolve({ data: null, error: { message: 'fail' } })
    mockFrom.mockReturnValue(q)

    const res = await GET()
    expect(res.status).toBe(500)
  })
})

describe('POST /api/teams', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates team with auto color and returns 201', async () => {
    const existingQ: Record<string, () => unknown> = {}
    existingQ.select = () => Promise.resolve({ data: [] })

    const insertQ: Record<string, () => unknown> = {}
    insertQ.insert = () => Promise.resolve({ error: null })

    mockFrom
      .mockReturnValueOnce(existingQ)
      .mockReturnValueOnce(insertQ)

    const req = new Request('http://localhost/api/teams', {
      method: 'POST',
      body: JSON.stringify({ name: 'New Team' }),
    })

    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('mock-uuid')
    expect(body.name).toBe('New Team')
    expect(body.color).toBe('#3b82f6')
    expect(body.members).toEqual([])
  })

  it('uses provided color when given', async () => {
    const existingQ: Record<string, () => unknown> = {}
    existingQ.select = () => Promise.resolve({ data: [] })

    const insertQ: Record<string, () => unknown> = {}
    insertQ.insert = () => Promise.resolve({ error: null })

    mockFrom
      .mockReturnValueOnce(existingQ)
      .mockReturnValueOnce(insertQ)

    const req = new Request('http://localhost/api/teams', {
      method: 'POST',
      body: JSON.stringify({ name: 'Custom Color', color: '#ff0000' }),
    })

    const res = await POST(req)
    const body = await res.json()
    expect(body.color).toBe('#ff0000')
  })
})

describe('PATCH /api/teams/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates name and color', async () => {
    const q: Record<string, () => unknown> = {}
    q.update = () => q
    q.eq = () => q
    q.select = () => q
    q.single = () => Promise.resolve({ data: { ...TEAM_ROW, name: 'Updated' }, error: null })
    mockFrom.mockReturnValueOnce(q)

    const req = new Request('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated', color: '#000' }),
    })
    const res = await PATCH(req, params('t1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe('Updated')
  })
})

describe('DELETE /api/teams/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns ok', async () => {
    const q: Record<string, () => unknown> = {}
    q.delete = () => q
    q.eq = () => Promise.resolve({ error: null })
    mockFrom.mockReturnValue(q)

    const res = await DELETE(new Request('http://localhost'), params('t1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
  })
})

describe('POST /api/teams/[id] (add member)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('adds member by username and returns 201', async () => {
    // 1st call: check team exists
    const teamQ: Record<string, () => unknown> = {}
    teamQ.select = () => teamQ
    teamQ.eq = () => teamQ
    teamQ.single = () => Promise.resolve({ data: { id: 't1' }, error: null })

    // 2nd call: find user by username
    const userQ: Record<string, () => unknown> = {}
    userQ.select = () => userQ
    userQ.eq = () => userQ
    userQ.maybeSingle = () => Promise.resolve({
      data: { id: 'user-uuid', username: 'bob', display_name: 'Bob', email: 'bob@example.com' },
    })

    // 3rd call: insert user_teams
    const insertQ: Record<string, () => unknown> = {}
    insertQ.insert = () => Promise.resolve({ error: null })

    mockFrom
      .mockReturnValueOnce(teamQ)
      .mockReturnValueOnce(userQ)
      .mockReturnValueOnce(insertQ)

    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ username: 'bob', role: 'Dev' }),
    })
    const res = await addMember(req, params('t1'))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('user-uuid')
    expect(body.username).toBe('bob')
    expect(body.name).toBe('Bob')
    expect(body.email).toBe('bob@example.com')
    expect(body.role).toBe('Dev')
  })

  it('returns 404 when username not found', async () => {
    const teamQ: Record<string, () => unknown> = {}
    teamQ.select = () => teamQ
    teamQ.eq = () => teamQ
    teamQ.single = () => Promise.resolve({ data: { id: 't1' }, error: null })

    const userQ: Record<string, () => unknown> = {}
    userQ.select = () => userQ
    userQ.eq = () => userQ
    userQ.maybeSingle = () => Promise.resolve({ data: null })

    mockFrom
      .mockReturnValueOnce(teamQ)
      .mockReturnValueOnce(userQ)

    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ username: 'nobody', role: '' }),
    })
    const res = await addMember(req, params('t1'))
    expect(res.status).toBe(404)
  })
})

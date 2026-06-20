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
  getSession: vi.fn().mockResolvedValue({ user: 'admin', permission: 'admin' }),
}))
vi.mock('@/lib/logger', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { GET, POST } from '../projects/route'

function chain(result: unknown) {
  const q: Record<string, () => unknown> = {}
  q.select = () => q
  q.insert = () => q
  q.order = () => Promise.resolve(result)
  return q
}

describe('GET /api/projects', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns mapped project list', async () => {
    mockFrom.mockReturnValue(chain({
      data: [{ id: 'p1', name: 'Proj', description: 'Desc', created_at: '2024-01-01', stages: [] }],
      error: null,
    }))

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({ id: 'p1', name: 'Proj', description: 'Desc', stages: [] })
  })

  it('returns 500 on Supabase error', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: { message: 'DB error' } }))

    const res = await GET()
    expect(res.status).toBe(500)
    expect((await res.json()).error).toContain('DB error')
  })

  it('returns empty array when no data', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: null }))

    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })
})

describe('POST /api/projects', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates project and returns 201', async () => {
    const insertResult = { error: null }
    const q: Record<string, () => unknown> = {}
    q.insert = () => Promise.resolve(insertResult)
    mockFrom.mockReturnValue(q)

    const req = new Request('http://localhost/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'New Case', description: 'Desc' }),
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.id).toBe('mock-uuid')
    expect(body.name).toBe('New Case')
    expect(body.description).toBe('Desc')
    expect(body.stages).toEqual([])
  })

  it('defaults description to empty string', async () => {
    const q: Record<string, () => unknown> = {}
    q.insert = () => Promise.resolve({ error: null })
    mockFrom.mockReturnValue(q)

    const req = new Request('http://localhost/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'No Desc' }),
    })

    const res = await POST(req)
    const body = await res.json()
    expect(body.description).toBe('')
  })

  it('returns 500 on insert error', async () => {
    const q: Record<string, () => unknown> = {}
    q.insert = () => Promise.resolve({ error: { message: 'Insert failed' } })
    mockFrom.mockReturnValue(q)

    const req = new Request('http://localhost/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'Fail' }),
    })

    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})

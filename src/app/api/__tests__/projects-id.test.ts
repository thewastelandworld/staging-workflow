import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ from: mockFrom }),
}))
vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ assertWritable: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/logger', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { GET, PATCH, DELETE } from '../projects/[id]/route'

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

const ROW = { id: 'p1', name: 'Proj', description: 'Desc', created_at: '2024-01-01', stages: [] }

describe('GET /api/projects/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns mapped project', async () => {
    const q: Record<string, () => unknown> = {}
    q.select = () => q
    q.eq = () => q
    q.single = () => Promise.resolve({ data: ROW, error: null })
    mockFrom.mockReturnValue(q)

    const res = await GET(new Request('http://localhost'), params('p1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ id: 'p1', name: 'Proj' })
  })

  it('returns 404 when not found', async () => {
    const q: Record<string, () => unknown> = {}
    q.select = () => q
    q.eq = () => q
    q.single = () => Promise.resolve({ data: null, error: { message: 'Not found' } })
    mockFrom.mockReturnValue(q)

    const res = await GET(new Request('http://localhost'), params('missing'))
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/projects/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates and returns project', async () => {
    const updated = { ...ROW, name: 'Updated' }
    const q: Record<string, () => unknown> = {}
    q.update = () => q
    q.eq = () => q
    q.select = () => q
    q.single = () => Promise.resolve({ data: updated, error: null })
    mockFrom.mockReturnValue(q)

    const req = new Request('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated', description: 'Desc' }),
    })
    const res = await PATCH(req, params('p1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe('Updated')
  })

  it('returns 404 on error', async () => {
    const q: Record<string, () => unknown> = {}
    q.update = () => q
    q.eq = () => q
    q.select = () => q
    q.single = () => Promise.resolve({ data: null, error: { message: 'err' } })
    mockFrom.mockReturnValue(q)

    const req = new Request('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'X' }),
    })
    const res = await PATCH(req, params('p1'))
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/projects/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns ok on success', async () => {
    const q: Record<string, () => unknown> = {}
    q.delete = () => q
    q.eq = () => Promise.resolve({ error: null })
    mockFrom.mockReturnValue(q)

    const res = await DELETE(new Request('http://localhost'), params('p1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
  })

  it('returns 500 on error', async () => {
    const q: Record<string, () => unknown> = {}
    q.delete = () => q
    q.eq = () => Promise.resolve({ error: { message: 'Delete failed' } })
    mockFrom.mockReturnValue(q)

    const res = await DELETE(new Request('http://localhost'), params('p1'))
    expect(res.status).toBe(500)
  })
})

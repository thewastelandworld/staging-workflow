import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ from: mockFrom }),
}))
vi.mock('uuid', () => ({ v4: () => 'mock-stage-uuid' }))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}))
vi.mock('@/lib/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { POST } from '../projects/[id]/stages/route'

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

function getChain(result: unknown) {
  const q: Record<string, () => unknown> = {}
  q.select = () => q
  q.eq = () => q
  q.single = () => Promise.resolve(result)
  return q
}

function updateChain(result: unknown) {
  const q: Record<string, () => unknown> = {}
  q.update = () => q
  q.eq = () => Promise.resolve(result)
  return q
}

const EXISTING_STAGE = {
  id: 'existing-1', projectId: 'p1', order: 1, name: 'First Stage',
  teamId: 't1', deadline: '2025-12-01T00:00:00Z', status: 'pending', emailSent: false,
}

describe('POST /api/projects/[id]/stages', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a stage and returns 201', async () => {
    mockFrom
      .mockReturnValueOnce(getChain({ data: { stages: [] }, error: null }))
      .mockReturnValueOnce(updateChain({ error: null }))

    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Design Review', description: '説明', teamId: 't1',
        deadline: '2025-03-01T09:00', order: 1, reviewers: [],
      }),
    })
    const res = await POST(req, params('p1'))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('mock-stage-uuid')
    expect(body.name).toBe('Design Review')
    expect(body.description).toBe('説明')
    expect(body.teamId).toBe('t1')
    expect(body.status).toBe('pending')
    expect(body.emailSent).toBe(false)
  })

  it('auto-assigns order based on existing stages when not provided', async () => {
    mockFrom
      .mockReturnValueOnce(getChain({ data: { stages: [EXISTING_STAGE] }, error: null }))
      .mockReturnValueOnce(updateChain({ error: null }))

    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ name: 'New Stage', teamId: 't1', deadline: '2025-03-01T09:00' }),
    })
    const res = await POST(req, params('p1'))
    const body = await res.json()
    expect(body.order).toBe(2) // existing has 1 stage → length + 1 = 2
  })

  it('includes reviewers when provided', async () => {
    mockFrom
      .mockReturnValueOnce(getChain({ data: { stages: [] }, error: null }))
      .mockReturnValueOnce(updateChain({ error: null }))

    const reviewers = [{ teamId: 't2', order: 1, checkContent: '確認内容' }]
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Stage', teamId: 't1', deadline: '2025-03-01T09:00', order: 1, reviewers,
      }),
    })
    const res = await POST(req, params('p1'))
    const body = await res.json()
    expect(body.reviewers).toEqual(reviewers)
  })

  it('defaults description to empty string when omitted', async () => {
    mockFrom
      .mockReturnValueOnce(getChain({ data: { stages: [] }, error: null }))
      .mockReturnValueOnce(updateChain({ error: null }))

    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ name: 'Stage', teamId: 't1', deadline: '2025-03-01T09:00', order: 1 }),
    })
    const res = await POST(req, params('p1'))
    const body = await res.json()
    expect(body.description).toBe('')
  })

  it('returns 404 when project not found', async () => {
    mockFrom.mockReturnValueOnce(getChain({ data: null, error: { message: 'not found' } }))

    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ name: 'Stage', teamId: 't1', deadline: '2025-03-01T09:00', order: 1 }),
    })
    const res = await POST(req, params('missing'))
    expect(res.status).toBe(404)
  })

  it('returns 500 on save error', async () => {
    mockFrom
      .mockReturnValueOnce(getChain({ data: { stages: [] }, error: null }))
      .mockReturnValueOnce(updateChain({ error: { message: 'DB error' } }))

    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ name: 'Stage', teamId: 't1', deadline: '2025-03-01T09:00', order: 1 }),
    })
    const res = await POST(req, params('p1'))
    expect(res.status).toBe(500)
  })
})

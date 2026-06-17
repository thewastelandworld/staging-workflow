import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ from: mockFrom }),
}))
vi.mock('@/lib/email', () => ({
  sendStageStartEmail: vi.fn().mockResolvedValue({ success: true, previewUrl: 'http://preview' }),
  sendReviewerEmail: vi.fn().mockResolvedValue({ success: true, previewUrl: 'http://preview' }),
}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}))
vi.mock('@/lib/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/auth', () => ({ assertWritable: vi.fn().mockResolvedValue(null) }))

import { PATCH, DELETE } from '../projects/[id]/stages/[stageId]/route'

function params(id: string, stageId: string) {
  return { params: Promise.resolve({ id, stageId }) }
}

// .from('projects').select('*').eq().single()
function projectChain(result: unknown) {
  const q: Record<string, () => unknown> = {}
  q.select = () => q
  q.eq = () => q
  q.single = () => Promise.resolve(result)
  return q
}

// .from('projects').update({}).eq()
function updateChain(result: unknown) {
  const q: Record<string, () => unknown> = {}
  q.update = () => q
  q.eq = () => Promise.resolve(result)
  return q
}

// .from('teams').select('*')
function teamsChain(data: unknown) {
  const q: Record<string, () => unknown> = {}
  q.select = () => Promise.resolve(data)
  return q
}

const TEAM = {
  id: 't1', name: 'Dev Team', color: '#000', created_at: '2024-01-01',
  members: [{ id: 'm1', name: 'Alice', email: 'alice@example.com', role: '' }],
}

const STAGE = {
  id: 's1', projectId: 'p1', order: 1, name: 'Design Review',
  teamId: 't1', deadline: '2025-12-31T00:00:00Z',
  status: 'pending', emailSent: false, reviewers: [],
}

const PROJECT_ROW = { id: 'p1', name: 'Test Proj', stages: [STAGE] }

describe('PATCH /api/projects/[id]/stages/[stageId]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 404 when project not found', async () => {
    mockFrom.mockReturnValue(projectChain({ data: null, error: { message: 'not found' } }))
    const req = new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ name: 'X' }) })
    const res = await PATCH(req, params('missing', 's1'))
    expect(res.status).toBe(404)
  })

  it('returns 404 when stage not found', async () => {
    mockFrom.mockReturnValue(projectChain({ data: PROJECT_ROW, error: null }))
    const req = new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ name: 'X' }) })
    const res = await PATCH(req, params('p1', 'no-such-stage'))
    expect(res.status).toBe(404)
  })

  it('updates stage fields and returns 200', async () => {
    mockFrom
      .mockReturnValueOnce(projectChain({ data: PROJECT_ROW, error: null }))
      .mockReturnValueOnce(updateChain({ error: null }))

    const req = new Request('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ description: '新しい説明', name: '更新後名' }),
    })
    const res = await PATCH(req, params('p1', 's1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.stage.description).toBe('新しい説明')
    expect(body.stage.name).toBe('更新後名')
  })

  it('sets startedAt when status changes to in_progress', async () => {
    mockFrom
      .mockReturnValueOnce(projectChain({ data: PROJECT_ROW, error: null }))
      .mockReturnValueOnce(updateChain({ error: null }))

    const req = new Request('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'in_progress' }),
    })
    const res = await PATCH(req, params('p1', 's1'))
    const body = await res.json()
    expect(body.stage.startedAt).toBeTruthy()
    expect(body.stage.status).toBe('in_progress')
  })

  it('sets completedAt when status changes to completed', async () => {
    mockFrom
      .mockReturnValueOnce(projectChain({ data: PROJECT_ROW, error: null }))
      .mockReturnValueOnce(updateChain({ error: null }))
      .mockReturnValueOnce(teamsChain({ data: [TEAM] })) // getTeams for advanceNextStage

    const req = new Request('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'completed' }),
    })
    const res = await PATCH(req, params('p1', 's1'))
    const body = await res.json()
    expect(body.stage.completedAt).toBeTruthy()
    expect(body.stage.status).toBe('completed')
  })

  it('resets reviewers and emailSent on restart', async () => {
    const completedStage = {
      ...STAGE, status: 'completed', emailSent: true,
      reviewers: [{ teamId: 't2', order: 1, checkContent: 'X', checkedAt: '2025-01-01', note: 'OK' }],
    }
    mockFrom
      .mockReturnValueOnce(projectChain({ data: { ...PROJECT_ROW, stages: [completedStage] }, error: null }))
      .mockReturnValueOnce(updateChain({ error: null }))

    const req = new Request('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'in_progress' }),
    })
    const res = await PATCH(req, params('p1', 's1'))
    const body = await res.json()
    expect(body.stage.emailSent).toBe(false)
    expect(body.stage.reviewers[0].checkedAt).toBeUndefined()
    expect(body.stage.reviewers[0].note).toBeUndefined()
  })

  it('updates reviewer checkContent via bulk edit (reviewers in body)', async () => {
    const stageWithReviewer = {
      ...STAGE, status: 'in_progress',
      reviewers: [{ teamId: 't2', order: 1, checkContent: '旧内容' }],
    }
    mockFrom
      .mockReturnValueOnce(projectChain({ data: { ...PROJECT_ROW, stages: [stageWithReviewer] }, error: null }))
      .mockReturnValueOnce(updateChain({ error: null }))

    const req = new Request('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ reviewers: [{ teamId: 't2', order: 1, checkContent: '新しい確認内容' }] }),
    })
    const res = await PATCH(req, params('p1', 's1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.stage.reviewers[0].checkContent).toBe('新しい確認内容')
  })

  it('returns 500 on save error', async () => {
    mockFrom
      .mockReturnValueOnce(projectChain({ data: PROJECT_ROW, error: null }))
      .mockReturnValueOnce(updateChain({ error: { message: 'DB fail' } }))

    const req = new Request('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'X' }),
    })
    const res = await PATCH(req, params('p1', 's1'))
    expect(res.status).toBe(500)
  })

  describe('reviewer check', () => {
    const STAGE_WITH_REVIEWER = {
      ...STAGE, status: 'in_progress',
      reviewers: [{ teamId: 't2', order: 1, checkContent: '確認事項' }],
    }
    const ROW_WITH_REVIEWER = { ...PROJECT_ROW, stages: [STAGE_WITH_REVIEWER] }

    it('marks reviewer checkedAt when reviewer check submitted', async () => {
      mockFrom
        .mockReturnValueOnce(projectChain({ data: ROW_WITH_REVIEWER, error: null }))
        .mockReturnValueOnce(updateChain({ error: null }))
        .mockReturnValueOnce(teamsChain({ data: [TEAM] })) // getTeams

      const req = new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ reviewerCheck: { teamId: 't2', note: 'LGTM' } }),
      })
      const res = await PATCH(req, params('p1', 's1'))
      expect(res.status).toBe(200)
      const body = await res.json()
      const reviewer = body.stage.reviewers[0]
      expect(reviewer.checkedAt).toBeTruthy()
      expect(reviewer.note).toBe('LGTM')
    })

    it('stage becomes completed when all reviewers done', async () => {
      mockFrom
        .mockReturnValueOnce(projectChain({ data: ROW_WITH_REVIEWER, error: null }))
        .mockReturnValueOnce(updateChain({ error: null }))
        .mockReturnValueOnce(teamsChain({ data: [TEAM] })) // getTeams

      const req = new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ reviewerCheck: { teamId: 't2' } }),
      })
      const res = await PATCH(req, params('p1', 's1'))
      const body = await res.json()
      expect(body.stage.status).toBe('completed')
    })

    it('already-checked reviewer cannot be re-checked', async () => {
      const checkedStage = {
        ...STAGE_WITH_REVIEWER,
        reviewers: [{ teamId: 't2', order: 1, checkContent: '', checkedAt: '2025-01-01T00:00:00Z' }],
      }
      mockFrom
        .mockReturnValueOnce(projectChain({ data: { ...PROJECT_ROW, stages: [checkedStage] }, error: null }))
        .mockReturnValueOnce(updateChain({ error: null }))
        .mockReturnValueOnce(teamsChain({ data: [TEAM] }))

      const req = new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ reviewerCheck: { teamId: 't2' } }),
      })
      const res = await PATCH(req, params('p1', 's1'))
      const body = await res.json()
      // checkedAt should remain original value, not be overwritten
      expect(body.stage.reviewers[0].checkedAt).toBe('2025-01-01T00:00:00Z')
    })

    it('returns 500 when reviewer check save fails', async () => {
      mockFrom
        .mockReturnValueOnce(projectChain({ data: ROW_WITH_REVIEWER, error: null }))
        .mockReturnValueOnce(updateChain({ error: { message: 'save failed' } }))

      const req = new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ reviewerCheck: { teamId: 't2' } }),
      })
      const res = await PATCH(req, params('p1', 's1'))
      expect(res.status).toBe(500)
    })
  })
})

describe('DELETE /api/projects/[id]/stages/[stageId]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 404 when project not found', async () => {
    mockFrom.mockReturnValue(projectChain({ data: null, error: { message: 'not found' } }))
    const res = await DELETE(new Request('http://localhost'), params('missing', 's1'))
    expect(res.status).toBe(404)
  })

  it('deletes stage and returns ok', async () => {
    mockFrom
      .mockReturnValueOnce(projectChain({ data: PROJECT_ROW, error: null }))
      .mockReturnValueOnce(updateChain({ error: null }))

    const res = await DELETE(new Request('http://localhost'), params('p1', 's1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
  })

  it('returns 500 on save error', async () => {
    mockFrom
      .mockReturnValueOnce(projectChain({ data: PROJECT_ROW, error: null }))
      .mockReturnValueOnce(updateChain({ error: { message: 'fail' } }))

    const res = await DELETE(new Request('http://localhost'), params('p1', 's1'))
    expect(res.status).toBe(500)
  })
})

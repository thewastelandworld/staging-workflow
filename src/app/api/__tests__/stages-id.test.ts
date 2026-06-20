import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ from: mockFrom }),
}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}))
vi.mock('@/lib/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  notifyProblem: vi.fn().mockResolvedValue(undefined),
  notifyProblemResolved: vi.fn().mockResolvedValue(undefined),
  notifyStageStart: vi.fn().mockResolvedValue(undefined),
  notifyReviewerTurn: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/auth', () => ({ assertWritable: vi.fn().mockResolvedValue(null) }))

import { PATCH, DELETE } from '../projects/[id]/stages/[stageId]/route'

function params(id: string, stageId: string) {
  return { params: Promise.resolve({ id, stageId }) }
}

// .from('stages').select('*, stage_reviewers(*), projects(id,name)').eq().single()
function stageChain(result: unknown) {
  const q: Record<string, () => unknown> = {}
  q.select = () => q
  q.eq = () => q
  q.single = () => Promise.resolve(result)
  return q
}

// .from('stages').update({}).eq() or
// .from('stage_reviewers').update({}).eq()
function updateChain(result: unknown) {
  const q: Record<string, () => unknown> = {}
  q.update = () => q
  q.eq = () => Promise.resolve(result)
  return q
}

// .from('stage_reviewers').update({}).eq('stage_id', x).eq('team_id', y)
function reviewerUpdateChain(result: unknown) {
  const inner: Record<string, () => unknown> = {}
  inner.eq = () => Promise.resolve(result)
  const q: Record<string, () => unknown> = {}
  q.update = () => q
  q.eq = () => inner
  return q
}

// .from('teams').select('*')
function teamsChain(data: unknown) {
  const q: Record<string, () => unknown> = {}
  q.select = () => Promise.resolve(data)
  return q
}

// .from('stages').select().eq().gt().order().limit().maybeSingle() — advanceNextStage
function nextStageChain(result: unknown) {
  const q: Record<string, () => unknown> = {}
  q.select = () => q
  q.eq = () => q
  q.gt = () => q
  q.order = () => q
  q.limit = () => q
  q.maybeSingle = () => Promise.resolve(result)
  return q
}

// .from('stage_reviewers').delete().eq() or .from('stages').delete().eq()
function deleteChain(result: unknown) {
  const q: Record<string, () => unknown> = {}
  q.delete = () => q
  q.eq = () => Promise.resolve(result)
  return q
}

// .from('stage_reviewers').insert()
function insertChain(result: unknown) {
  const q: Record<string, () => unknown> = {}
  q.insert = () => Promise.resolve(result)
  return q
}

// .from('stages').select('name, project_id').eq().maybeSingle() — DELETE fetch
function maybeSingleChain(result: unknown) {
  const q: Record<string, () => unknown> = {}
  q.select = () => q
  q.eq = () => q
  q.maybeSingle = () => Promise.resolve(result)
  return q
}

const TEAM = {
  id: 't1', name: 'Dev Team', color: '#000', created_at: '2024-01-01',
  members: [{ id: 'm1', name: 'Alice', email: 'alice@example.com', role: '' }],
}

const STAGE_ROW = {
  id: 's1',
  project_id: 'p1',
  order: 1,
  name: 'Design Review',
  team_id: 't1',
  deadline: '2025-12-31T00:00:00Z',
  status: 'pending',
  email_sent: false,
  description: null,
  started_at: null,
  completed_at: null,
  notes: null,
  problem: null,
  stage_reviewers: [],
  projects: { id: 'p1', name: 'Test Proj' },
}

describe('PATCH /api/projects/[id]/stages/[stageId]', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 404 when project not found', async () => {
    mockFrom.mockReturnValue(stageChain({ data: null, error: { message: 'not found' } }))
    const req = new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ name: 'X' }) })
    const res = await PATCH(req, params('missing', 's1'))
    expect(res.status).toBe(404)
  })

  it('returns 404 when stage not found', async () => {
    mockFrom.mockReturnValue(stageChain({ data: null, error: { message: 'not found' } }))
    const req = new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ name: 'X' }) })
    const res = await PATCH(req, params('p1', 'no-such-stage'))
    expect(res.status).toBe(404)
  })

  it('updates stage fields and returns 200', async () => {
    mockFrom
      .mockReturnValueOnce(stageChain({ data: STAGE_ROW, error: null }))
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
      .mockReturnValueOnce(stageChain({ data: STAGE_ROW, error: null }))
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
      .mockReturnValueOnce(stageChain({ data: STAGE_ROW, error: null }))
      .mockReturnValueOnce(updateChain({ error: null }))        // update stage
      .mockReturnValueOnce(teamsChain({ data: [TEAM] }))        // getTeams
      .mockReturnValueOnce(nextStageChain({ data: null, error: null })) // advanceNextStage - no next

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
    const completedStageRow = {
      ...STAGE_ROW,
      status: 'completed',
      email_sent: true,
      stage_reviewers: [{ stage_id: 's1', team_id: 't2', order: 1, check_content: 'X', checked_at: '2025-01-01', note: 'OK' }],
    }
    mockFrom
      .mockReturnValueOnce(stageChain({ data: completedStageRow, error: null }))
      .mockReturnValueOnce(updateChain({ error: null }))  // update stage
      .mockReturnValueOnce(updateChain({ error: null }))  // clear stage_reviewers

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
    const stageRowWithReviewer = {
      ...STAGE_ROW,
      status: 'in_progress',
      stage_reviewers: [{ stage_id: 's1', team_id: 't2', order: 1, check_content: '旧内容', checked_at: null, note: null }],
    }
    mockFrom
      .mockReturnValueOnce(stageChain({ data: stageRowWithReviewer, error: null }))
      .mockReturnValueOnce(updateChain({ error: null }))   // update stage
      .mockReturnValueOnce(deleteChain({ error: null }))   // delete old reviewers
      .mockReturnValueOnce(insertChain({ error: null }))   // insert new reviewers

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
      .mockReturnValueOnce(stageChain({ data: STAGE_ROW, error: null }))
      .mockReturnValueOnce(updateChain({ error: { message: 'DB fail' } }))

    const req = new Request('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'X' }),
    })
    const res = await PATCH(req, params('p1', 's1'))
    expect(res.status).toBe(500)
  })

  describe('reviewer check', () => {
    const stageRowWithReviewer = {
      ...STAGE_ROW,
      status: 'in_progress',
      stage_reviewers: [{ stage_id: 's1', team_id: 't2', order: 1, check_content: '確認事項', checked_at: null, note: null }],
    }

    it('marks reviewer checkedAt when reviewer check submitted', async () => {
      mockFrom
        .mockReturnValueOnce(stageChain({ data: stageRowWithReviewer, error: null }))
        .mockReturnValueOnce(reviewerUpdateChain({ error: null }))  // update stage_reviewers
        .mockReturnValueOnce(updateChain({ error: null }))           // update stage (allChecked)
        .mockReturnValueOnce(teamsChain({ data: [TEAM] }))           // getTeams
        .mockReturnValueOnce(nextStageChain({ data: null, error: null })) // advanceNextStage

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
        .mockReturnValueOnce(stageChain({ data: stageRowWithReviewer, error: null }))
        .mockReturnValueOnce(reviewerUpdateChain({ error: null }))
        .mockReturnValueOnce(updateChain({ error: null }))
        .mockReturnValueOnce(teamsChain({ data: [TEAM] }))
        .mockReturnValueOnce(nextStageChain({ data: null, error: null }))

      const req = new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ reviewerCheck: { teamId: 't2' } }),
      })
      const res = await PATCH(req, params('p1', 's1'))
      const body = await res.json()
      expect(body.stage.status).toBe('completed')
    })

    it('already-checked reviewer cannot be re-checked', async () => {
      const alreadyCheckedRow = {
        ...STAGE_ROW,
        status: 'in_progress',
        stage_reviewers: [{ stage_id: 's1', team_id: 't2', order: 1, check_content: '', checked_at: '2025-01-01T00:00:00Z', note: '' }],
      }
      mockFrom
        .mockReturnValueOnce(stageChain({ data: alreadyCheckedRow, error: null }))
        .mockReturnValueOnce(updateChain({ error: null }))           // update stage (allChecked=true)
        .mockReturnValueOnce(teamsChain({ data: [TEAM] }))           // getTeams
        .mockReturnValueOnce(nextStageChain({ data: null, error: null })) // advanceNextStage

      const req = new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ reviewerCheck: { teamId: 't2' } }),
      })
      const res = await PATCH(req, params('p1', 's1'))
      const body = await res.json()
      expect(body.stage.reviewers[0].checkedAt).toBe('2025-01-01T00:00:00Z')
    })

    it('returns 500 when reviewer check save fails', async () => {
      mockFrom
        .mockReturnValueOnce(stageChain({ data: stageRowWithReviewer, error: null }))
        .mockReturnValueOnce(reviewerUpdateChain({ error: { message: 'save failed' } }))

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
  beforeEach(() => vi.resetAllMocks())

  it('returns 404 when stage not found', async () => {
    mockFrom.mockReturnValue(maybeSingleChain({ data: null, error: { message: 'not found' } }))
    const res = await DELETE(new Request('http://localhost'), params('missing', 's1'))
    expect(res.status).toBe(404)
  })

  it('deletes stage and returns ok', async () => {
    mockFrom
      .mockReturnValueOnce(maybeSingleChain({ data: { name: 'Design Review', project_id: 'p1' }, error: null }))
      .mockReturnValueOnce(deleteChain({ error: null }))

    const res = await DELETE(new Request('http://localhost'), params('p1', 's1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
  })

  it('returns 500 on delete error', async () => {
    mockFrom
      .mockReturnValueOnce(maybeSingleChain({ data: { name: 'Design Review', project_id: 'p1' }, error: null }))
      .mockReturnValueOnce(deleteChain({ error: { message: 'fail' } }))

    const res = await DELETE(new Request('http://localhost'), params('p1', 's1'))
    expect(res.status).toBe(500)
  })
})

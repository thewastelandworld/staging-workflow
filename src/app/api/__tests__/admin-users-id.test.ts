import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ from: mockFrom }),
}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({
  getSession: vi.fn(),
}))

import { PATCH, DELETE } from '../admin/users/[id]/route'
import { getSession } from '@/lib/auth'
import { revalidateTag } from 'next/cache'

const mockGetSession = vi.mocked(getSession)
const mockRevalidateTag = vi.mocked(revalidateTag)

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

// Ends with .select().eq().single()
function singleQ(data: unknown, error: unknown = null) {
  const q: Record<string, () => unknown> = {}
  q.select = () => q
  q.eq = () => q
  q.single = () => Promise.resolve({ data, error })
  return q
}

// Ends with .eq() (select/update/delete chains)
function eqQ(data: unknown = null, error: unknown = null) {
  const q: Record<string, () => unknown> = {}
  q.select = () => q
  q.update = () => q
  q.delete = () => q
  q.eq = () => Promise.resolve({ data, error })
  return q
}

const ADMIN_SESSION = { user: 'admin', permission: 'admin' as const, exp: Date.now() + 10000 }
const LEADER_SESSION = { user: 'leader', permission: 'team_leader' as const, exp: Date.now() + 10000 }

function patchReq(body: unknown) {
  return new Request('http://localhost', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/admin/users/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue(ADMIN_SESSION)
  })

  it('returns 403 when not logged in', async () => {
    mockGetSession.mockResolvedValue(null)
    const res = await PATCH(patchReq({ approve: true }), params('u1'))
    expect(res.status).toBe(403)
  })

  it('returns 403 for regular user permission', async () => {
    mockGetSession.mockResolvedValue({ user: 'user1', permission: 'user' as const, exp: Date.now() + 10000 })
    const res = await PATCH(patchReq({ approve: true }), params('u1'))
    expect(res.status).toBe(403)
  })

  it('returns 400 when trying to modify self', async () => {
    mockFrom.mockReturnValue(singleQ({ username: 'admin' }))
    const res = await PATCH(patchReq({ approve: true }), params('u1'))
    expect(res.status).toBe(400)
  })

  describe('admin approve', () => {
    it('approves user and calls revalidateTag', async () => {
      mockFrom
        .mockReturnValueOnce(singleQ({ username: 'bob' }))  // get target
        .mockReturnValueOnce(eqQ(null, null))                // update status
      const res = await PATCH(patchReq({ approve: true }), params('u1'))
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ ok: true })
      expect(mockRevalidateTag).toHaveBeenCalledWith('teams', { expire: 0 })
    })

    it('returns 500 when DB update fails', async () => {
      mockFrom
        .mockReturnValueOnce(singleQ({ username: 'bob' }))
        .mockReturnValueOnce(eqQ(null, { message: 'DB error' }))
      const res = await PATCH(patchReq({ approve: true }), params('u1'))
      expect(res.status).toBe(500)
    })
  })

  describe('admin permission change', () => {
    it('changes permission and calls revalidateTag', async () => {
      mockFrom
        .mockReturnValueOnce(singleQ({ username: 'bob' }))
        .mockReturnValueOnce(eqQ(null, null))
      const res = await PATCH(patchReq({ permission: 'team_leader' }), params('u1'))
      expect(res.status).toBe(200)
      expect(mockRevalidateTag).toHaveBeenCalledWith('teams', { expire: 0 })
    })

    it('returns 400 for invalid permission value', async () => {
      mockFrom.mockReturnValueOnce(singleQ({ username: 'bob' }))
      const res = await PATCH(patchReq({ permission: 'superadmin' }), params('u1'))
      expect(res.status).toBe(400)
    })
  })

  describe('team leader approve', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(LEADER_SESSION)
    })

    it('approves user in own team and calls revalidateTag', async () => {
      mockFrom
        .mockReturnValueOnce(singleQ({ username: 'bob' }))             // get target username
        .mockReturnValueOnce(singleQ({ id: 'leader-id' }))             // get leader's user id
        .mockReturnValueOnce(eqQ([{ team_id: 'team-1' }]))             // leader's teams
        .mockReturnValueOnce(eqQ([{ team_id: 'team-1' }]))             // target's teams
        .mockReturnValueOnce(eqQ(null, null))                          // update status
      const res = await PATCH(patchReq({ approve: true }), params('u2'))
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ ok: true })
      expect(mockRevalidateTag).toHaveBeenCalledWith('teams', { expire: 0 })
    })

    it('returns 403 when target is not in leader team', async () => {
      mockFrom
        .mockReturnValueOnce(singleQ({ username: 'bob' }))
        .mockReturnValueOnce(singleQ({ id: 'leader-id' }))
        .mockReturnValueOnce(eqQ([{ team_id: 'team-1' }]))
        .mockReturnValueOnce(eqQ([{ team_id: 'team-2' }]))
      const res = await PATCH(patchReq({ approve: true }), params('u2'))
      expect(res.status).toBe(403)
    })

    it('returns 403 when leader has no teams', async () => {
      mockFrom
        .mockReturnValueOnce(singleQ({ username: 'bob' }))
        .mockReturnValueOnce(singleQ({ id: 'leader-id' }))
        .mockReturnValueOnce(eqQ([]))
        .mockReturnValueOnce(eqQ([{ team_id: 'team-1' }]))
      const res = await PATCH(patchReq({ approve: true }), params('u2'))
      expect(res.status).toBe(403)
    })

    it('returns 403 when trying to change permissions', async () => {
      mockFrom.mockReturnValueOnce(singleQ({ username: 'bob' }))
      const res = await PATCH(patchReq({ permission: 'user' }), params('u2'))
      expect(res.status).toBe(403)
    })
  })
})

describe('DELETE /api/admin/users/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue(ADMIN_SESSION)
  })

  it('returns 403 when not logged in', async () => {
    mockGetSession.mockResolvedValue(null)
    const res = await DELETE(new Request('http://localhost'), params('u1'))
    expect(res.status).toBe(403)
  })

  it('returns 403 for team_leader', async () => {
    mockGetSession.mockResolvedValue(LEADER_SESSION)
    const res = await DELETE(new Request('http://localhost'), params('u1'))
    expect(res.status).toBe(403)
  })

  it('returns 400 when trying to delete self', async () => {
    mockFrom.mockReturnValueOnce(singleQ({ username: 'admin' }))
    const res = await DELETE(new Request('http://localhost'), params('u1'))
    expect(res.status).toBe(400)
  })

  it('deletes user and returns ok', async () => {
    mockFrom
      .mockReturnValueOnce(singleQ({ username: 'bob' }))
      .mockReturnValueOnce(eqQ(null, null))
    const res = await DELETE(new Request('http://localhost'), params('u1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
  })

  it('returns 500 on DB error', async () => {
    mockFrom
      .mockReturnValueOnce(singleQ({ username: 'bob' }))
      .mockReturnValueOnce(eqQ(null, { message: 'fail' }))
    const res = await DELETE(new Request('http://localhost'), params('u1'))
    expect(res.status).toBe(500)
  })
})

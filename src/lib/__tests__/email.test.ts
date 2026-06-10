import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Project, Stage, Team, StageReviewer } from '../types'

const { mockSendMail, mockCreateTransport, mockCreateTestAccount, mockGetTestMessageUrl } = vi.hoisted(() => ({
  mockSendMail: vi.fn().mockResolvedValue({ messageId: 'msg-1' }),
  mockCreateTransport: vi.fn(),
  mockCreateTestAccount: vi.fn().mockResolvedValue({ user: 'test@ethereal.email', pass: 'pass' }),
  mockGetTestMessageUrl: vi.fn().mockReturnValue('https://ethereal.email/message/test'),
}))

vi.mock('nodemailer', () => ({
  default: {
    createTransport: mockCreateTransport,
    createTestAccount: mockCreateTestAccount,
    getTestMessageUrl: mockGetTestMessageUrl,
  },
}))

import { sendStageStartEmail, sendReviewerEmail } from '../email'

const project: Project = {
  id: 'p1', name: 'Test Project', description: '', createdAt: '2024-01-01', stages: [],
}
const stage: Stage = {
  id: 's1', projectId: 'p1', order: 1, name: 'Design Review', teamId: 't1',
  deadline: '2024-12-31T17:00:00Z', status: 'in_progress', emailSent: false,
}
const team: Team = {
  id: 't1', name: 'Design Team', color: '#3b82f6', createdAt: '2024-01-01',
  members: [{ id: 'm1', name: 'Alice', email: 'alice@example.com', role: 'Lead' }],
}

describe('sendStageStartEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateTransport.mockReturnValue({ sendMail: mockSendMail })
    mockSendMail.mockResolvedValue({ messageId: 'msg-1' })
  })

  it('returns success with preview URL', async () => {
    const result = await sendStageStartEmail(project, stage, team)
    expect(result.success).toBe(true)
    expect(result.previewUrl).toBe('https://ethereal.email/message/test')
  })

  it('sends to team member emails', async () => {
    await sendStageStartEmail(project, stage, team)
    const call = mockSendMail.mock.calls[0][0]
    expect(call.to).toContain('alice@example.com')
  })

  it('includes project and stage name in subject', async () => {
    await sendStageStartEmail(project, stage, team)
    const call = mockSendMail.mock.calls[0][0]
    expect(call.subject).toContain('Test Project')
    expect(call.subject).toContain('Design Review')
  })

  it('includes prevStageName when provided', async () => {
    await sendStageStartEmail(project, stage, team, '前のステージ')
    const call = mockSendMail.mock.calls[0][0]
    expect(call.html).toContain('前のステージ')
  })

  it('returns error on transport failure', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP error'))
    const result = await sendStageStartEmail(project, stage, team)
    expect(result.success).toBe(false)
    expect(result.error).toContain('SMTP error')
  })

  it('falls back to Ethereal when no SMTP_HOST env', async () => {
    delete process.env.SMTP_HOST
    mockCreateTestAccount.mockResolvedValueOnce({ user: 'ethereal@test.com', pass: 'p' })
    await sendStageStartEmail(project, stage, team)
    expect(mockCreateTestAccount).toHaveBeenCalled()
  })
})

describe('sendReviewerEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateTransport.mockReturnValue({ sendMail: mockSendMail })
    mockSendMail.mockResolvedValue({ messageId: 'msg-2' })
  })

  const reviewer: StageReviewer = { teamId: 't2', order: 1, checkContent: 'Check quality' }
  const reviewerTeam: Team = {
    id: 't2', name: 'QA Team', color: '#10b981', createdAt: '2024-01-01',
    members: [{ id: 'm2', name: 'Bob', email: 'bob@example.com' }],
  }

  it('returns success', async () => {
    const result = await sendReviewerEmail(project, stage, reviewer, reviewerTeam, 'Design Team')
    expect(result.success).toBe(true)
  })

  it('sends to reviewer team emails', async () => {
    await sendReviewerEmail(project, stage, reviewer, reviewerTeam, 'Design Team')
    const call = mockSendMail.mock.calls[0][0]
    expect(call.to).toContain('bob@example.com')
  })

  it('includes check content in HTML', async () => {
    await sendReviewerEmail(project, stage, reviewer, reviewerTeam, 'Design Team')
    const call = mockSendMail.mock.calls[0][0]
    expect(call.html).toContain('Check quality')
  })

  it('includes previous team name in HTML', async () => {
    await sendReviewerEmail(project, stage, reviewer, reviewerTeam, 'Design Team')
    const call = mockSendMail.mock.calls[0][0]
    expect(call.html).toContain('Design Team')
  })
})

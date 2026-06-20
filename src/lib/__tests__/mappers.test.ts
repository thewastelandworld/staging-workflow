import { describe, it, expect } from 'vitest'
import { toProject, toTeam } from '../mappers'

describe('toProject', () => {
  const base = {
    id: 'p1',
    name: 'My Project',
    description: 'Some desc',
    created_at: '2024-01-01T00:00:00Z',
    stages: [],
  }

  it('maps all fields from a DB row', () => {
    const p = toProject(base)
    expect(p.id).toBe('p1')
    expect(p.name).toBe('My Project')
    expect(p.description).toBe('Some desc')
    expect(p.createdAt).toBe('2024-01-01T00:00:00Z')
    expect(p.stages).toEqual([])
  })

  it('defaults description to empty string when missing', () => {
    const p = toProject({ ...base, description: null })
    expect(p.description).toBe('')
  })

  it('defaults stages to empty array when null', () => {
    const p = toProject({ ...base, stages: null })
    expect(p.stages).toEqual([])
  })
})

describe('toTeam', () => {
  const base = {
    id: 't1',
    name: 'Design Team',
    color: '#3b82f6',
    created_at: '2024-02-01T00:00:00Z',
    user_teams: [
      { role: 'Lead', users: { id: 'u1', username: 'alice', display_name: 'Alice', email: 'alice@example.com' } },
    ],
  }

  it('maps all fields from a DB row', () => {
    const t = toTeam(base)
    expect(t.id).toBe('t1')
    expect(t.name).toBe('Design Team')
    expect(t.color).toBe('#3b82f6')
    expect(t.createdAt).toBe('2024-02-01T00:00:00Z')
    expect(t.members).toHaveLength(1)
    expect(t.members[0].id).toBe('u1')
    expect(t.members[0].username).toBe('alice')
    expect(t.members[0].name).toBe('Alice')
    expect(t.members[0].email).toBe('alice@example.com')
    expect(t.members[0].role).toBe('Lead')
  })

  it('defaults members to empty array when no user_teams', () => {
    const t = toTeam({ ...base, user_teams: undefined })
    expect(t.members).toEqual([])
  })
})

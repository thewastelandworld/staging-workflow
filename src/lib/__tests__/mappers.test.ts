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
    members: [{ id: 'm1', name: 'Alice', email: 'alice@example.com', role: 'Lead' }],
  }

  it('maps all fields from a DB row', () => {
    const t = toTeam(base)
    expect(t.id).toBe('t1')
    expect(t.name).toBe('Design Team')
    expect(t.color).toBe('#3b82f6')
    expect(t.createdAt).toBe('2024-02-01T00:00:00Z')
    expect(t.members).toHaveLength(1)
    expect(t.members[0].name).toBe('Alice')
  })

  it('defaults members to empty array when null', () => {
    const t = toTeam({ ...base, members: null })
    expect(t.members).toEqual([])
  })
})

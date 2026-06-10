import { describe, it, expect } from 'vitest'
import { getProjectStatus } from '../project-utils'
import { translations } from '../i18n'
import type { Project, Stage } from '../types'

const T = translations.ja

function makeStage(overrides: Partial<Stage> = {}): Stage {
  return {
    id: 'stage-1',
    projectId: 'proj-1',
    order: 1,
    name: 'Test Stage',
    teamId: 'team-1',
    deadline: new Date(Date.now() + 86_400_000).toISOString(),
    status: 'pending',
    emailSent: false,
    ...overrides,
  }
}

function makeProject(stages: Stage[]): Project {
  return { id: 'proj-1', name: 'Test Project', createdAt: new Date().toISOString(), stages }
}

const PAST = new Date(Date.now() - 1000).toISOString()

describe('getProjectStatus', () => {
  it('returns noStages for empty project', () => {
    const r = getProjectStatus(makeProject([]), T)
    expect(r.label).toBe(T.noStages)
    expect(r.color).toBe('text-gray-400')
    expect(r.bg).toBe('bg-gray-50')
  })

  it('returns allDone when every stage is completed', () => {
    const stages = [
      makeStage({ id: '1', status: 'completed' }),
      makeStage({ id: '2', order: 2, status: 'completed' }),
    ]
    const r = getProjectStatus(makeProject(stages), T)
    expect(r.label).toBe(T.allDone)
    expect(r.color).toBe('text-green-700')
  })

  it('completed stages past deadline do not count as overdue', () => {
    const stages = [makeStage({ status: 'completed', deadline: PAST })]
    const r = getProjectStatus(makeProject(stages), T)
    expect(r.label).toBe(T.allDone)
  })

  it('returns overdueExists when any non-completed stage is past deadline', () => {
    const stages = [makeStage({ status: 'in_progress', deadline: PAST })]
    const r = getProjectStatus(makeProject(stages), T)
    expect(r.label).toBe(T.overdueExists)
    expect(r.color).toBe('text-red-700')
  })

  it('overdue takes priority over current-stage label', () => {
    const stages = [
      makeStage({ id: '1', order: 1, name: 'Overdue', status: 'in_progress', deadline: PAST }),
      makeStage({ id: '2', order: 2, name: 'Future', status: 'pending' }),
    ]
    const r = getProjectStatus(makeProject(stages), T)
    expect(r.label).toBe(T.overdueExists)
  })

  it('returns current stage label when in progress', () => {
    const stages = [makeStage({ order: 2, name: 'Design', status: 'in_progress' })]
    const r = getProjectStatus(makeProject(stages), T)
    expect(r.label).toBe('2: Design')
    expect(r.color).toBe('text-blue-700')
  })

  it('picks the lowest-order non-completed stage as current', () => {
    const stages = [
      makeStage({ id: '1', order: 1, name: 'First', status: 'completed' }),
      makeStage({ id: '2', order: 2, name: 'Second', status: 'in_progress' }),
      makeStage({ id: '3', order: 3, name: 'Third', status: 'pending' }),
    ]
    const r = getProjectStatus(makeProject(stages), T)
    expect(r.label).toBe('2: Second')
  })

  it('works with english translations', () => {
    const r = getProjectStatus(makeProject([]), translations.en)
    expect(r.label).toBe(translations.en.noStages)
  })
})

import type { Project, Team } from './types'

export function toProject(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? '',
    createdAt: row.created_at as string,
    stages: (row.stages as Project['stages']) ?? [],
  }
}

export function toTeam(row: Record<string, unknown>): Team {
  return {
    id: row.id as string,
    name: row.name as string,
    color: row.color as string,
    createdAt: row.created_at as string,
    members: (row.members as Team['members']) ?? [],
  }
}

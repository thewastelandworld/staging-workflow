export type StageStatus = 'pending' | 'in_progress' | 'completed' | 'overdue'

export interface Member {
  id: string
  name: string
  email: string
  role?: string
}

export interface Team {
  id: string
  name: string
  color: string
  members: Member[]
  createdAt: string
}

export interface Stage {
  id: string
  projectId: string
  order: number
  name: string
  description?: string
  teamId: string
  deadline: string        // ISO datetime string
  startedAt?: string
  completedAt?: string
  status: StageStatus
  notes?: string
  emailSent?: boolean
}

export interface Project {
  id: string
  name: string
  description?: string
  createdAt: string
  stages: Stage[]
}

export interface DB {
  projects: Project[]
  teams: Team[]
}

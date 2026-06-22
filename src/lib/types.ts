export type StageStatus = 'pending' | 'in_progress' | 'reviewing' | 'completed' | 'overdue'

export interface Member {
  id: string      // users.id
  username: string
  name: string    // users.display_name
  email: string   // users.email
  role?: string   // team-specific role from user_teams.role
}

export interface Team {
  id: string
  name: string
  color: string
  members: Member[]
  createdAt: string
}

export interface StageReviewer {
  teamId: string
  order: number
  checkContent?: string  // 確認すべき内容（ステージ作成時に設定）
  checkedAt?: string
  note?: string          // 確認者が入力したコメント
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
  problem?: string
  problemTeamId?: string
  emailSent?: boolean
  reviewers?: StageReviewer[]
}

export interface Project {
  id: string
  name: string
  description?: string
  createdAt: string
  createdBy?: string  // username of the user who created this project
  stages: Stage[]
}

export interface DB {
  projects: Project[]
  teams: Team[]
}

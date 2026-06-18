export type StageStatus = 'pending' | 'in_progress' | 'reviewing' | 'completed' | 'overdue'

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
  emailSent?: boolean
  reviewers?: StageReviewer[]
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

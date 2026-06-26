// ステージの進行状態。overdue はバッチ処理で自動付与される
export type StageStatus = 'pending' | 'in_progress' | 'reviewing' | 'completed' | 'overdue'

// チームメンバーを表す。permission/status はユーザー管理画面向けに含める
export interface Member {
  id: string      // users.id
  username: string
  name: string    // users.display_name
  email: string   // users.email
  role?: string   // team-specific role from user_teams.role
  permission?: string  // users.permission
  status?: string      // users.status
}

// チームとそのメンバー一覧
export interface Team {
  id: string
  name: string
  color: string
  members: Member[]
  createdAt: string
}

// ステージに紐づく確認担当チームのエントリ。order が小さい順に確認する
export interface StageReviewer {
  teamId: string
  order: number
  checkContent?: string  // 確認すべき内容（ステージ作成時に設定）
  checkedAt?: string
  note?: string          // 確認者が入力したコメント
}

// 単一ステージ。stages テーブルと stage_reviewers テーブルを結合した形
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
  emailSent?: boolean     // Slack/メール通知済みフラグ（重複送信防止）
  reviewers?: StageReviewer[]
}

// プロジェクト（ケース）。ステージを順序付きで保持する
export interface Project {
  id: string
  name: string
  description?: string
  createdAt: string
  createdBy?: string  // username of the user who created this project
  stages: Stage[]
}

// 旧 JSON ファイル DB 型。Supabase 移行後は使用していない
export interface DB {
  projects: Project[]
  teams: Team[]
}

// Supabase の DB 行 → アプリ型へのマッピング関数群
import type { Project, Team, Stage, StageReviewer, StageStatus } from './types'

// stage_reviewers テーブルの行型
type StageReviewerRow = {
  stage_id: string
  team_id: string
  order: number
  check_content: string | null
  checked_at: string | null
  note: string | null
}

// stages テーブルの行型。stage_reviewers はジョインして取得する場合に含まれる
export type StageRow = {
  id: string
  project_id: string
  order: number
  name: string
  description: string | null
  team_id: string
  deadline: string
  started_at: string | null
  completed_at: string | null
  status: string
  notes: string | null
  problem: string | null
  problem_team_id: string | null
  email_sent: boolean | null
  stage_reviewers?: StageReviewerRow[]
}

// DB 行を StageReviewer 型に変換する
export function toStageReviewer(row: StageReviewerRow): StageReviewer {
  return {
    teamId: row.team_id,
    order: row.order,
    checkContent: row.check_content ?? undefined,
    checkedAt: row.checked_at ?? undefined,
    note: row.note ?? undefined,
  }
}

// DB 行を Stage 型に変換する。レビュアーは order 順にソートして付与する
export function toStage(row: StageRow): Stage {
  return {
    id: row.id,
    projectId: row.project_id,
    order: row.order,
    name: row.name,
    description: row.description ?? undefined,
    teamId: row.team_id,
    deadline: row.deadline,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    status: row.status as StageStatus,
    notes: row.notes ?? undefined,
    problem: row.problem ?? undefined,
    problemTeamId: row.problem_team_id ?? undefined,
    emailSent: row.email_sent ?? false,
    reviewers: (row.stage_reviewers ?? [])
      .sort((a, b) => a.order - b.order)
      .map(toStageReviewer),
  }
}

// DB 行を Project 型に変換する。ステージは order 順にソートして付与する
export function toProject(row: Record<string, unknown>): Project {
  const stageRows = (row.stages as StageRow[]) ?? []
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? '',
    createdAt: row.created_at as string,
    createdBy: (row.created_by as string) || undefined,
    stages: stageRows.sort((a, b) => a.order - b.order).map(toStage),
  }
}

// user_teams ジョイン行型
type UserTeamRow = {
  role: string | null
  users: { id: string; username: string; display_name: string | null; email: string | null; permission: string | null; status: string | null }
}

// DB 行を Team 型に変換する。メンバーはチームリーダー優先・名前順でソートする
export function toTeam(row: Record<string, unknown>): Team {
  const userTeams = (row.user_teams as UserTeamRow[]) ?? []
  return {
    id: row.id as string,
    name: row.name as string,
    color: row.color as string,
    createdAt: row.created_at as string,
    members: userTeams
      .map((ut) => ({
        id: ut.users.id,
        username: ut.users.username,
        name: ut.users.display_name ?? ut.users.username,
        email: ut.users.email ?? '',
        role: ut.role ?? undefined,
        permission: ut.users.permission ?? undefined,
        status: ut.users.status ?? undefined,
      }))
      .sort((a, b) => {
        // team_leader を先頭に表示し、同権限内は日本語名前順
        const aLeader = a.permission === 'team_leader' ? 0 : 1
        const bLeader = b.permission === 'team_leader' ? 0 : 1
        if (aLeader !== bLeader) return aLeader - bLeader
        return a.name.localeCompare(b.name, 'ja')
      }),
  }
}

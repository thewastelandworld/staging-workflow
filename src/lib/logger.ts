type Fields = Record<string, unknown>
type Level = 'info' | 'warn' | 'error'

function emit(level: Level, msg: string, fields?: Fields) {
  const entry: Record<string, unknown> = {
    level,
    message: msg,
    timestamp: new Date().toISOString(),
    ...fields,
  }
  const line = JSON.stringify(entry)

  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)

  const webhookUrl = process.env.MONITOR_WEBHOOK_URL
  if (webhookUrl && (level === 'error' || level === 'warn')) {
    notify(webhookUrl, level, msg, fields).catch(() => {})
  }
}

async function notify(webhookUrl: string, level: Level, msg: string, fields?: Fields) {
  const emoji = level === 'error' ? '🔴' : '⚠️'
  const fieldsText = fields && Object.keys(fields).length > 0
    ? `\n\`\`\`${JSON.stringify(fields, null, 2)}\`\`\``
    : ''
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `${emoji} *[${level.toUpperCase()}]* ${msg}${fieldsText}`,
    }),
  })
}

export const log = {
  info:  (msg: string, fields?: Fields) => emit('info',  msg, fields),
  warn:  (msg: string, fields?: Fields) => emit('warn',  msg, fields),
  error: (msg: string, fields?: Fields) => emit('error', msg, fields),
}

export async function notifyOverdue(
  stages: { project: string; projectId: string; stage: string; deadline: string }[],
) {
  const webhookUrl = process.env.MONITOR_WEBHOOK_URL
  if (!webhookUrl) return

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const lines = stages.map(({ project, projectId, stage, deadline }) => {
    const link = appUrl ? `<${appUrl}/projects/${projectId}|${project}>` : `*${project}*`
    const overdueDays = Math.floor((Date.now() - new Date(deadline).getTime()) / 86400000)
    return `• ${link} › ${stage}（${overdueDays}日超過）`
  })

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `⏰ *期間超過のステージがあります* (${stages.length}件)\n${lines.join('\n')}`,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Slack webhook returned ${res.status}: ${body}`)
  }
}

export async function notifyStageStart(
  projectId: string,
  projectName: string,
  stageName: string,
  stageDescription: string | undefined,
  deadline: string,
  teamName: string,
  prevStageName?: string,
) {
  const webhookUrl = process.env.MONITOR_WEBHOOK_URL
  if (!webhookUrl) return

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const projectLink = appUrl ? `<${appUrl}/projects/${projectId}|${projectName}>` : `*${projectName}*`
  const deadlineStr = new Date(deadline).toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })

  const lines = [
    `🚀 *ステージ開始通知* — *${teamName}* チームの番です`,
    `*ケース:* ${projectLink}`,
    `*ステージ:* ${stageName}`,
    prevStageName ? `*前ステージ:* ${prevStageName} が完了しました` : null,
    stageDescription ? `*内容:* ${stageDescription}` : null,
    `*⏰ 締め切り:* ${deadlineStr}`,
  ].filter(Boolean).join('\n')

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: lines }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Slack webhook returned ${res.status}: ${body}`)
  }
}

export async function notifyReviewerTurn(
  projectId: string,
  projectName: string,
  stageName: string,
  checkContent: string | undefined,
  deadline: string,
  nextTeamName: string,
  prevTeamName: string,
) {
  const webhookUrl = process.env.REVIEWER_WEBHOOK_URL || process.env.MONITOR_WEBHOOK_URL
  if (!webhookUrl) return

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const projectLink = appUrl ? `<${appUrl}/projects/${projectId}|${projectName}>` : `*${projectName}*`
  const deadlineStr = new Date(deadline).toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })

  const lines = [
    `🔍 *確認依頼* — *${nextTeamName}* チームの番です`,
    `*ケース:* ${projectLink}`,
    `*ステージ:* ${stageName}`,
    `*前工程:* ${prevTeamName} が完了しました`,
    checkContent ? `*確認内容:* ${checkContent}` : null,
    `*⏰ 締め切り:* ${deadlineStr}`,
  ].filter(Boolean).join('\n')

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: lines }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Slack webhook returned ${res.status}: ${body}`)
  }
}

export async function notifyProblem(
  projectId: string,
  projectName: string,
  stageName: string,
  problem: string,
) {
  const webhookUrl = process.env.MONITOR_WEBHOOK_URL
  if (!webhookUrl) return

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const projectLink = appUrl ? `<${appUrl}/projects/${projectId}|${projectName}>` : `*${projectName}*`

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `🚨 *問題が報告されました*\n*プロジェクト:* ${projectLink}\n*ステージ:* ${stageName}\n*内容:* ${problem}`,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Slack webhook returned ${res.status}: ${body}`)
  }
}

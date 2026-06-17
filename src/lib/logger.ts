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

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `🚨 *問題が報告されました*\n*プロジェクト:* ${projectLink}\n*ステージ:* ${stageName}\n*内容:* ${problem}`,
    }),
  })
}

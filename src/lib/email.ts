import nodemailer from 'nodemailer'
import type { Stage, Team, Project, StageReviewer } from './types'

function createTransport() {
  // .env に SMTP 設定が無ければ Ethereal (テスト用) を自動生成
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  }
  // Fallback: use Ethereal test account
  return null
}

export async function sendStageStartEmail(
  project: Project,
  stage: Stage,
  team: Team,
  prevStageName?: string
): Promise<{ success: boolean; previewUrl?: string; error?: string }> {
  try {
    let transport = createTransport()

    if (!transport) {
      // Create a test account on Ethereal
      const testAccount = await nodemailer.createTestAccount()
      transport = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      })
    }

    const memberEmails = team.members.map((m) => m.email).join(', ')
    const deadline = new Date(stage.deadline).toLocaleString('ja-JP', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family: sans-serif; background: #f5f5f5; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: #2563eb; color: white; padding: 24px 32px;">
      <h1 style="margin: 0; font-size: 20px;">🚀 あなたのチームの番です</h1>
      <p style="margin: 8px 0 0; opacity: 0.85;">ステージが開始しました</p>
    </div>
    <div style="padding: 32px;">
      <p>こんにちは、<strong>${team.name}</strong> チームの皆さん！</p>
      ${prevStageName ? `<p>「<strong>${prevStageName}</strong>」が完了し、次のステージの担当になりました。</p>` : ''}

      <div style="background: #f0f7ff; border-left: 4px solid #2563eb; padding: 16px; border-radius: 4px; margin: 20px 0;">
        <div style="margin-bottom: 8px;"><strong>ケース:</strong> ${project.name}</div>
        <div style="margin-bottom: 8px;"><strong>ステージ:</strong> ${stage.name}</div>
        ${stage.description ? `<div style="margin-bottom: 8px;"><strong>内容:</strong> ${stage.description}</div>` : ''}
        <div style="color: #dc2626;"><strong>⏰ 締め切り:</strong> ${deadline}</div>
      </div>

      <p>メンバー: ${team.members.map(m => `${m.name}${m.role ? ` (${m.role})` : ''}`).join(' / ')}</p>
      <p style="color: #6b7280; font-size: 14px;">このメールは Staging Workflow から自動送信されました。</p>
    </div>
  </div>
</body>
</html>`

    const info = await transport.sendMail({
      from: process.env.SMTP_FROM ?? '"Staging Workflow" <noreply@staging.local>',
      to: memberEmails,
      subject: `[${project.name}] 📋 ステージ開始通知: ${stage.name}`,
      html,
    })

    const previewUrl = nodemailer.getTestMessageUrl(info) || undefined

    return { success: true, previewUrl: previewUrl as string | undefined }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function sendReviewerEmail(
  project: Project,
  stage: Stage,
  nextReviewer: StageReviewer,
  nextTeam: Team,
  prevTeamName: string,
): Promise<{ success: boolean; previewUrl?: string; error?: string }> {
  try {
    let transport = createTransport()
    if (!transport) {
      const testAccount = await nodemailer.createTestAccount()
      transport = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      })
    }

    const memberEmails = nextTeam.members.map((m) => m.email).join(', ')
    const deadline = new Date(stage.deadline).toLocaleString('ja-JP', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family: sans-serif; background: #f5f5f5; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: #7c3aed; color: white; padding: 24px 32px;">
      <h1 style="margin: 0; font-size: 20px;">🔍 確認をお願いします</h1>
      <p style="margin: 8px 0 0; opacity: 0.85;">あなたのチームの確認番です</p>
    </div>
    <div style="padding: 32px;">
      <p>こんにちは、<strong>${nextTeam.name}</strong> チームの皆さん！</p>
      <p>「<strong>${prevTeamName}</strong>」の確認が完了しました。次はあなたのチームの番です。</p>

      <div style="background: #f5f3ff; border-left: 4px solid #7c3aed; padding: 16px; border-radius: 4px; margin: 20px 0;">
        <div style="margin-bottom: 8px;"><strong>ケース:</strong> ${project.name}</div>
        <div style="margin-bottom: 8px;"><strong>ステージ:</strong> ${stage.name}</div>
        ${nextReviewer.checkContent ? `<div style="margin-bottom: 8px;"><strong>確認内容:</strong> ${nextReviewer.checkContent}</div>` : ''}
        <div style="color: #dc2626;"><strong>⏰ 締め切り:</strong> ${deadline}</div>
      </div>

      <p>メンバー: ${nextTeam.members.map(m => `${m.name}${m.role ? ` (${m.role})` : ''}`).join(' / ')}</p>
      <p style="color: #6b7280; font-size: 14px;">このメールは Staging Workflow から自動送信されました。</p>
    </div>
  </div>
</body>
</html>`

    const info = await transport.sendMail({
      from: process.env.SMTP_FROM ?? '"Staging Workflow" <noreply@staging.local>',
      to: memberEmails,
      subject: `[${project.name}] 🔍 確認依頼: ${stage.name}`,
      html,
    })

    const previewUrl = nodemailer.getTestMessageUrl(info) || undefined
    return { success: true, previewUrl: previewUrl as string | undefined }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function sendOverdueAlert(
  project: Project,
  stage: Stage,
  team: Team
): Promise<void> {
  try {
    let transport = createTransport()
    if (!transport) {
      const testAccount = await nodemailer.createTestAccount()
      transport = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      })
    }

    const memberEmails = team.members.map((m) => m.email).join(', ')
    const deadline = new Date(stage.deadline).toLocaleString('ja-JP')

    await transport.sendMail({
      from: process.env.SMTP_FROM ?? '"Staging Workflow" <noreply@staging.local>',
      to: memberEmails,
      subject: `[${project.name}] 🔴 期限超過アラート: ${stage.name}`,
      html: `
<div style="font-family:sans-serif;padding:20px">
  <h2 style="color:#dc2626">🔴 ステージが期限を超過しています</h2>
  <p>ケース: <strong>${project.name}</strong></p>
  <p>ステージ: <strong>${stage.name}</strong></p>
  <p>締め切り: <strong style="color:#dc2626">${deadline}</strong></p>
  <p>至急対応をお願いします。</p>
</div>`,
    })
  } catch {
    // Silent fail for alert emails
  }
}

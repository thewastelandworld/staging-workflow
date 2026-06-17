import { getSupabase } from '@/lib/supabase'
import { hashPassword } from '@/lib/password'

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/

export async function POST(req: Request) {
  const { username, password } = await req.json()

  if (!USERNAME_RE.test(username)) {
    return Response.json(
      { error: 'ユーザー名は3〜32文字の英数字・_・-のみ使用できます' },
      { status: 400 }
    )
  }

  if (typeof password !== 'string' || password.length < 8) {
    return Response.json(
      { error: 'パスワードは8文字以上で入力してください' },
      { status: 400 }
    )
  }

  const reserved = ['admin', 'demo']
  if (reserved.includes(username.toLowerCase())) {
    return Response.json({ error: 'そのユーザー名は使用できません' }, { status: 400 })
  }

  let supabase
  try {
    supabase = getSupabase()
  } catch {
    return Response.json(
      { error: 'データベース接続の設定が不正です。環境変数を確認してください。' },
      { status: 500 }
    )
  }

  try {
    const { data: existing, error: selectError } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle()

    if (selectError) {
      const msg = process.env.NODE_ENV === 'development'
        ? `DB error: ${selectError.message}`
        : 'データベースエラーが発生しました。usersテーブルが存在するか確認してください。'
      return Response.json({ error: msg }, { status: 500 })
    }

    if (existing) {
      return Response.json({ error: 'そのユーザー名はすでに使用されています' }, { status: 409 })
    }

    const password_hash = await hashPassword(password)

    const { error: insertError } = await supabase.from('users').insert({
      username,
      password_hash,
      role: 'readonly',
    })

    if (insertError) {
      const msg = process.env.NODE_ENV === 'development'
        ? `Insert error: ${insertError.message}`
        : '登録に失敗しました'
      return Response.json({ error: msg }, { status: 500 })
    }

    return Response.json({ ok: true })
  } catch (err) {
    const msg = process.env.NODE_ENV === 'development'
      ? `Unexpected error: ${err}`
      : '登録に失敗しました'
    return Response.json({ error: msg }, { status: 500 })
  }
}

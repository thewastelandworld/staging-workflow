// RFC 4180 準拠の CSV パーサー。引用符内の改行・カンマ・"" エスケープに対応する
// 空行はスキップして返す
export function parseCSVRows(text: string): string[][] {
  const results: string[][] = []
  let i = 0
  const n = text.length

  while (i < n) {
    const row: string[] = []
    while (i < n) {
      let field = ''
      if (text[i] === '"') {
        // 引用符付きフィールド: "" は " にエスケープ、閉じ引用符で終了
        i++
        while (i < n) {
          if (text[i] === '"') {
            if (text[i + 1] === '"') { field += '"'; i += 2 }
            else { i++; break }
          } else {
            field += text[i++]
          }
        }
      } else {
        // 非引用符フィールド: カンマ・改行まで読み込む
        while (i < n && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
          field += text[i++]
        }
      }
      row.push(field.trim())
      if (i < n && text[i] === ',') { i++; continue }
      // CRLF / LF どちらでも改行として扱う
      if (i < n && text[i] === '\r') i++
      if (i < n && text[i] === '\n') i++
      break
    }
    // 全フィールドが空の行（空行）は結果に含めない
    if (row.some(f => f !== '')) results.push(row)
  }

  return results
}

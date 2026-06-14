export function parseCSVRows(text: string): string[][] {
  const results: string[][] = []
  let i = 0
  const n = text.length

  while (i < n) {
    const row: string[] = []
    while (i < n) {
      let field = ''
      if (text[i] === '"') {
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
        while (i < n && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
          field += text[i++]
        }
      }
      row.push(field.trim())
      if (i < n && text[i] === ',') { i++; continue }
      if (i < n && text[i] === '\r') i++
      if (i < n && text[i] === '\n') i++
      break
    }
    if (row.some(f => f !== '')) results.push(row)
  }

  return results
}

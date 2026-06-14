import { describe, it, expect } from 'vitest'
import { parseCSVRows } from '../csv-utils'

describe('parseCSVRows', () => {
  it('returns empty array for empty string', () => {
    expect(parseCSVRows('')).toEqual([])
  })

  it('parses a simple single row', () => {
    expect(parseCSVRows('a,b,c')).toEqual([['a', 'b', 'c']])
  })

  it('parses multiple rows', () => {
    expect(parseCSVRows('a,b\nc,d')).toEqual([['a', 'b'], ['c', 'd']])
  })

  it('handles Windows line endings (CRLF)', () => {
    expect(parseCSVRows('a,b\r\nc,d')).toEqual([['a', 'b'], ['c', 'd']])
  })

  it('trims whitespace from unquoted fields', () => {
    expect(parseCSVRows('  a  ,  b  ')).toEqual([['a', 'b']])
  })

  it('preserves content inside quoted fields', () => {
    expect(parseCSVRows('"hello world","foo,bar"')).toEqual([['hello world', 'foo,bar']])
  })

  it('handles quoted field containing a comma', () => {
    expect(parseCSVRows('a,"b,c",d')).toEqual([['a', 'b,c', 'd']])
  })

  it('handles quoted field containing a newline (multi-line description)', () => {
    expect(parseCSVRows('"line1\nline2",b')).toEqual([['line1\nline2', 'b']])
  })

  it('handles escaped double-quote inside quoted field', () => {
    expect(parseCSVRows('"say ""hello"""')).toEqual([['say "hello"']])
  })

  it('skips blank rows', () => {
    expect(parseCSVRows('a,b\n\nc,d')).toEqual([['a', 'b'], ['c', 'd']])
  })

  it('handles row with only empty fields as blank and skips it', () => {
    expect(parseCSVRows('a,b\n,\nc,d')).toEqual([['a', 'b'], ['c', 'd']])
  })

  it('parses realistic stage CSV with reviewer and multi-line check content', () => {
    const csv = '設計レビュー,説明文,チームA,2025-03-01,チームB,"・確認1\n・確認2"'
    const rows = parseCSVRows(csv)
    expect(rows).toHaveLength(1)
    expect(rows[0][0]).toBe('設計レビュー')
    expect(rows[0][4]).toBe('チームB')
    expect(rows[0][5]).toBe('・確認1\n・確認2')
  })

  it('parses CSV with header row', () => {
    const csv = 'ステージ名,説明,チーム名,締め切り\n実装,コード実装,開発チーム,2025-04-01'
    const rows = parseCSVRows(csv)
    expect(rows).toHaveLength(2)
    expect(rows[0][0]).toBe('ステージ名')
    expect(rows[1][0]).toBe('実装')
  })
})

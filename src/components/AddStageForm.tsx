'use client'

import { useState, useRef } from 'react'
import type { Team, Stage } from '@/lib/types'
import { useLanguage } from './LanguageProvider'
import { parseCSVRows } from '@/lib/csv-utils'

interface Props {
  projectId: string
  teams: Team[]
  nextOrder: number
  existingStages?: Stage[]
  onAdded: () => void
}

function todayDatetimeLocal() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface CsvRow {
  order: number
  name: string
  description: string
  teamId: string
  teamName: string
  deadline: string
  reviewers: { teamId: string; teamName: string; checkContent: string }[]
  valid: boolean
  error?: string
}


export default function AddStageForm({ projectId, teams, nextOrder, existingStages = [], onAdded }: Props) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'single' | 'csv'>('single')
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '',
    description: '',
    teamId: teams[0]?.id ?? '',
    deadline: todayDatetimeLocal(),
    order: nextOrder,
  })
  const [reviewers, setReviewers] = useState<{ teamId: string; checkContent: string }[]>([])

  // CSV/Excel state
  const [csvText, setCsvText] = useState('')
  const [csvRows, setCsvRows] = useState<CsvRow[]>([])
  const [csvParsed, setCsvParsed] = useState(false)
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvDoneCount, setCsvDoneCount] = useState(0)
  const [uploadedFileName, setUploadedFileName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  function copyFrom(stageId: string) {
    if (!stageId) return
    const src = existingStages.find((s) => s.id === stageId)
    if (!src) return
    setForm({
      name: src.name + ' (copy)',
      description: src.description ?? '',
      teamId: src.teamId,
      deadline: todayDatetimeLocal(),
      order: nextOrder,
    })
    setReviewers(
      (src.reviewers ?? []).sort((a, b) => a.order - b.order).map((r) => ({
        teamId: r.teamId,
        checkContent: r.checkContent ?? '',
      }))
    )
  }

  function addReviewer(teamId: string) {
    if (!teamId || reviewers.some((r) => r.teamId === teamId)) return
    setReviewers([...reviewers, { teamId, checkContent: '' }])
  }

  function removeReviewer(teamId: string) {
    setReviewers(reviewers.filter((r) => r.teamId !== teamId))
  }

  function updateCheckContent(teamId: string, checkContent: string) {
    setReviewers(reviewers.map((r) => r.teamId === teamId ? { ...r, checkContent } : r))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.teamId || !form.deadline) return
    setLoading(true)
    await fetch(`/api/projects/${projectId}/stages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        reviewers: reviewers.map((r, i) => ({ teamId: r.teamId, order: i + 1, checkContent: r.checkContent })),
      }),
    })
    setLoading(false)
    setOpen(false)
    setForm({ name: '', description: '', teamId: teams[0]?.id ?? '', deadline: todayDatetimeLocal(), order: nextOrder + 1 })
    setReviewers([])
    onAdded()
  }

  function mapDataRows(dataRows: string[][]): CsvRow[] {
    return dataRows.map((row, i) => {
      const [name, description, teamName, deadline, ...rest] = row
      const empty: CsvRow = { order: nextOrder + i, name: '', description: '', teamId: '', teamName: '', deadline: '', reviewers: [], valid: false }
      if (!name) return { ...empty, error: 'ステージ名が必要です' }
      const team = teams.find(tt => tt.name.toLowerCase() === (teamName ?? '').toLowerCase())
      if (!team) return { ...empty, name, description: description ?? '', teamName: teamName ?? '', deadline: deadline ?? '', error: `チーム「${teamName ?? ''}」が見つかりません` }
      let deadlineVal = (deadline ?? '').trim()
      if (deadlineVal && !deadlineVal.includes('T')) deadlineVal += 'T00:00'
      if (!deadlineVal) return { ...empty, name, description: description ?? '', teamId: team.id, teamName: team.name, error: '締め切りが必要です' }
      const reviewersParsed: { teamId: string; teamName: string; checkContent: string }[] = []
      for (let j = 0; j + 1 < rest.length; j += 2) {
        const rName = rest[j]?.trim()
        if (!rName) continue
        const rTeam = teams.find(tt => tt.name.toLowerCase() === rName.toLowerCase())
        if (rTeam) reviewersParsed.push({ teamId: rTeam.id, teamName: rTeam.name, checkContent: rest[j + 1] ?? '' })
      }
      return { order: nextOrder + i, name, description: description ?? '', teamId: team.id, teamName: team.name, deadline: deadlineVal, reviewers: reviewersParsed, valid: true }
    })
  }

  function skipHeader(allRows: string[][]): string[][] {
    const headerKeywords = ['name', 'ステージ名', '名前', 'stage', '名称', '列']
    if (allRows.length > 0 && headerKeywords.some(k => allRows[0][0]?.toLowerCase().includes(k.toLowerCase()))) {
      return allRows.slice(1)
    }
    return allRows
  }

  function parseCsv() {
    const allRows = parseCSVRows(csvText)
    if (allRows.length === 0) { setCsvRows([]); setCsvParsed(true); return }
    setCsvRows(mapDataRows(skipHeader(allRows)))
    setCsvParsed(true)
  }

  async function handleFileUpload(file: File) {
    setUploadedFileName(file.name)
    setCsvParsed(false)
    let allRows: string[][]
    if (file.name.match(/\.xlsx?$/i)) {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      allRows = raw.map(row => (row as unknown[]).map(cell => String(cell ?? '').trim()))
    } else {
      const text = await file.text()
      setCsvText(text)
      allRows = parseCSVRows(text)
    }
    const dataRows = skipHeader(allRows.filter(r => r.some(c => c !== '')))
    setCsvRows(mapDataRows(dataRows))
    setCsvParsed(true)
  }

  function downloadSampleCsv() {
    const today = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const dateStr = (offsetDays: number) => {
      const d = new Date(today)
      d.setDate(d.getDate() + offsetDays)
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    }
    const team1 = teams[0]?.name ?? 'チームA'
    const team2 = teams[1]?.name ?? teams[0]?.name ?? 'チームB'
    const team3 = teams[2]?.name ?? teams[0]?.name ?? 'チームC'
    const q = (s: string) => `"${s.replace(/"/g, '""')}"`
    const lines = [
      'ステージ名,説明,チーム名,締め切り,確認チーム1,確認内容1,確認チーム2,確認内容2',
      `設計レビュー,設計書・仕様書の内容を確認する,${team1},${dateStr(7)},${team2},${q('・仕様書との整合性を確認\n・画面遷移が正しいか確認')}`,
      `実装,機能を実装しテストを行う,${team2},${dateStr(14)},${team3},${q('・単体テストがすべてパスしているか確認\n・コードレビューを完了すること')}`,
      `${q('最終確認')},${q('本番環境にデプロイ前の\n最終チェックを行う')},${team1},${dateStr(21)},${team2},${q('・動作確認\n・ログに異常がないか確認')},${team3},${q('・リリースノートの確認\n・承認サインオフ')}`,
    ]
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'stages_sample.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function downloadSampleXlsx() {
    const today = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const dateStr = (offsetDays: number) => {
      const d = new Date(today)
      d.setDate(d.getDate() + offsetDays)
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    }
    const team1 = teams[0]?.name ?? 'チームA'
    const team2 = teams[1]?.name ?? teams[0]?.name ?? 'チームB'
    const team3 = teams[2]?.name ?? teams[0]?.name ?? 'チームC'
    const XLSX = await import('xlsx')
    const data = [
      ['ステージ名', '説明', 'チーム名', '締め切り', '確認チーム1', '確認内容1', '確認チーム2', '確認内容2'],
      ['設計レビュー', '設計書・仕様書の内容を確認する', team1, dateStr(7), team2, '・仕様書との整合性を確認\n・画面遷移が正しいか確認', '', ''],
      ['実装', '機能を実装しテストを行う', team2, dateStr(14), team3, '・単体テストがすべてパスしているか確認\n・コードレビューを完了すること', '', ''],
      ['最終確認', '本番環境にデプロイ前の\n最終チェックを行う', team1, dateStr(21), team2, '・動作確認\n・ログに異常がないか確認', team3, '・リリースノートの確認\n・承認サインオフ'],
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    // セルの折り返し設定
    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c })
        if (ws[addr]) ws[addr].s = { alignment: { wrapText: true } }
      }
    }
    ws['!cols'] = [{ wch: 16 }, { wch: 24 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 28 }, { wch: 14 }, { wch: 28 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'ステージ')
    XLSX.writeFile(wb, 'stages_sample.xlsx')
  }

  async function importCsv() {
    const validRows = csvRows.filter(r => r.valid)
    if (validRows.length === 0) return
    setCsvImporting(true)
    setCsvDoneCount(0)
    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i]
      await fetch(`/api/projects/${projectId}/stages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: row.name, description: row.description, teamId: row.teamId, deadline: row.deadline, order: row.order, reviewers: row.reviewers.map((r, ri) => ({ teamId: r.teamId, order: ri + 1, checkContent: r.checkContent })) }),
      })
      setCsvDoneCount(i + 1)
    }
    setCsvImporting(false)
    setCsvText('')
    setCsvRows([])
    setCsvParsed(false)
    setCsvDoneCount(0)
    setOpen(false)
    onAdded()
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-400'

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors text-sm font-medium"
      >
        {t.addStageBtn}
      </button>
    )
  }

  return (
    <div className="mt-4 p-4 border border-blue-200 rounded-xl bg-blue-50">
      <div className="flex gap-2 mb-4">
        <button type="button"
          onClick={() => setTab('single')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'single' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'}`}>
          {t.singleTab}
        </button>
        <button type="button"
          onClick={() => setTab('csv')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'csv' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'}`}>
          {t.csvTab}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="ml-auto text-gray-400 hover:text-gray-600 text-sm">{t.cancel}</button>
      </div>

      {tab === 'single' && (
        <form onSubmit={submit}>
          <h3 className="font-semibold text-gray-800 mb-3">{t.newStage}</h3>

          {existingStages.length > 0 && (
            <div className="mb-4 p-3 bg-white border border-blue-100 rounded-lg">
              <label className="text-xs font-medium text-gray-600 block mb-1.5">{t.copyFromExisting}</label>
              <select className={inputCls + ' bg-white'} defaultValue="" onChange={(e) => copyFrom(e.target.value)}>
                <option value="">{t.copySelectPlaceholder}</option>
                {[...existingStages].sort((a, b) => a.order - b.order).map((s) => {
                  const team = teams.find((tt) => tt.id === s.teamId)
                  return (
                    <option key={s.id} value={s.id}>
                      {s.order}. {s.name}{team ? ` (${team.name})` : ''}
                    </option>
                  )
                })}
              </select>
              <p className="text-xs text-gray-400 mt-1">{t.copyHint}</p>
            </div>
          )}

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">{t.stageName}</label>
                <input className={inputCls} value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={t.stageNamePlaceholder} required />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">{t.order}</label>
                <input type="number" className={inputCls} value={form.order} min={1}
                  onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">{t.description}</label>
              <textarea className={inputCls} value={form.description} rows={3}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">{t.teamManagement.replace('管理', '')} *</label>
                <select className={inputCls + ' bg-white'} value={form.teamId}
                  onChange={(e) => setForm({ ...form, teamId: e.target.value })} required>
                  <option value=""></option>
                  {teams.map((tt) => <option key={tt.id} value={tt.id}>{tt.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">{t.deadline} *</label>
                <input type="datetime-local" className={inputCls} value={form.deadline}
                  onChange={(e) => setForm({ ...form, deadline: e.target.value })} required />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">{t.reviewerTeamsLabel}</label>
              <select className={inputCls + ' bg-white mb-2'} defaultValue=""
                onChange={(e) => { addReviewer(e.target.value); e.target.value = '' }}>
                <option value="">{t.addTeamOption}</option>
                {teams.filter((tt) => !reviewers.some((r) => r.teamId === tt.id)).map((tt) => (
                  <option key={tt.id} value={tt.id}>{tt.name}</option>
                ))}
              </select>
              {reviewers.length > 0 && (
                <div className="space-y-2">
                  {reviewers.map((reviewer, i) => {
                    const team = teams.find((tt) => tt.id === reviewer.teamId)
                    return (
                      <div key={reviewer.teamId} className="bg-white border border-gray-200 rounded-lg p-2.5 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 text-xs w-4">{i + 1}.</span>
                          <span className="flex-1 text-sm text-gray-700 font-medium">{team?.name}</span>
                          <button type="button" onClick={() => removeReviewer(reviewer.teamId)}
                            className="text-gray-300 hover:text-red-400 transition-colors">✕</button>
                        </div>
                        <textarea
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs text-black focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                          rows={2} placeholder={t.checkContentPlaceholder}
                          value={reviewer.checkContent}
                          onChange={(e) => updateCheckContent(reviewer.teamId, e.target.value)}
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {loading ? t.adding : t.add}
              </button>
            </div>
          </div>
        </form>
      )}

      {tab === 'csv' && (
        <div className="space-y-3">
          <div className="p-3 bg-white border border-blue-100 rounded-lg text-xs text-gray-500 space-y-1.5">
            <p className="font-medium text-gray-700">{t.csvFormatHint}</p>
            <p>{t.csvAvailableTeams} {teams.map(tt => tt.name).join(', ')}</p>
            <div className="flex flex-wrap gap-2 mt-1">
              <button type="button" onClick={downloadSampleCsv}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-xs transition-colors">
                ↓ {t.csvDownloadSample}
              </button>
              <button type="button" onClick={downloadSampleXlsx}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 hover:bg-green-200 text-green-700 rounded text-xs transition-colors">
                ↓ {t.xlsxDownloadSample}
              </button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = '' }}
          />
          <button type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-3 border-2 border-dashed border-blue-300 rounded-lg text-sm text-blue-600 hover:border-blue-500 hover:bg-blue-50 transition-colors">
            📂 {t.fileUploadLabel}
            {uploadedFileName && <span className="ml-2 text-xs text-gray-500">({uploadedFileName})</span>}
          </button>

          <div className="flex items-center gap-2 text-xs text-gray-400">
            <div className="flex-1 h-px bg-gray-200" />
            {t.fileUploadHint}
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <textarea
            className={inputCls + ' font-mono'}
            rows={6}
            placeholder={t.csvPastePlaceholder}
            value={csvText}
            onChange={(e) => { setCsvText(e.target.value); setCsvParsed(false); setCsvRows([]); setUploadedFileName('') }}
          />

          <button type="button"
            onClick={parseCsv}
            disabled={!csvText.trim()}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50 transition-colors">
            {t.csvParseBtnLabel}
          </button>

          {csvParsed && csvRows.length > 0 && (
            <div className="space-y-2">
              {csvRows.map((row, i) => (
                <div key={i} className={`p-2.5 rounded-lg border text-xs ${row.valid ? 'bg-white border-gray-200' : 'bg-red-50 border-red-200'}`}>
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 font-medium ${row.valid ? 'text-green-600' : 'text-red-500'}`}>
                      {row.valid ? '✓' : '✕'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-gray-800">{row.name || '—'}</span>
                      {row.teamName && <span className="ml-2 text-gray-500">({row.teamName})</span>}
                      {row.deadline && <span className="ml-2 text-gray-400">{row.deadline.replace('T', ' ')}</span>}
                      {row.description && <p className="text-gray-400 mt-0.5 truncate">{row.description}</p>}
                      {row.reviewers.length > 0 && (
                        <p className="text-gray-400 mt-0.5">確認: {row.reviewers.map(r => r.teamName).join(' → ')}</p>
                      )}
                      {row.error && <p className="text-red-500 mt-0.5">{row.error}</p>}
                    </div>
                  </div>
                </div>
              ))}

              {csvRows.filter(r => r.valid).length === 0
                ? <p className="text-sm text-red-500">{t.csvNoValidRows}</p>
                : (
                  <button type="button"
                    onClick={importCsv}
                    disabled={csvImporting}
                    className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium">
                    {csvImporting
                      ? `${t.csvImportingLabel} (${csvDoneCount}/${csvRows.filter(r => r.valid).length})`
                      : t.csvImportBtnLabel(csvRows.filter(r => r.valid).length)}
                  </button>
                )
              }
            </div>
          )}

          {csvParsed && csvRows.length === 0 && (
            <p className="text-sm text-gray-500">{t.csvNoValidRows}</p>
          )}
        </div>
      )}
    </div>
  )
}

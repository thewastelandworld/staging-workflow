import fs from 'fs'
import path from 'path'
import type { DB } from './types'

const DB_PATH = path.join(process.cwd(), 'data', 'db.json')

const DEFAULT_DB: DB = {
  projects: [],
  teams: [],
}

export function readDB(): DB {
  try {
    if (!fs.existsSync(DB_PATH)) {
      writeDB(DEFAULT_DB)
      return DEFAULT_DB
    }
    const raw = fs.readFileSync(DB_PATH, 'utf-8')
    return JSON.parse(raw) as DB
  } catch {
    return DEFAULT_DB
  }
}

export function writeDB(data: DB): void {
  const dir = path.dirname(DB_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export function getDB() {
  return readDB()
}

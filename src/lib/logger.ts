type Fields = Record<string, unknown>

function fmt(level: string, msg: string, fields?: Fields): string {
  const base = `[${level.toUpperCase()}] ${msg}`
  return fields && Object.keys(fields).length > 0
    ? `${base} ${JSON.stringify(fields)}`
    : base
}

export const log = {
  info:  (msg: string, fields?: Fields) => console.log(fmt('info', msg, fields)),
  warn:  (msg: string, fields?: Fields) => console.warn(fmt('warn', msg, fields)),
  error: (msg: string, fields?: Fields) => console.error(fmt('error', msg, fields)),
}

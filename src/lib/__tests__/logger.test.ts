import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('logger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockFetch.mockResolvedValue(new Response('ok'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  describe('structured JSON output', () => {
    it('log.info outputs JSON with level=info to console.log', async () => {
      const { log } = await import('../logger')
      log.info('test message', { projectId: 'p1' })
      const call = (console.log as ReturnType<typeof vi.spyOn>).mock.calls[0][0]
      const parsed = JSON.parse(call)
      expect(parsed.level).toBe('info')
      expect(parsed.message).toBe('test message')
      expect(parsed.projectId).toBe('p1')
      expect(parsed.timestamp).toBeTruthy()
    })

    it('log.warn outputs JSON with level=warn to console.warn', async () => {
      const { log } = await import('../logger')
      log.warn('warn message', { stageId: 's1' })
      const call = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls[0][0]
      const parsed = JSON.parse(call)
      expect(parsed.level).toBe('warn')
      expect(parsed.message).toBe('warn message')
      expect(parsed.stageId).toBe('s1')
    })

    it('log.error outputs JSON with level=error to console.error', async () => {
      const { log } = await import('../logger')
      log.error('error message', { error: 'DB failed' })
      const call = (console.error as ReturnType<typeof vi.spyOn>).mock.calls[0][0]
      const parsed = JSON.parse(call)
      expect(parsed.level).toBe('error')
      expect(parsed.message).toBe('error message')
      expect(parsed.error).toBe('DB failed')
    })

    it('fields are spread into the top-level JSON object', async () => {
      const { log } = await import('../logger')
      log.info('msg', { a: 1, b: 'two', c: true })
      const call = (console.log as ReturnType<typeof vi.spyOn>).mock.calls[0][0]
      const parsed = JSON.parse(call)
      expect(parsed.a).toBe(1)
      expect(parsed.b).toBe('two')
      expect(parsed.c).toBe(true)
    })

    it('outputs valid JSON even without fields', async () => {
      const { log } = await import('../logger')
      log.info('no fields')
      const call = (console.log as ReturnType<typeof vi.spyOn>).mock.calls[0][0]
      expect(() => JSON.parse(call)).not.toThrow()
    })
  })

  describe('monitoring webhook', () => {
    it('does not call fetch when MONITOR_WEBHOOK_URL is not set', async () => {
      vi.unstubAllEnvs()
      vi.stubEnv('MONITOR_WEBHOOK_URL', '')
      const { log } = await import('../logger')
      log.error('some error')
      await new Promise(r => setTimeout(r, 10))
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('calls fetch for error when MONITOR_WEBHOOK_URL is set', async () => {
      vi.stubEnv('MONITOR_WEBHOOK_URL', 'https://hooks.example.com/webhook')
      const { log } = await import('../logger')
      log.error('critical failure', { projectId: 'p1' })
      await new Promise(r => setTimeout(r, 10))
      expect(mockFetch).toHaveBeenCalledWith(
        'https://hooks.example.com/webhook',
        expect.objectContaining({ method: 'POST' })
      )
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(body.text).toContain('🔴')
      expect(body.text).toContain('critical failure')
    })

    it('calls fetch for warn when MONITOR_WEBHOOK_URL is set', async () => {
      vi.stubEnv('MONITOR_WEBHOOK_URL', 'https://hooks.example.com/webhook')
      const { log } = await import('../logger')
      log.warn('warning event', { stageId: 's1' })
      await new Promise(r => setTimeout(r, 10))
      expect(mockFetch).toHaveBeenCalled()
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(body.text).toContain('⚠️')
      expect(body.text).toContain('warning event')
    })

    it('does not call fetch for info even when MONITOR_WEBHOOK_URL is set', async () => {
      vi.stubEnv('MONITOR_WEBHOOK_URL', 'https://hooks.example.com/webhook')
      const { log } = await import('../logger')
      log.info('just info')
      await new Promise(r => setTimeout(r, 10))
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })
})

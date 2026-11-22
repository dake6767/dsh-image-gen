import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { PLATFORM_IMAGE_CHANNEL, PLATFORM_IMAGE_KEY_REF, platformImageToken, withPlatformImageUpstream } from '../src/platform-image-upstream.js'

import { resolveOpenAICompatChannel } from '../src/shared.js'
import { resolveApiKey } from '../src/credentials.js'

it('reads the managed channel on each call and scopes its credential to the real channel and endpoint', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'image-upstream-test-'))
  vi.stubEnv('DSH_HOME', directory)
  const file = join(directory, 'image-gen-platform-upstream.json')
  const personal = { id: 'platform_image', label: 'Personal', keyRef: '', baseURL: 'https://personal.invalid/v1', model: 'personal' }
  const source = { provider: 'google' as const, openaiCompatChannels: [personal] }
  const endpoint = 'http://127.0.0.1:9000/_dsh-phalanx/plugin-services/member/image-gen/slot/backend/binding'
  const token = 't'.repeat(43)
  try {
    expect(withPlatformImageUpstream(source)).toBe(source)
    expect(platformImageToken(personal)).toBeUndefined()
    writeFileSync(file, JSON.stringify({ endpoint, token, model: 'first' }))
    const managed = withPlatformImageUpstream(source)
    expect(managed).toMatchObject({
      provider: 'openai-compat',
      openaiCompatActiveChannel: PLATFORM_IMAGE_CHANNEL,
      openaiCompatChannels: [personal, { baseURL: endpoint, model: 'first', editFormat: 'multipart' }],
    })
    const scoped = resolveOpenAICompatChannel(managed)
    const alias = resolveOpenAICompatChannel(managed, personal.id)
    expect(scoped.keyRef).toBe(PLATFORM_IMAGE_KEY_REF)
    expect(alias.keyRef).toBe(scoped.keyRef)
    const resolve = vi.fn(async () => ({ value: 'personal-key' }))
    const context = { credentials: { resolve } } as unknown as Parameters<typeof resolveApiKey>[0]
    expect(await resolveApiKey(context, 'openai-compat', scoped.keyRef, scoped)).toBe(token)
    expect(resolve).not.toHaveBeenCalled()
    expect(await resolveApiKey(context, 'openai-compat', alias.keyRef, alias)).toBe('personal-key')
    expect(await resolveApiKey(context, 'openai-compat', scoped.keyRef, { ...scoped, baseURL: personal.baseURL })).toBe('personal-key')
    expect(source).toEqual({ provider: 'google', openaiCompatChannels: [personal] })
    writeFileSync(file, JSON.stringify({ endpoint, token, model: 'second' }))
    expect(resolveOpenAICompatChannel(withPlatformImageUpstream(source)).model).toBe('second')
    writeFileSync(file, JSON.stringify({ endpoint: 'https://upstream.invalid/v1', token, model: 'second' }))
    expect(platformImageToken(scoped)).toBeUndefined()
    rmSync(file)
    symlinkSync('/dev/zero', file)
    expect(platformImageToken(scoped)).toBeUndefined()
  } finally {
    vi.unstubAllEnvs()
    rmSync(directory, { recursive: true, force: true })
  }
})

it('scopes studio and attachment URLs to the DSH document base', async () => {
  vi.resetModules()
  vi.stubGlobal('document', { baseURI: 'https://harness.invalid/u/example/' })
  try {
    const client = await import('../src/shared.js')
    expect(client.STUDIO_ROUTE).toBe('/u/example/plugins/dsh-image-gen/studio')
    expect(client.THUMB_ROUTE).toBe('/u/example/plugins/dsh-image-gen/thumb')
    expect(client.CANVAS_STATE_ROUTE).toBe('/u/example/plugins/dsh-image-gen/canvas-state')
    expect(client.IMAGE_ROUTE).toBe('/u/example/plugins/dsh-image-gen/image')
  } finally {
    vi.unstubAllGlobals()
    vi.resetModules()
  }
})

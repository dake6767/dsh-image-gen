import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs'
import { join } from 'node:path'
import type { Config } from './config.js'
import { openAICompatKeyRef, type OpenAICompatChannel } from './shared.js'

export const PLATFORM_IMAGE_CHANNEL = 'platform-image'
export const PLATFORM_IMAGE_KEY_REF = openAICompatKeyRef(PLATFORM_IMAGE_CHANNEL)

function platformImageUpstream() {
  const home = process.env.DSH_HOME
  if (!home) return
  let fd: number | undefined
  try {
    fd = openSync(join(home, 'image-gen-platform-upstream.json'), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.size < 2 || stat.size > 4096) return
    const bytes = Buffer.alloc(stat.size)
    if (readSync(fd, bytes) !== bytes.length) return
    const { endpoint, model, token } = JSON.parse(bytes.toString('utf8'))
    if (typeof endpoint !== 'string' || typeof model !== 'string' || typeof token !== 'string') return
    const url = URL.parse(endpoint)
    if (!url || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.search || url.hash ||
      !url.pathname.startsWith('/_dsh-phalanx/plugin-services/') || !/^[A-Za-z0-9_-]{43}$/u.test(token) ||
      model.length === 0 || model.length > 256 || model.trim() !== model || /\p{Cc}/u.test(model)) return
    return { endpoint: url.href, model, token }
  } catch {
    return
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

export function platformImageToken(channel: Pick<OpenAICompatChannel, 'id' | 'baseURL'> | undefined) {
  if (channel?.id !== PLATFORM_IMAGE_CHANNEL) return
  const upstream = platformImageUpstream()
  return upstream?.endpoint === channel.baseURL ? upstream.token : undefined
}

/** Add the platform channel at runtime, leaving the member's saved configuration untouched. */
export function withPlatformImageUpstream(config: Config): Config {
  const upstream = platformImageUpstream()
  if (!upstream) return config
  return {
    ...config,
    provider: 'openai-compat',
    openaiCompatActiveChannel: PLATFORM_IMAGE_CHANNEL,
    openaiCompatChannels: [
      ...(config.openaiCompatChannels ?? []).filter(channel => channel.id !== PLATFORM_IMAGE_CHANNEL),
      {
        id: PLATFORM_IMAGE_CHANNEL,
        label: 'Platform OpenAI',
        keyRef: PLATFORM_IMAGE_KEY_REF,
        baseURL: upstream.endpoint,
        model: upstream.model,
        models: [upstream.model],
        editModel: upstream.model,
        editFormat: 'multipart',
      },
    ],
  }
}

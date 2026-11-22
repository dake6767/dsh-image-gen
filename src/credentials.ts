/** Shared BYOK credential resolution for the Agent tools and the Studio route. */
import { PLATFORM_IMAGE_KEY_REF, platformImageToken } from './platform-image-upstream.js'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { Context } from '@deepseek-ai/cordis'
import { CLOUD_CREDENTIAL_REFS, PROVIDER_DISPLAY_NAMES, type CloudImageProvider, type OpenAICompatChannel } from './shared.js'

/**
 * Resolve one provider's stored API key to a non-blank value. Blank values
 * never count as configured: the host treats an empty stored value as absent,
 * and a whitespace-only key is never sent to a provider.
 */
export async function resolveApiKey(ctx: Context, provider: CloudImageProvider, keyRef?: string, channel?: OpenAICompatChannel): Promise<string | undefined> {
  if (provider === 'openai-compat' && keyRef === PLATFORM_IMAGE_KEY_REF) {
    const scopedToken = platformImageToken(channel)
    if (scopedToken !== undefined) return scopedToken
  }
  const credential = await ctx.credentials.resolve(credentialRef(keyRef ?? CLOUD_CREDENTIAL_REFS[provider]))
  const value = credential?.value.trim() ?? ''
  return value.length > 0 ? value : undefined
}

/**
 * Resolve one provider's API key or fail with a user-facing message that says
 * where to configure it. Passing `tool` selects the Agent-facing English
 * wording; without it the message is the browser-facing Chinese one used by
 * the Studio route.
 */
export async function requireApiKey(ctx: Context, provider: CloudImageProvider, tool?: string, keyRef?: string, channel?: OpenAICompatChannel): Promise<string> {
  const value = await resolveApiKey(ctx, provider, keyRef, channel)
  if (value !== undefined) return value
  throw new Error(tool === undefined
    ? `${PROVIDER_DISPLAY_NAMES[provider]} 尚未配置 API Key，请先到 设置 > 插件 > 图像生成 配置`
    : `${tool} requires the ${PROVIDER_DISPLAY_NAMES[provider]} API key; configure it in Settings > Plugins > Image generation.`)
}

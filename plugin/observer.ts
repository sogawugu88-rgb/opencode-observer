import type { Plugin } from "@opencode-ai/plugin"
import fs from "node:fs/promises"
import path from "node:path"

const OBSERVER_AGENT = "observer"
const HINT = `## 图片解读

- 你应该使用 @observer 子智能体来解读图像。
- 当对话中出现类似 \`[图片已保存至: <path>]\` 的消息时，调用 @observer 子智能体，要求它读取该路径的图片文件并返回详细解读。
- 调用方式：使用 task 工具，subagent_type 设为 ${OBSERVER_AGENT}，在 prompt 中明确给出图片文件的绝对路径。

注意：你自己的模型不具备图片输入能力，不要声称"看"到了图片。所有图片信息都必须通过 @observer 子智能体获取。`

function extForMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png"
    case "image/jpeg":
      return "jpg"
    case "image/gif":
      return "gif"
    case "image/webp":
      return "webp"
    case "image/svg+xml":
      return "svg"
    case "image/bmp":
      return "bmp"
    case "image/x-icon":
      return "ico"
    default:
      return "img"
  }
}

export default (async ({ client, directory }) => {
  const observerDir = path.join(directory, ".opencode", "observer-images")
  let providersCache: any = null
  let cacheTime = 0

  async function modelSupportsImage(providerID?: string, modelID?: string): Promise<boolean> {
    if (!providerID || !modelID) return false
    try {
      if (!providersCache || Date.now() - cacheTime > 60_000) {
        providersCache = await client.config.providers()
        cacheTime = Date.now()
      }
      const provider = (providersCache?.providers ?? []).find((p: any) => p?.id === providerID)
      const model = provider?.models?.[modelID]
      return !!(model && model.capabilities?.input?.image)
    } catch {
      return false
    }
  }

  return {
    "chat.message": async (input, output) => {
      const providerID = input.model?.providerID ?? output.message?.model?.providerID
      const modelID = input.model?.modelID ?? output.message?.model?.modelID
      const multimodal = await modelSupportsImage(providerID, modelID)
      if (multimodal) return

      let imgIndex = 0
      for (let i = 0; i < output.parts.length; i++) {
        const part = output.parts[i]
        if (part.type !== "file" || !part.mime?.startsWith("image/")) continue
        if (!part.url?.startsWith("data:")) continue

        const m = part.url.match(/^data:([^;,]+);base64,(.*)$/s)
        if (!m) continue
        const mime = m[1]
        const buffer = Buffer.from(m[2], "base64")
        if (buffer.length === 0) continue

        const filename = `observer-${Date.now()}-${imgIndex++}.${extForMime(mime)}`
        await fs.mkdir(observerDir, { recursive: true })
        const filepath = path.join(observerDir, filename)
        await fs.writeFile(filepath, buffer)

        output.parts[i] = {
          id: part.id,
          sessionID: part.sessionID,
          messageID: part.messageID,
          type: "text" as const,
          text: `[图片已保存至: ${filepath}]`,
        }
      }
    },
    "experimental.chat.system.transform": async (input, output) => {
      const image = input.model?.capabilities?.input?.image
      if (image) return
      output.system.push(HINT)
    },
  }
}) satisfies Plugin

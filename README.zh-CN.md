# OpenCode Observer

> [English](README.md) · **简体中文**

给文本模型（如 DeepSeek-V4 系列）补全图片读取能力的 OpenCode 插件 + 子智能体方案。

DeepSeek-V4 便宜、好用、上下文长，但多模态版本迟迟未发布——报错截图、图表、设计稿等跟图片沾边的任务统统做不了。本项目用一个「多模态子智能体」作为读图员，让文本模型变相获得读图能力，且不损失会话上下文、不增加主模型成本。

## 原理

整个方案由两部分组成：

```
用户粘贴图片（base64）
        │
        ▼
┌─────────────────────┐
│  插件（调度员）        │
│  plugin/observer.ts  │
│  ① chat.message      │
│    拦截图片→解码→存盘  │
│    替换为 [图片已保存至: path]
│  ② system.transform  │
│    主模型无图片能力时  │
│    注入"用@observer读图"提示
└─────────────────────┘
        │
        ▼  主模型（如 deepseek-v4-flash）收到文字提示，调用 task 工具
┌─────────────────────┐
│ observer（读图员）     │
│  agents/observer.md  │
│  多模态模型（gpt-5.6-luna）
│  用 read 工具读图片文件
│  输出结构化文本描述     │
└─────────────────────┘
        │
        ▼ 返回详细描述，主模型据此完成任务
```

- **插件**是调度员：把用户粘贴的图片解码存盘，替换成 `[图片已保存至: <path>]` 文字提示，并在系统提示词中告诉主模型"用 observer 子智能体读图"。
- **observer 子智能体**是读图员：配置为多模态模型，通过 `read` 工具读取图片文件（图片会作为多模态附件输入），按场景输出详尽的文本描述。

### 为什么不用临时切换多模态模型？

1. **成本**：主模型用超高性价比的文本模型，切到多模态模型就失去了意义。
2. **会话上下文**：报错解读、页面还原都在编程任务中途发生，新开会话没有上下文。
3. **上下文长度**：不同模型上下文不同（如 deepseek 支持 1M，kimi 只有 256k），临时切换可能触发上下文压缩丢信息。子智能体在独立子会话运行，互不干扰主会话。

## 快速安装

```bash
# 1. 把 observer 子智能体放到 agents 目录
mkdir -p ~/.config/opencode/agents
cp agents/observer.md ~/.config/opencode/agents/

# 2. 把插件放到 plugin 目录（自动发现，无需改配置）
mkdir -p ~/.config/opencode/plugin
cp plugin/observer.ts ~/.config/opencode/plugin/

# 3. 重启 opencode
```

也可以直接运行一键安装脚本：

```bash
bash install.sh
```

## 配置

### 1. 选择 observer 使用的多模态模型

编辑 `agents/observer.md` 的 frontmatter，把 `model` 换成你环境里可用的**支持图片输入**的模型：

```yaml
---
mode: subagent
model: opencode-go/gpt-5.6-luna
---
```

可用模型判定方法：模型需支持 image 输入。例如 opencode-go 里：
- `gpt-5.6-luna`：`image=True`（Responses API）
- `kimi-k2.6`：`image=True`
- `minimax-m3`：`image=True`
- `deepseek-v4-flash`：`image=False`（所以它才需要 observer）

> 提示：插件会读取 opencode 的 `/config/providers` 判断模型能力。`image=True` 的模型作为主模型时不拦截图片、不注入提示（原生看图）；`image=False` 的模型则自动走 observer 方案。

### 2. 插件行为（可选）

插件自动判断，一般无需配置。默认逻辑：
- 主模型支持图片 → 图片原样传递，不干预。
- 主模型不支持图片 → 图片解码保存到 `<项目>/.opencode/observer-images/`，消息替换为 `[图片已保存至: <path>]`，并注入读图提示。

## 使用

在 OpenCode 会话中：

1. **解读报错截图**：粘贴报错堆栈截图 → deepseek-v4-flash 自动调用 observer 读取并定位关键错误。
2. **还原设计稿/页面**：粘贴视觉稿 → observer 输出像素级描述（含 ASCII 布局图），主模型据此写 HTML。
3. **图表解读**：粘贴图表截图 → observer 提取数据点、坐标轴、趋势。
4. **定位被标记的问题**：截图带红框/箭头标注 → observer 识别问题区域并给出修复建议。
5. **OCR/文字提取**：默认模式，提取图中所有文字。

observer 子智能体内置 5 种工作模式（页面还原 / 问题定位 / 报错提取 / 文本提取 / 图表解读），按信号词自动匹配，优先级 `报错 > 图表 > 问题定位 > 页面还原 > 文本提取`。

## 实测

以本机 opencode-go 为例：

| 模型 | 图片能力 | 备注 |
|---|---|---|
| gpt-5.6-luna | ✅ 实测可识别图片内容 | Responses API |
| kimi-k2.6 | ✅ | OpenAI-compatible |
| minimax-m3 | ✅ | Anthropic API |
| deepseek-v4-flash | ❌ | 需要用 observer 补读图 |

## 文件说明

```
opencode-observer/
├── README.md          # 本文档（英文）
├── README.zh-CN.md    # 简体中文版
├── install.sh         # 一键安装脚本
├── agents/
│   └── observer.md    # 多模态读图子智能体（放到 ~/.config/opencode/agents/）
└── plugin/
    └── observer.ts    # 读图插件（放到 ~/.config/opencode/plugin/，自动发现）
```

## 常见问题

**Q: 为什么图片会被替换成 `[图片已保存至: ...]`？**
因为主模型本身不支持图片，直接传图会被 opencode 替换为 `ERROR: Cannot read image`。插件先把图片存盘再让 observer 读取，绕过了这个限制。

**Q: 图片存在哪里？**
默认存到当前项目的 `.opencode/observer-images/`，保证 observer（与主会话同项目目录）可无权限读取。

**Q: 我可以自定义 observer 的行为吗？**
可以。`observer.md` 里的模式 A-E 提示词都可按需增删改；也可以新增模式（注意补充优先级）。

**Q: 为什么有时 observer 返回的信息不够精确？**
多模态模型转文本必然丢失部分信息。如需更高精度，可在 prompt 里要求 observer "逐字输出"或"描述更详细"。

## 安全

- 插件仅在本地解码图片并写入项目目录，不对外发送。
- 图片请求由你的 opencode provider 配置决定，与普通消息同等处理。

## License

MIT

# OpenCode Observer

> **English** · [简体中文](README.zh-CN.md)

An OpenCode plugin + subagent that gives **text-only models** (like the DeepSeek-V4 family) the ability to read images.

DeepSeek-V4 is cheap, fast, and has a long context window — but its multimodal version has been slow to arrive. Screenshots of errors, charts, design mockups — anything involving images — is out of reach. This project uses a **multimodal subagent** as the "reader" so a text-only model can effectively read images, without losing session context or increasing the main model's cost.

## How it works

The solution is made of two parts:

```
User pastes image (base64)
        │
        ▼
┌─────────────────────┐
│  Plugin (dispatcher) │
│  plugin/observer.ts  │
│  ① chat.message      │
│    intercept → decode
│    → save to disk     │
│    replace with [Image saved to: path]
│  ② system.transform  │
│    when main model    │
│    lacks image support │
│    inject "use @observer to read images"
└─────────────────────┘
        │
        ▼  Main model (e.g. deepseek-v4-flash) sees text hint, calls task tool
┌─────────────────────┐
│ observer (reader)    │
│  agents/observer.md  │
│  multimodal model (gpt-5.6-luna)
│  reads the image file via read tool
│  returns a structured text description
└─────────────────────┘
        │
        ▼  Returns a detailed description; the main model completes the task
```

- **Plugin** = dispatcher: decodes the pasted image, saves it to disk, replaces the message with `[Image saved to: <path>]`, and tells the main model in the system prompt to read the image via the observer subagent.
- **observer subagent** = reader: configured with a multimodal model, reads the image file through the `read` tool (images are passed in as multimodal attachments) and outputs a detailed, structured text description.

### Why not just switch to a multimodal model temporarily?

1. **Cost**: the main model is used for its unbeatable price/performance; switching to a multimodal model defeats the purpose.
2. **Session context**: reading error screenshots or recreating pages happens mid-task — a new session has no context.
3. **Context length**: models have different context limits (e.g. DeepSeek supports 1M, Kimi only 256k). Switching mid-task can trigger context compaction and lose key information. The subagent runs in an isolated sub-session, so the main session is never disturbed.

## Quick install

```bash
# 1. Put the observer subagent into the agents directory
mkdir -p ~/.config/opencode/agents
cp agents/observer.md ~/.config/opencode/agents/

# 2. Put the plugin into the plugin directory (auto-discovered, no config change needed)
mkdir -p ~/.config/opencode/plugin
cp plugin/observer.ts ~/.config/opencode/plugin/

# 3. Restart opencode
```

Or run the one-click installer:

```bash
bash install.sh
```

## Configuration

### 1. Choose the multimodal model used by observer

Edit the frontmatter of `agents/observer.md` and set `model` to an **image-capable** model available in your environment:

```yaml
---
mode: subagent
model: opencode-go/gpt-5.6-luna
---
```

A model qualifies if it supports image input. For example, within opencode-go:
- `gpt-5.6-luna`: `image=True` (Responses API)
- `kimi-k2.6`: `image=True`
- `minimax-m3`: `image=True`
- `deepseek-v4-flash`: `image=False` (that's why it needs observer)

> Tip: the plugin reads opencode's `/config/providers` to determine model capabilities. When a `image=True` model is the main model, images pass through untouched (native vision). When a `image=False` model is the main model, the observer path is used automatically.

### 2. Plugin behavior (optional)

The plugin decides automatically; no configuration is usually needed. Default behavior:
- Main model supports images → images pass through untouched.
- Main model does not support images → image is decoded and saved to `<project>/.opencode/observer-images/`, the message becomes `[Image saved to: <path>]`, and the reading hint is injected.

## Usage

Inside an OpenCode session:

1. **Read error screenshots**: paste a stack trace screenshot → deepseek-v4-flash automatically invokes observer to read it and locate the key error.
2. **Recreate designs / pages**: paste a visual mockup → observer outputs a pixel-level description (including an ASCII layout diagram) and the main model writes the HTML from it.
3. **Chart interpretation**: paste a chart screenshot → observer extracts data points, axes, and trends.
4. **Locate marked issues**: paste a screenshot with red boxes/arrows → observer identifies the problem area and suggests a fix.
5. **OCR / text extraction**: the default mode, extracts all text in the image.

The observer subagent ships with 5 working modes (page recreation / issue location / error extraction / text extraction / chart interpretation), matched automatically by keywords, with priority `error > chart > issue location > page recreation > text extraction`.

## Tested models

Tested against opencode-go on this machine:

| Model | Image capability | Notes |
|---|---|---|
| gpt-5.6-luna | ✅ verified can recognize image content | Responses API |
| kimi-k2.6 | ✅ | OpenAI-compatible |
| minimax-m3 | ✅ | Anthropic API |
| deepseek-v4-flash | ❌ | needs observer to read images |

## Repository layout

```
opencode-observer/
├── README.md          # this file (English)
├── README.zh-CN.md    # Chinese version
├── install.sh         # one-click installer
├── agents/
│   └── observer.md    # multimodal image-reading subagent (put in ~/.config/opencode/agents/)
└── plugin/
    └── observer.ts    # plugin (put in ~/.config/opencode/plugin/, auto-discovered)
```

## FAQ

**Q: Why is the image replaced with `[Image saved to: ...]`?**
Because the main model cannot process images — opencode would otherwise replace it with `ERROR: Cannot read image`. The plugin saves the image to disk first and lets observer read it, bypassing that limitation.

**Q: Where are the images stored?**
By default in `<project>/.opencode/observer-images/`, so observer (same project directory as the main session) can read them without extra permissions.

**Q: Can I customize observer's behavior?**
Yes. The mode A–E prompts in `observer.md` can be edited freely; you can also add new modes (just update the priority).

**Q: Why is observer's output sometimes not precise enough?**
Converting an image to text inevitably loses some information. For higher precision, ask observer to "transcribe verbatim" or "describe in more detail".

## Security

- The plugin decodes images locally and writes them to the project directory only; nothing is sent externally.
- Image requests are governed by your opencode provider configuration, handled the same as ordinary messages.

## License

MIT

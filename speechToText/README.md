# 语音转文字微服务（faster-whisper）

用于「语音敏感词感知」的识别服务，将音频转为文字后由 Node 端做敏感词检测。当前默认配置优先准确率（`small + beam search`），可通过环境变量切换到更快模式。

## 第一步：安装 Python 环境（macOS）

建议使用 Homebrew 安装 Python 3.10+：

```bash
# 安装 Python 3.10+
brew install python@3.10
# 或
brew install python@3.11
```

确认版本：

```bash
python3 --version   # 应为 3.10+
```

## 第二步：安装 FFmpeg（用于解析浏览器 WebM/Opus 录音）

浏览器上传的 `audio/webm` 会先经 FFmpeg 转成 PCM 再识别，避免出现 “Invalid data found when processing input” 报错。

```bash
# macOS
brew install ffmpeg
```

未安装 FFmpeg 时，仅支持 WAV 等可直接解码的格式；WebM 会返回明确错误提示。

## 第三步：创建虚拟环境并安装依赖

在项目根目录下执行：

```bash
cd speechToText
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

首次运行时会自动下载 faster-whisper 的 `small` 模型（约 290MB）。

## 第四步：启动服务

```bash
source venv/bin/activate
python app.py
```

默认监听 `http://0.0.0.0:5001`（避免 macOS 上 5000 被 AirPlay Receiver 占用）。

- 健康检查：`GET http://localhost:5001/health`
- 语音识别：`POST http://localhost:5001/transcribe`，请求体为 multipart 的 `audio` 或 `file` 字段，或 raw 音频二进制。

## 与 Node 联调

先启动本 Python 服务，再启动 Node 服务。Node 会请求 `http://localhost:5001/transcribe` 做语音识别，并在本地做敏感词检测。

## 默认模式（准确率优先）

- **模型**：`small`
- **解码**：`beam_size=3`（比贪心更稳）
- **分段**：`8 秒切片 + 0.6 秒重叠`（兼顾上下文与稳定性）
- **短 prompt**：严格限制 prompt 长度，减少 prompt 幻觉和误识别

## 高精度模式（可选，进一步提升）

需更高准确率时，可设置：

```bash
export WHISPER_MODEL=medium
export WHISPER_BEAM_SIZE=5
export ENABLE_PREPROCESS=1
export ENABLE_SEGMENT=1
```

- **模型**：`medium` 比 small 再提升约 10%
- **束搜索**：`beam_size=5`、`patience=1.0`，减少随机错误
- **Initial Prompt**：直播场景提示，注意同音字
- **上下文连贯**：分段时上一段结尾作为下一段 prompt
- **音频预处理**：降噪 + 音量归一化

## 环境变量（可选）

```bash
# 模型：tiny | base | small（默认） | medium | large-v3
export WHISPER_MODEL=small

# 束搜索 1=贪心（快） 3/5=束搜索（准），默认 3
export WHISPER_BEAM_SIZE=3

# 分段：默认 8 秒固定切片 + 0.6 秒重叠
export SEGMENT_LENGTH_SEC=8
export SEGMENT_OVERLAP_SEC=0.6

# 预处理、分段：0=关（快） 1=开（准）
export ENABLE_PREPROCESS=0
export ENABLE_SEGMENT=1

# prompt 长度上限（默认 180，过长会拉低准确率）
export WHISPER_MAX_PROMPT_CHARS=180

# GPU 加速
export WHISPER_DEVICE=cuda
```

## 极速模式

若仍嫌慢，可改用 `tiny` 模型（约 75MB，最快）：

```bash
export WHISPER_MODEL=tiny
```

## 后续优化（可选）

- **候选重排序**：若需进一步提升，可基于 kenlm 训练中文语言模型，对 beam 搜索的多个候选结果重排序，选择最通顺的转写。

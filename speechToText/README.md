# 语音转文字微服务（faster-whisper tiny）

用于「语音敏感词感知」的极速识别服务，将音频转为文字后由 Node 端做敏感词检测。

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

## 第二步：创建虚拟环境并安装依赖

在项目根目录下执行：

```bash
cd speechToText
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

首次运行时会自动下载 faster-whisper 的 `tiny` 模型（体积较小）。

## 第三步：启动服务

```bash
source venv/bin/activate
python app.py
```

默认监听 `http://0.0.0.0:5001`（避免 macOS 上 5000 被 AirPlay Receiver 占用）。

- 健康检查：`GET http://localhost:5001/health`
- 语音识别：`POST http://localhost:5001/transcribe`，请求体为 multipart 的 `audio` 或 `file` 字段，或 raw 音频二进制。

## 与 Node 联调

先启动本 Python 服务，再启动 Node 服务。Node 会请求 `http://localhost:5001/transcribe` 做语音识别，并在本地做敏感词检测。

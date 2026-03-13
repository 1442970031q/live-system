// mysql 地址 https://sqlpub.com/dashboard/userDb

 

协议	应用场景	延迟表现	平台支持情况
RTMP	主播推流、高实时互动	1-3 秒	斗鱼 / 抖音主推协议
HTTP-FLV	Web 端拉流	2-3 秒	抖音 Web 端默认选择
HLS	移动端拉流、低带宽场景	10-30 秒	全平台兼容 fallback 方案
WebRTC	连麦、PK 等超低延迟场景	200-500ms	抖音互动功能核心协议


flv.js	专注 FLV，轻量，延迟低	需自行处理 UI，模块导入易出问题	定制化直播需求
video.js + 插件	功能全，UI 完善，兼容性好	体积大，配置复杂	多格式支持、复杂交互场景
MediaElement.js	开箱即用，兼容性极佳	直播延迟控制弱	点播为主，需兼容旧浏览器
mpegts.js	性能优，低延迟，适合直播	无内置 UI，需自行实现控制逻辑	实时互动直播（如连麦、游戏）
plyr + mpegts.js	样式美观，轻量，可定制	需要二次集成，功能较基础	注重 UI 设计的直播 / 点播场景



1 弹幕播放时间不够精准
2 直播间 交互太少

---

## 语音敏感词感知

语音先经 Python 微服务（faster-whisper tiny）转成文字，再由 Node 做敏感词检测。

### 第一步：安装 Python 环境（macOS）

```bash
brew install python@3.10   # 或 python@3.11
python3 --version         # 确保 3.10+
```

### 第二步：创建并启动语音识别微服务

```bash
cd speechToText
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

默认运行在 `http://localhost:5000`。详见 `speechToText/README.md`。

### 第三步：启动 Node 服务并调用

```bash
cd server
npm install
npm start
```

- **语音检测**：`POST /api/voice/check`，请求体为 multipart，字段名 `audio` 或 `file`，值为音频文件（wav/webm/mp3 等）。返回 `{ text, containsSensitive, matchedWords }`。
- **仅文本敏感词**：`POST /api/voice/check-text`，Body `{ "text": "..." }`，返回 `{ text, containsSensitive, matchedWords }`。

环境变量（可选）：`SPEECH_SERVICE_URL`（默认 `http://localhost:5000`）、`SPEECH_SERVICE_TIMEOUT`、`SENSITIVE_WORDS`（逗号分隔的额外敏感词）。
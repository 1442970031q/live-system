// 配置文件（敏感信息建议使用环境变量覆盖）
// CORS_ORIGIN 单域名；CORS_ALLOWED_ORIGINS 多域名逗号分隔，如：http://a.com,http://b.com
const corsAllowedFromEnv = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(",").map((s) => s.trim())
  : process.env.CORS_ORIGIN
  ? [process.env.CORS_ORIGIN]
  : [];

module.exports = {
  port: process.env.PORT || 3001,
  host: process.env.HOST || "0.0.0.0",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
  corsAllowedOrigins: corsAllowedFromEnv,
  mysql: {
    host: 'mysql2.sqlpub.com',
    user: 'gaojiewei',
    password: 'cnBKhgqzNCVwA1Q9',
    database: 'live_system',
    port: 3307
  },
  jwt: {
    secret: 'your_jwt_secret_key',
    expiresIn: '24h'
  },
  // 语音敏感词感知：Python 识别微服务地址（未配置则语音检测接口返回 503）
  speechServiceUrl: process.env.SPEECH_SERVICE_URL || "http://localhost:5001",
  speechServiceTimeout: Number(process.env.SPEECH_SERVICE_TIMEOUT) || 50000,
  // 额外敏感词（可改为从文件/数据库加载）
  sensitiveWords: process.env.SENSITIVE_WORDS ? process.env.SENSITIVE_WORDS.split(",").map((s) => s.trim()) : [],
};

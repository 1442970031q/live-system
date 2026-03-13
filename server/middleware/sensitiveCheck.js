/**
 * 敏感词拦截中间件
 *
 * 核心逻辑：
 * 1. 快速查询用户黑白名单（黑名单直接 403，白名单直接放行）
 * 2. 提交检测任务到工作线程池
 * 3. 命中敏感词后：写入命中日志、更新敏感词命中次数、执行分级处理策略
 * 4. 检测异常时默认放行，同步记录错误日志
 *
 * @param {Object} options
 * @param {string} options.field 请求体中待检测的字段名，如 'content'、'title'、'bio'
 * @param {string} options.scene 命中场景标识：danmaku | title | bio | voice
 * @param {number} [options.streamIdFrom] 从 req.params 或 req.body 获取 streamId 的路径，如 'params.streamId'
 */
const sensitiveService = require('../services/sensitiveService');

function sensitiveCheck(options = {}) {
  const { field = 'content', scene = 'danmaku', streamIdFrom = 'params.streamId' } = options;

  return async (req, res, next) => {
    const userId = req.user?.id;

    // 1. 黑名单直接 403
    try {
      const blacklisted = await sensitiveService.isBlacklisted(userId);
      if (blacklisted) {
        return res.status(403).json({ message: '您已被列入黑名单，无法执行此操作' });
      }
    } catch (err) {
      console.error('[sensitiveCheck] Blacklist check error:', err);
    }

    // 2. 白名单直接放行
    try {
      const whitelisted = await sensitiveService.isWhitelisted(userId);
      if (whitelisted) {
        return next();
      }
    } catch (err) {
      console.error('[sensitiveCheck] Whitelist check error:', err);
    }

    // 3. 获取待检测文本
    const text = req.body?.[field] != null ? String(req.body[field]) : '';
    if (!text || !text.trim()) {
      return next();
    }

    // 4. 提交到工作线程池检测
    let result;
    try {
      result = await sensitiveService.check(text);
    } catch (err) {
      console.error('[sensitiveCheck] Check error:', err);
      return next(); // 异常时默认放行
    }

    if (!result.hit) {
      return next();
    }

    // 5. 命中敏感词：写日志、更新命中次数、执行策略
    const { highestLevel, matchedWords } = result;
    const strategy = sensitiveService.getHandleStrategy(highestLevel);

    const streamId = streamIdFrom.split('.').reduce((o, k) => o?.[k], req) || null;
    const firstMatch = matchedWords[0];

    try {
      await sensitiveService.logHit({
        userId,
        streamId,
        sensitiveWordId: firstMatch.wordId || 0,
        originalContent: text,
        matchedWord: firstMatch.word,
        hitLevel: highestLevel,
        hitScene: scene,
        handleResult: strategy,
      });
    } catch (err) {
      console.error('[sensitiveCheck] Log hit error:', err);
    }

    if (strategy === 'reject') {
      return res.status(400).json({
        message: '内容含有违禁词，请修改后再提交',
        matchedWords: matchedWords.map((m) => m.word),
        highestLevel,
      });
    }

    if (strategy === 'replace') {
      // 三级：替换为 ***，继续放行
      let replaced = text;
      for (const m of matchedWords) {
        replaced = replaced.replace(new RegExp(escapeRegex(m.word), 'gi'), '***');
      }
      req.body[field] = replaced;
    }

    return next();
  };
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { sensitiveCheck };

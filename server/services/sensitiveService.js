/**
 * 敏感词检测服务
 * 负责从数据库加载词库、初始化工作线程池、提供统一检测接口
 */
const db = require('../db');
const { SensitiveWorkerPool } = require('../src/modules/sensitive-filter');

let pool = null;

/**
 * 从数据库加载启用的敏感词
 * @returns {Promise<Array<{id, level, word}>>}
 */
async function loadWords() {
  const [rows] = await db.query(
    `SELECT sw.id, sc.level, sw.word
     FROM sensitive_word sw
     JOIN sensitive_category sc ON sw.category_id = sc.id
     WHERE sw.enabled = 1
     ORDER BY sc.level ASC`
  );
  return rows.map((r) => ({
    id: r.id,
    level: r.level,
    word: r.word,
  }));
}

/**
 * 初始化敏感词工作线程池（在服务启动时调用）
 */
async function initPool() {
  if (pool) return;
  pool = new SensitiveWorkerPool();
  const words = await loadWords();
  await pool.init(words);
  console.log('[SensitiveService] Worker pool initialized with', words.length, 'words');
  if (words.length === 0) {
    console.warn('[SensitiveService] 词库为空！请运行: cd server && npm run seed:sensitive');
  }
}

/**
 * 热更新词库（词库变更后调用）
 */
async function hotReload() {
  if (!pool) await initPool();
  const words = await loadWords();
  await pool.updateWords(words);
  console.log('[SensitiveService] Hot reloaded', words.length, 'words');
}

/**
 * 检测文本是否包含敏感词
 * @param {string} text 待检测文本
 * @returns {Promise<{ hit: boolean, highestLevel: number, matchedWords: Array }>}
 */
async function check(text) {
  if (!pool) await initPool();
  try {
    return await pool.check(text || '');
  } catch (err) {
    console.error('[SensitiveService] Check error:', err);
    return { hit: false, highestLevel: 0, matchedWords: [] };
  }
}

/**
 * 写入命中日志并更新敏感词命中次数
 */
async function logHit(params) {
  const { userId, streamId, sensitiveWordId, originalContent, matchedWord, hitLevel, hitScene, handleResult } = params;
  try {
    await db.query(
      `INSERT INTO sensitive_hit_log (user_id, stream_id, sensitive_word_id, original_content, matched_word, hit_level, hit_scene, handle_result)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId || null, streamId || null, sensitiveWordId, originalContent, matchedWord, hitLevel, hitScene, handleResult || 'reject']
    );
    const [insertResult] = await db.query('SELECT LAST_INSERT_ID() as id');
    const logId = insertResult[0]?.id;

    await db.query('UPDATE sensitive_word SET hit_count = hit_count + 1 WHERE id = ?', [sensitiveWordId]);
    return logId;
  } catch (err) {
    console.error('[SensitiveService] Log hit error:', err);
    return null;
  }
}

/**
 * 检查用户是否在黑名单
 */
async function isBlacklisted(userId) {
  if (!userId) return false;
  const [rows] = await db.query(
    `SELECT 1 FROM user_black_white_list
     WHERE user_id = ? AND list_type = 'black'
     AND (expire_at IS NULL OR expire_at > NOW())`,
    [userId]
  );
  return rows.length > 0;
}

/**
 * 检查用户是否在白名单（白名单用户跳过敏感词检测）
 */
async function isWhitelisted(userId) {
  if (!userId) return false;
  const [rows] = await db.query(
    `SELECT 1 FROM user_black_white_list
     WHERE user_id = ? AND list_type = 'white'
     AND (expire_at IS NULL OR expire_at > NOW())`,
    [userId]
  );
  return rows.length > 0;
}

/**
 * 根据最高等级返回处理策略
 * 1-2: reject, 3: replace, 4: log
 */
function getHandleStrategy(highestLevel) {
  if (highestLevel <= 2) return 'reject';
  if (highestLevel === 3) return 'replace';
  return 'log';
}

module.exports = {
  initPool,
  hotReload,
  check,
  logHit,
  isBlacklisted,
  isWhitelisted,
  getHandleStrategy,
  loadWords,
};

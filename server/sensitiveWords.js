/**
 * 敏感词检测：判断文本是否包含敏感词，并返回命中的词。
 * 敏感词列表可替换为从文件/数据库加载。
 */
const config = require("./config");

// 默认敏感词列表（示例，可按需替换或通过 config 扩展）
const DEFAULT_WORDS = [
  "违禁",
  "敏感词示例",
  "违规",
  "违法",
  "暴力",
  "色情",
  "赌博",
  "诈骗",
  "反动",
  "暴力",
];

let wordSet = null;

function getWords() {
  if (wordSet) return wordSet;
  const extra = (config.sensitiveWords || []).filter(Boolean);
  wordSet = [...new Set([...DEFAULT_WORDS, ...extra])];
  return wordSet;
}

/**
 * 检测文本是否包含敏感词
 * @param {string} text 待检测文本
 * @returns {{ containsSensitive: boolean, matchedWords: string[] }}
 */
function checkSensitive(text) {
  if (!text || typeof text !== "string") {
    return { containsSensitive: false, matchedWords: [] };
  }
  const words = getWords();
  const normalized = text.trim();
  const matched = words.filter((w) => normalized.includes(w));
  return {
    containsSensitive: matched.length > 0,
    matchedWords: [...new Set(matched)],
  };
}

module.exports = {
  checkSensitive,
  getWords: getWords,
};

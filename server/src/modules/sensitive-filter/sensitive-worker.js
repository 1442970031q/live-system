/**
 * 敏感词检测工作线程
 * 在独立线程中运行 DFA 匹配，避免阻塞主线程事件循环
 *
 * 消息格式：
 * - { type: 'init', words: [...] } 初始化/更新词库
 * - { type: 'match', id, text } 执行匹配，回复 { id, result }
 */
const { parentPort } = require('worker_threads');

// 使用与 DFAFilter 相同的实现（worker 内独立加载）
const FULL_TO_HALF = {
  '０': '0', '１': '1', '２': '2', '３': '3', '４': '4',
  '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
  'Ａ': 'A', 'Ｂ': 'B', 'Ｃ': 'C', 'Ｄ': 'D', 'Ｅ': 'E',
  'Ｆ': 'F', 'Ｇ': 'G', 'Ｈ': 'H', 'Ｉ': 'I', 'Ｊ': 'J',
  'Ｋ': 'K', 'Ｌ': 'L', 'Ｍ': 'M', 'Ｎ': 'N', 'Ｏ': 'O',
  'Ｐ': 'P', 'Ｑ': 'Q', 'Ｒ': 'R', 'Ｓ': 'S', 'Ｔ': 'T',
  'Ｕ': 'U', 'Ｖ': 'V', 'Ｗ': 'W', 'Ｘ': 'X', 'Ｙ': 'Y', 'Ｚ': 'Z',
  'ａ': 'a', 'ｂ': 'b', 'ｃ': 'c', 'ｄ': 'd', 'ｅ': 'e',
  'ｆ': 'f', 'ｇ': 'g', 'ｈ': 'h', 'ｉ': 'i', 'ｊ': 'j',
  'ｋ': 'k', 'ｌ': 'l', 'ｍ': 'm', 'ｎ': 'n', 'ｏ': 'o',
  'ｐ': 'p', 'ｑ': 'q', 'ｒ': 'r', 'ｓ': 's', 'ｔ': 't',
  'ｕ': 'u', 'ｖ': 'v', 'ｗ': 'w', 'ｘ': 'x', 'ｙ': 'y', 'ｚ': 'z',
  '　': ' ',
};

function normalize(text) {
  if (!text || typeof text !== 'string') return '';
  let s = text.trim();
  s = s.split('').map((c) => FULL_TO_HALF[c] || c).join('');
  s = s.toLowerCase();
  s = s.replace(/\s+/g, '');
  return s;
}

function addWord(tree, level, word, wordId) {
  const w = normalize(word);
  if (!w) return;
  let state = tree;
  for (let i = 0; i < w.length; i++) {
    const c = w[i];
    if (!state.has(c)) state.set(c, new Map());
    state = state.get(c);
  }
  state.end = true;
  state.level = level;
  state.word = word;
  if (wordId != null) state.wordId = wordId;
}

function matchText(trees, text) {
  const normalized = normalize(text);
  if (!normalized) return { hit: false, highestLevel: 0, matchedWords: [] };
  const matched = [];
  let highestLevel = 0;
  for (let level = 1; level <= 4; level++) {
    const tree = trees[level];
    if (!tree) continue;
    for (let i = 0; i < normalized.length; i++) {
      let state = tree;
      let j = i;
      while (j < normalized.length && state.has(normalized[j])) {
        state = state.get(normalized[j]);
        j++;
        if (state && state.end) {
          const info = {
            word: state.word || normalized.slice(i, j),
            level: state.level || level,
            wordId: state.wordId,
          };
          if (!matched.some((m) => m.word === info.word && m.level === info.level)) {
            matched.push(info);
            if (info.level > highestLevel) highestLevel = info.level;
          }
          if (level === 1) {
            return { hit: true, highestLevel: 1, matchedWords: matched };
          }
          break;
        }
      }
    }
  }
  return { hit: matched.length > 0, highestLevel, matchedWords: matched };
}

function buildTrees(words) {
  const trees = { 1: new Map(), 2: new Map(), 3: new Map(), 4: new Map() };
  if (!Array.isArray(words)) return trees;
  for (const w of words) {
    const level = Number(w.level) || w.category_level || 1;
    const word = String(w.word || '').trim();
    const id = w.id != null ? w.id : w.wordId;
    if (word && level >= 1 && level <= 4) {
      addWord(trees[level], level, word, id);
    }
  }
  return trees;
}

let trees = buildTrees([]);

parentPort.on('message', (msg) => {
  try {
    if (msg.type === 'init') {
      trees = buildTrees(msg.words || []);
      parentPort.postMessage({ type: 'init_ok' });
      return;
    }
    if (msg.type === 'match') {
      const result = matchText(trees, msg.text);
      parentPort.postMessage({ type: 'match_result', id: msg.id, result });
      return;
    }
  } catch (err) {
    parentPort.postMessage({ type: 'error', id: msg?.id, error: err.message });
  }
});

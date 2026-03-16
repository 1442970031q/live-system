/**
 * DFA（Deterministic Finite Automaton）敏感词过滤器
 *
 * 论文核心创新点：基于 DFA 状态树实现高效敏感词匹配
 * - 分级构建（1→2→3→4 优先级）
 * - 文本预处理归一化（全角转半角、谐音/形近字映射）
 * - 最小粒度匹配，避免过度误判
 * - 一级违禁词命中后直接返回
 *
 * @module DFAFilter
 */

const { normalize } = require('./normalize');

// 无意义字符/Emoji 正则（跳过不参与匹配）
const SKIP_PATTERN = /[\s\u200B-\u200D\uFEFF\u00AD\u2060\u3000\uFF00-\uFFEF\uD800-\uDFFF\u2600-\u26FF\u2700-\u27BF]/g;

/**
 * DFA 敏感词过滤器类
 */
class DFAFilter {
  constructor() {
    /**
     * 分级 DFA 状态树
     * 结构: { 1: Map, 2: Map, 3: Map, 4: Map }
     * 每级为 Map<char, nextState|{ end: true, level, wordId?, word }>
     */
    this.trees = {
      1: new Map(),
      2: new Map(),
      3: new Map(),
      4: new Map(),
    };
    /** 词条与等级映射，用于热更新时快速查找 */
    this.wordToLevel = new Map();
  }

  /**
   * 文本预处理：归一化以便匹配（与 Worker 共用 normalize 模块）
   */
  normalize(text) {
    return normalize(text);
  }

  /**
   * 向指定等级的状态树中插入一个敏感词
   *
   * @param {number} level 等级 1-4
   * @param {string} word 敏感词
   * @param {number} [wordId] 可选，数据库中的词条 ID
   */
  addWord(level, word, wordId) {
    const w = this.normalize(word);
    if (!w) return;
    const tree = this.trees[level];
    let state = tree;
    for (let i = 0; i < w.length; i++) {
      const c = w[i];
      if (!state.has(c)) {
        state.set(c, new Map());
      }
      state = state.get(c);
    }
    state.end = true;
    state.level = level;
    state.word = word;
    if (wordId != null) state.wordId = wordId;
    this.wordToLevel.set(w, level);
  }

  /**
   * 从状态树中移除敏感词（用于热更新）
   *
   * @param {number} level 等级
   * @param {string} word 敏感词
   */
  removeWord(level, word) {
    const w = this.normalize(word);
    if (!w) return;
    const tree = this.trees[level];
    let state = tree;
    const path = [];
    for (let i = 0; i < w.length; i++) {
      const c = w[i];
      if (!state.has(c)) return;
      path.push({ state, char: c });
      state = state.get(c);
    }
    if (state && state.end) {
      delete state.end;
      delete state.level;
      delete state.word;
      delete state.wordId;
      this.wordToLevel.delete(w);
    }
  }

  /**
   * 清空指定等级或全部状态树
   *
   * @param {number} [level] 若指定则只清空该等级
   */
  clear(level) {
    if (level != null) {
      this.trees[level] = new Map();
      for (const [w, l] of this.wordToLevel.entries()) {
        if (l === level) this.wordToLevel.delete(w);
      }
    } else {
      this.trees = { 1: new Map(), 2: new Map(), 3: new Map(), 4: new Map() };
      this.wordToLevel.clear();
    }
  }

  /**
   * 核心匹配逻辑：分级 DFA 扫描
   * 按 1→2→3→4 优先级，一级命中立即返回
   *
   * @param {string} text 待检测文本
   * @returns {{ hit: boolean, highestLevel: number, matchedWords: Array<{word,level,wordId}> }}
   */
  match(text) {
    const normalized = this.normalize(text);
    if (!normalized) {
      return { hit: false, highestLevel: 0, matchedWords: [] };
    }

    const matched = [];
    let highestLevel = 0;

    // 按等级 1→2→3→4 扫描
    for (let level = 1; level <= 4; level++) {
      const tree = this.trees[level];
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
            // 一级违禁词命中后直接返回
            if (level === 1) {
              return {
                hit: true,
                highestLevel: 1,
                matchedWords: matched,
              };
            }
            break; // 最小粒度：匹配到即跳出内层，避免过度延伸
          }
        }
      }
    }

    return {
      hit: matched.length > 0,
      highestLevel,
      matchedWords: matched,
    };
  }

  /**
   * 批量加载词条（用于从数据库加载后构建状态树）
   *
   * @param {Array<{level: number, word: string, id?: number}>} words 词条列表
   */
  loadWords(words) {
    this.clear();
    if (!Array.isArray(words)) return;
    for (const w of words) {
      const level = Number(w.level) || w.category_level || 1;
      const word = String(w.word || '').trim();
      const id = w.id != null ? w.id : w.wordId;
      if (word && level >= 1 && level <= 4) {
        this.addWord(level, word, id);
      }
    }
  }

  /**
   * 原子化切换状态树（热更新时替换整个 trees）
   *
   * @param {Object} newTrees 新的分级状态树 { 1: Map, 2: Map, 3: Map, 4: Map }
   */
  swapTrees(newTrees) {
    if (newTrees && typeof newTrees === 'object') {
      this.trees = newTrees;
      this.wordToLevel.clear();
      for (let level = 1; level <= 4; level++) {
        const tree = this.trees[level];
        if (tree && tree instanceof Map) {
          this._collectWords(tree, level);
        }
      }
    }
  }

  _collectWords(node, level, prefix = '') {
    if (!node || !(node instanceof Map)) return;
    for (const [c, next] of node.entries()) {
      if (next && next.end) {
        const w = prefix + c;
        this.wordToLevel.set(w, level);
      }
      if (next && next instanceof Map) {
        this._collectWords(next, level, prefix + c);
      }
    }
  }
}

module.exports = DFAFilter;

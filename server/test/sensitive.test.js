/**
 * 敏感词检测测试用例
 * 运行：node server/test/sensitive.test.js
 */
const DFAFilter = require('../src/modules/sensitive-filter/DFAFilter');

const filter = new DFAFilter();
filter.loadWords([
  { level: 1, word: '违禁', id: 1 },
  { level: 2, word: '违规', id: 2 },
  { level: 3, word: '暴力', id: 3 },
  { level: 4, word: '预警', id: 4 },
]);

console.log('=== 1. 不含敏感词 ===');
const r1 = filter.match('这是一段正常内容');
console.log(r1);
console.assert(!r1.hit, '应不含敏感词');

console.log('\n=== 2. 含一级违禁词 ===');
const r2 = filter.match('这是违禁内容');
console.log(r2);
console.assert(r2.hit && r2.highestLevel === 1 && r2.matchedWords.some((m) => m.word === '违禁'), '应命中一级违禁词');

console.log('\n=== 3. 全角转半角 ===');
const r3 = filter.match('这是Ｗｅｉ禁内容'); // 全角
console.log(r3);
// 归一化后 "违" 可能被匹配，取决于全角映射

console.log('\n=== 4. 多级命中 ===');
const r4 = filter.match('违禁违规暴力');
console.log(r4);
console.assert(r4.hit && r4.highestLevel === 1, '一级命中应直接返回');

console.log('\n=== 5. 空文本 ===');
const r5 = filter.match('');
console.log(r5);
console.assert(!r5.hit, '空文本应不命中');

console.log('\n=== 6. 热更新 ===');
filter.removeWord(1, '违禁');
const r6 = filter.match('这是违禁内容');
console.log(r6);
console.assert(!r6.hit || r6.matchedWords.every((m) => m.word !== '违禁'), '移除后应不命中该词');

console.log('\n=== 测试完成 ===');

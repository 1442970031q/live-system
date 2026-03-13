#!/usr/bin/env node
/**
 * 敏感词库初始化 - 论文示例测试数据
 * 贴合直播行业监管要求，每个级别 3 条典型数据
 * 运行：node server/scripts/seed-sensitive-words.js
 * 或：cd server && node scripts/seed-sensitive-words.js
 */
const path = require('path');
// 加载项目根目录 .env（可选）
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const db = require('../db');
const sensitiveService = require('../services/sensitiveService');

const TEST_WORDS = [
  // 一级违禁词（违法违规·硬性监管红线）
  { category_id: 1, word: '赌博平台', type: '涉赌' },
  { category_id: 1, word: '海洛因', type: '涉毒' },
  { category_id: 1, word: '色情服务', type: '涉黄' },
  // 二级违规词（平台违规·重点监管对象）
  { category_id: 2, word: '加微信', type: '私域引流' },
  { category_id: 2, word: '百分百赚钱', type: '虚假宣传' },
  { category_id: 2, word: '刷礼物返现', type: '诱导打赏' },
  // 三级违规词（不文明内容·社区生态维护）
  { category_id: 3, word: '废物', type: '人身攻击' },
  { category_id: 3, word: '垃圾', type: '人身攻击' },
  { category_id: 3, word: '白痴', type: '人身攻击' },
  // 四级预警词（潜在风险·重点监控范畴）
  { category_id: 4, word: '保健品', type: '边缘词汇' },
  { category_id: 4, word: '香yan', type: '禁售品类变体' },
  { category_id: 4, word: '私下交易', type: '高风险场景' },
];

async function seed() {
  try {
    await db.initDB();
    const [existing] = await db.query(
      'SELECT category_id, word FROM sensitive_word WHERE category_id IN (1,2,3,4)'
    );
    const existingSet = new Set(existing.map((r) => `${r.category_id}:${r.word}`));

    let inserted = 0;
    for (const { category_id, word } of TEST_WORDS) {
      const key = `${category_id}:${word}`;
      if (existingSet.has(key)) continue;
      await db.query('INSERT INTO sensitive_word (category_id, word) VALUES (?, ?)', [
        category_id,
        word,
      ]);
      inserted++;
      console.log(`  + 已插入: [${category_id}级] ${word}`);
    }

    if (inserted > 0) {
      await sensitiveService.hotReload();
      console.log(`\n共插入 ${inserted} 条敏感词，已触发热更新。`);
    } else {
      console.log('\n所有测试数据已存在，无需插入。');
    }
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
  process.exit(0);
}

seed();

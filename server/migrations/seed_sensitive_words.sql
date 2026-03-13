-- ============================================================
-- 敏感词库初始化 - 论文示例测试数据
-- 贴合直播行业监管要求，每个级别 3 条典型数据
-- 执行：mysql -u user -p database < server/migrations/seed_sensitive_words.sql
-- 或通过 Node 脚本执行
-- ============================================================

-- 确保分类已存在（sensitive_tables.sql 中的 INSERT IGNORE）
INSERT IGNORE INTO sensitive_category (level, name, description, handle_strategy) VALUES
(1, '一级违禁词', '严重违禁，直接拦截', 'reject'),
(2, '二级违规词', '违规内容，拒绝并记录', 'reject'),
(3, '三级违规词', '轻度违规，替换或警告', 'replace'),
(4, '四级预警词', '预警监控，仅记录', 'log');

-- 一级违禁词（违法违规·硬性监管红线）category_id=1
INSERT IGNORE INTO sensitive_word (category_id, word) VALUES
(1, '赌博平台'),  -- 涉赌
(1, '海洛因'),    -- 涉毒
(1, '色情服务');  -- 涉黄

-- 二级违规词（平台违规·重点监管对象）category_id=2
INSERT IGNORE INTO sensitive_word (category_id, word) VALUES
(2, '加微信'),      -- 私域引流
(2, '百分百赚钱'),  -- 虚假宣传
(2, '刷礼物返现');  -- 诱导打赏

-- 三级违规词（不文明内容·社区生态维护）category_id=3
INSERT IGNORE INTO sensitive_word (category_id, word) VALUES
(3, '废物'),  -- 人身攻击
(3, '垃圾'),  -- 人身攻击
(3, '白痴');  -- 人身攻击

-- 四级预警词（潜在风险·重点监控范畴）category_id=4
INSERT IGNORE INTO sensitive_word (category_id, word) VALUES
(4, '保健品'),    -- 边缘词汇
(4, '香yan'),    -- 禁售品类变体（香烟谐音）
(4, '私下交易');  -- 高风险场景

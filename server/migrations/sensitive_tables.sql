-- ============================================================
-- 直播全场景敏感词合规管控 - 新增表结构
-- 与现有 users、live_streams、comments、follows、stream_views 100% 兼容
-- ============================================================

-- 若 users 表无 bio 列，可执行（MySQL 8.0）：
-- ALTER TABLE users ADD COLUMN bio TEXT;

-- 1. 敏感词分级分类表
-- 1=一级违禁词 2=二级违规词 3=三级违规词 4=四级预警词
CREATE TABLE IF NOT EXISTS sensitive_category (
  id INT AUTO_INCREMENT PRIMARY KEY,
  level TINYINT NOT NULL UNIQUE COMMENT '等级 1-4',
  name VARCHAR(50) NOT NULL COMMENT '分类名称',
  description VARCHAR(255) DEFAULT NULL COMMENT '分类描述',
  handle_strategy VARCHAR(100) DEFAULT NULL COMMENT '处理策略描述',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_level (level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='敏感词分级分类表';

-- 2. 敏感词主表
CREATE TABLE IF NOT EXISTS sensitive_word (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL COMMENT '关联分类ID',
  word VARCHAR(100) NOT NULL COMMENT '敏感词内容',
  hit_count INT DEFAULT 0 COMMENT '命中次数统计',
  enabled TINYINT(1) DEFAULT 1 COMMENT '1=启用 0=禁用',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES sensitive_category(id) ON DELETE CASCADE,
  INDEX idx_category_enabled (category_id, enabled),
  INDEX idx_word (word(20))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='敏感词主表';

-- 3. 敏感词命中日志表
CREATE TABLE IF NOT EXISTS sensitive_hit_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT DEFAULT NULL COMMENT '触发用户ID',
  stream_id INT DEFAULT NULL COMMENT '直播间ID',
  sensitive_word_id INT NOT NULL COMMENT '命中的敏感词ID',
  original_content TEXT NOT NULL COMMENT '原始内容',
  matched_word VARCHAR(100) NOT NULL COMMENT '命中的词',
  hit_level TINYINT NOT NULL COMMENT '命中等级 1-4',
  hit_scene VARCHAR(50) NOT NULL COMMENT '命中场景: danmaku/title/bio/voice',
  handle_result VARCHAR(50) DEFAULT NULL COMMENT '处理结果: reject/replace/warn/log',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (sensitive_word_id) REFERENCES sensitive_word(id) ON DELETE CASCADE,
  -- stream_id 关联 live_streams(id)，兼容 streams 表时可不建 FK
  INDEX idx_user_stream (user_id, stream_id),
  INDEX idx_stream_created (stream_id, created_at),
  INDEX idx_level_created (hit_level, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='敏感词命中日志表';

-- 4. 用户黑白名单表
CREATE TABLE IF NOT EXISTS user_black_white_list (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL COMMENT '用户ID',
  list_type ENUM('black', 'white') NOT NULL COMMENT 'black=黑名单 white=白名单',
  reason VARCHAR(255) DEFAULT NULL COMMENT '加入原因',
  expire_at TIMESTAMP NULL DEFAULT NULL COMMENT '过期时间 NULL=永久',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_type (user_id, list_type),
  INDEX idx_type_expire (list_type, expire_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户黑白名单表';

-- 初始化默认分类
INSERT IGNORE INTO sensitive_category (level, name, description, handle_strategy) VALUES
(1, '一级违禁词', '严重违禁，直接拦截', 'reject'),
(2, '二级违规词', '违规内容，拒绝并记录', 'reject'),
(3, '三级违规词', '轻度违规，替换或警告', 'replace'),
(4, '四级预警词', '预警监控，仅记录', 'log');

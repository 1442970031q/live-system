// 数据库连接
// mysql 地址 https://sqlpub.com/dashboard/userDb
const mysql = require('mysql2/promise');
const config = require('./config');

let pool;

async function initDB() {
  try {
    pool = mysql.createPool({
      host: config.mysql.host,
      user: config.mysql.user,
      password: config.mysql.password,
      database: config.mysql.database,
      port: config.mysql.port,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
    
    // 创建必要的表
    await createTables();
    console.log('Database connected and tables created');
    return pool;
  } catch (error) {
    console.error('Database connection failed:', error);
    throw error;
  }
}

async function createTables() {
  // 用户表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(100) NOT NULL,
      avatar VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // 若表已存在，补充 bio 列（敏感词检测场景）
  await pool.execute('ALTER TABLE users ADD COLUMN bio TEXT').catch(() => {});
  
  // 直播表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS live_streams (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(200) NOT NULL,
      description TEXT,
      thumbnail VARCHAR(255),
      is_live BOOLEAN DEFAULT FALSE,
      started_at TIMESTAMP,
      ended_at TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  
  // 弹幕表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS comments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      stream_id INT NOT NULL,
      user_id INT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (stream_id) REFERENCES live_streams(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  
  // 关注表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS follows (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      follow_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (follow_id) REFERENCES users(id),
      UNIQUE KEY unique_follow (user_id, follow_id)
    )
  `);

  // 敏感词合规管控相关表
  await createSensitiveTables();
}

/**
 * 创建敏感词合规管控相关表（论文级功能扩展）
 */
async function createSensitiveTables() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS sensitive_category (
      id INT AUTO_INCREMENT PRIMARY KEY,
      level TINYINT NOT NULL UNIQUE,
      name VARCHAR(50) NOT NULL,
      description VARCHAR(255) DEFAULT NULL,
      handle_strategy VARCHAR(100) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_level (level)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS sensitive_word (
      id INT AUTO_INCREMENT PRIMARY KEY,
      category_id INT NOT NULL,
      word VARCHAR(100) NOT NULL,
      hit_count INT DEFAULT 0,
      enabled TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES sensitive_category(id) ON DELETE CASCADE,
      INDEX idx_category_enabled (category_id, enabled),
      INDEX idx_word (word(20))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS sensitive_hit_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT DEFAULT NULL,
      stream_id INT DEFAULT NULL,
      sensitive_word_id INT NOT NULL,
      original_content TEXT NOT NULL,
      matched_word VARCHAR(100) NOT NULL,
      hit_level TINYINT NOT NULL,
      hit_scene VARCHAR(50) NOT NULL,
      handle_result VARCHAR(50) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (sensitive_word_id) REFERENCES sensitive_word(id) ON DELETE CASCADE,
      INDEX idx_user_stream (user_id, stream_id),
      INDEX idx_stream_created (stream_id, created_at),
      INDEX idx_level_created (hit_level, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS user_black_white_list (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      list_type ENUM('black', 'white') NOT NULL,
      reason VARCHAR(255) DEFAULT NULL,
      expire_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY unique_user_type (user_id, list_type),
      INDEX idx_type_expire (list_type, expire_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // 初始化默认分类
  await pool.execute(`
    INSERT IGNORE INTO sensitive_category (level, name, description, handle_strategy) VALUES
    (1, '一级违禁词', '严重违禁，直接拦截', 'reject'),
    (2, '二级违规词', '违规内容，拒绝并记录', 'reject'),
    (3, '三级违规词', '轻度违规，替换或警告', 'replace'),
    (4, '四级预警词', '预警监控，仅记录', 'log')
  `);
}

async function query(sql, params) {
  return pool.execute(sql, params);
}

module.exports = {
  initDB,
  query
};

/**
 -- 创建数据库
CREATE DATABASE IF NOT EXISTS live_streaming;
USE live_streaming;

-- 用户表：存储用户注册和登录信息
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(100) NOT NULL, -- 存储加密后的密码
    avatar VARCHAR(255) DEFAULT NULL, -- 头像URL
    bio TEXT DEFAULT NULL, -- 个人简介
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_username (username),
    INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 直播表：存储直播相关信息
CREATE TABLE streams (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL, -- 主播ID，关联用户表
    title VARCHAR(200) NOT NULL, -- 直播标题
    description TEXT DEFAULT NULL, -- 直播描述
    status ENUM('offline', 'live', 'ended') DEFAULT 'offline', -- 直播状态
    stream_key VARCHAR(100) NOT NULL UNIQUE, -- 直播推流密钥
    thumbnail VARCHAR(255) DEFAULT NULL, -- 直播封面图
    view_count INT DEFAULT 0, -- 观看人数
    start_time DATETIME DEFAULT NULL, -- 开始时间
    end_time DATETIME DEFAULT NULL, -- 结束时间
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 弹幕表：存储直播弹幕信息
CREATE TABLE comments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL, -- 发送者ID
    stream_id INT NOT NULL, -- 所属直播间ID
    content VARCHAR(500) NOT NULL, -- 弹幕内容
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (stream_id) REFERENCES live_streams(id) ON DELETE CASCADE,
    INDEX idx_stream_id (stream_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 关注表：存储用户关注关系
CREATE TABLE follows (
    id INT PRIMARY KEY AUTO_INCREMENT,
    follower_id INT NOT NULL, -- 关注者ID
    following_id INT NOT NULL, -- 被关注者ID
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_follow (follower_id, following_id), -- 防止重复关注
    INDEX idx_follower (follower_id),
    INDEX idx_following (following_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 直播观看记录表：用于统计观看数据
CREATE TABLE stream_views (
    id INT PRIMARY KEY AUTO_INCREMENT,
    stream_id INT NOT NULL,
    user_id INT DEFAULT NULL, -- 可为NULL，支持游客观看
    join_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    leave_time TIMESTAMP DEFAULT NULL,
    FOREIGN KEY (stream_id) REFERENCES streams(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_stream_user (stream_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

 */
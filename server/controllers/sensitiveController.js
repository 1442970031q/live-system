/**
 * 敏感词管理后台控制器
 * 所有接口需 JWT 鉴权
 */
const db = require('../db');
const sensitiveService = require('../services/sensitiveService');

// ========== 敏感词分类管理 ==========

/** 获取全部分类 */
async function getCategories(req, res) {
  try {
    const [rows] = await db.query(
      'SELECT id, level, name, description, handle_strategy, created_at FROM sensitive_category ORDER BY level ASC'
    );
    res.json(rows);
  } catch (err) {
    console.error('getCategories error:', err);
    res.status(500).json({ message: '获取分类失败' });
  }
}

/** 新增分类 */
async function createCategory(req, res) {
  try {
    const { level, name, description, handle_strategy } = req.body;
    if (!level || !name) {
      return res.status(400).json({ message: 'level 和 name 必填' });
    }
    const [result] = await db.query(
      'INSERT INTO sensitive_category (level, name, description, handle_strategy) VALUES (?, ?, ?, ?)',
      [level, name || null, description || null, handle_strategy || null]
    );
    res.status(201).json({ id: result.insertId, level, name });
  } catch (err) {
    console.error('createCategory error:', err);
    res.status(500).json({ message: '新增分类失败' });
  }
}

/** 更新分类 */
async function updateCategory(req, res) {
  try {
    const { id } = req.params;
    const { level, name, description, handle_strategy } = req.body;
    await db.query(
      'UPDATE sensitive_category SET level=?, name=?, description=?, handle_strategy=? WHERE id=?',
      [level, name, description, handle_strategy, id]
    );
    res.json({ message: '更新成功' });
  } catch (err) {
    console.error('updateCategory error:', err);
    res.status(500).json({ message: '更新分类失败' });
  }
}

/** 删除分类 */
async function deleteCategory(req, res) {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM sensitive_category WHERE id = ?', [id]);
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('deleteCategory error:', err);
    res.status(500).json({ message: '删除分类失败' });
  }
}

// ========== 敏感词主表管理 ==========

/** 分页列表，支持筛选/排序 */
async function getWords(req, res) {
  try {
    const { page = 1, pageSize = 20, categoryId, enabled, keyword, sortBy = 'id', sortOrder = 'DESC' } = req.query;
    const offset = Math.max(0, parseInt((Number(page) - 1) * Number(pageSize), 10));
    const limit = Math.min(Math.max(1, parseInt(Number(pageSize) || 20, 10)), 100);

    let where = '1=1';
    const params = [];
    if (categoryId) {
      where += ' AND sw.category_id = ?';
      params.push(categoryId);
    }
    if (enabled !== undefined && enabled !== '') {
      where += ' AND sw.enabled = ?';
      params.push(Number(enabled));
    }
    if (keyword) {
      where += ' AND sw.word LIKE ?';
      params.push(`%${keyword}%`);
    }

    const orderCol = ['id', 'word', 'hit_count', 'created_at'].includes(sortBy) ? sortBy : 'id';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const [rows] = await db.query(
      `SELECT sw.*, sc.level, sc.name as category_name
       FROM sensitive_word sw
       JOIN sensitive_category sc ON sw.category_id = sc.id
       WHERE ${where}
       ORDER BY sw.${orderCol} ${order}
       LIMIT ? OFFSET ?`,
      [...params, String(limit), String(offset)]
    );

    const [[countResult]] = await db.query(
      `SELECT COUNT(*) as total FROM sensitive_word sw WHERE ${where}`,
      params
    );
    const total = countResult?.total ?? 0;

    res.json({ list: rows, total, page: Number(page), pageSize: limit });
  } catch (err) {
    console.error('getWords error:', err);
    res.status(500).json({ message: '获取敏感词列表失败' });
  }
}

/** 新增敏感词 */
async function createWord(req, res) {
  try {
    const { category_id, word } = req.body;
    if (!category_id || !word) {
      return res.status(400).json({ message: 'category_id 和 word 必填' });
    }
    const [result] = await db.query(
      'INSERT INTO sensitive_word (category_id, word) VALUES (?, ?)',
      [category_id, String(word).trim()]
    );
    await sensitiveService.hotReload();
    res.status(201).json({ id: result.insertId, category_id, word });
  } catch (err) {
    console.error('createWord error:', err);
    res.status(500).json({ message: '新增敏感词失败' });
  }
}

/** 编辑敏感词 */
async function updateWord(req, res) {
  try {
    const { id } = req.params;
    const { category_id, word, enabled } = req.body;
    const updates = [];
    const params = [];
    if (category_id != null) {
      updates.push('category_id = ?');
      params.push(category_id);
    }
    if (word != null) {
      updates.push('word = ?');
      params.push(String(word).trim());
    }
    if (enabled !== undefined) {
      updates.push('enabled = ?');
      params.push(Number(enabled));
    }
    if (updates.length === 0) {
      return res.status(400).json({ message: '无有效更新字段' });
    }
    params.push(id);
    await db.query(`UPDATE sensitive_word SET ${updates.join(', ')} WHERE id = ?`, params);
    await sensitiveService.hotReload();
    res.json({ message: '更新成功' });
  } catch (err) {
    console.error('updateWord error:', err);
    res.status(500).json({ message: '更新敏感词失败' });
  }
}

/** 启用/禁用敏感词 */
async function toggleWord(req, res) {
  try {
    const { id } = req.params;
    const { enabled } = req.body;
    await db.query('UPDATE sensitive_word SET enabled = ? WHERE id = ?', [Number(enabled), id]);
    await sensitiveService.hotReload();
    res.json({ message: '操作成功' });
  } catch (err) {
    console.error('toggleWord error:', err);
    res.status(500).json({ message: '操作失败' });
  }
}

/** 批量导入敏感词 */
async function batchImport(req, res) {
  try {
    const { words } = req.body; // [{ category_id, word }, ...]
    if (!Array.isArray(words) || words.length === 0) {
      return res.status(400).json({ message: 'words 数组不能为空' });
    }
    let count = 0;
    for (const w of words) {
      const cid = w.category_id || w.categoryId;
      const word = String(w.word || '').trim();
      if (cid && word) {
        await db.query('INSERT IGNORE INTO sensitive_word (category_id, word) VALUES (?, ?)', [cid, word]);
        count++;
      }
    }
    await sensitiveService.hotReload();
    res.json({ message: `成功导入 ${count} 条` });
  } catch (err) {
    console.error('batchImport error:', err);
    res.status(500).json({ message: '批量导入失败' });
  }
}

/** 热更新词库 */
async function hotReload(req, res) {
  try {
    await sensitiveService.hotReload();
    res.json({ message: '热更新成功' });
  } catch (err) {
    console.error('hotReload error:', err);
    res.status(500).json({ message: '热更新失败' });
  }
}

// ========== 违规日志查询 ==========

async function getHitLogs(req, res) {
  try {
    const { page = 1, pageSize = 20, userId, streamId, level, startTime, endTime } = req.query;
    const offset = Math.max(0, parseInt((Number(page) - 1) * Number(pageSize), 10));
    const limit = Math.min(Math.max(1, parseInt(Number(pageSize) || 20, 10)), 100);

    let where = '1=1';
    const params = [];
    if (userId) {
      where += ' AND l.user_id = ?';
      params.push(userId);
    }
    if (streamId) {
      where += ' AND l.stream_id = ?';
      params.push(streamId);
    }
    if (level) {
      where += ' AND l.hit_level = ?';
      params.push(level);
    }
    if (startTime) {
      where += ' AND l.created_at >= ?';
      params.push(startTime);
    }
    if (endTime) {
      where += ' AND l.created_at <= ?';
      params.push(endTime);
    }

    const [rows] = await db.query(
      `SELECT l.*, u.username
       FROM sensitive_hit_log l
       LEFT JOIN users u ON l.user_id = u.id
       WHERE ${where}
       ORDER BY l.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, String(limit), String(offset)]
    );

    const [countRows] = await db.query(
      `SELECT COUNT(*) as total FROM sensitive_hit_log l WHERE ${where}`,
      params
    );
    const total = Number(countRows?.[0]?.total ?? 0);

    res.json({ list: rows, total, page: Number(page), pageSize: limit });
  } catch (err) {
    console.error('getHitLogs error:', err);
    res.status(500).json({ message: '获取违规日志失败' });
  }
}

// ========== 用户黑白名单管理 ==========

async function getBlackWhiteList(req, res) {
  try {
    const { listType = 'black', page = 1, pageSize = 20 } = req.query;
    const offset = Math.max(0, parseInt((Number(page) - 1) * Number(pageSize), 10));
    const limit = Math.min(Math.max(1, parseInt(Number(pageSize) || 20, 10)), 100);
    const type = listType === 'white' ? 'white' : 'black';

    const [rows] = await db.query(
      `SELECT b.*, u.username
       FROM user_black_white_list b
       JOIN users u ON b.user_id = u.id
       WHERE b.list_type = ?
       AND (b.expire_at IS NULL OR b.expire_at > NOW())
       ORDER BY b.created_at DESC
       LIMIT ? OFFSET ?`,
      [type, String(limit), String(offset)]
    );

    const [[countResult]] = await db.query(
      'SELECT COUNT(*) as total FROM user_black_white_list WHERE list_type = ? AND (expire_at IS NULL OR expire_at > NOW())',
      [type]
    );
    const total = countResult?.total ?? 0;

    res.json({ list: rows, total, page: Number(page), pageSize: limit });
  } catch (err) {
    console.error('getBlackWhiteList error:', err);
    res.status(500).json({ message: '获取名单失败' });
  }
}

async function addBlackWhite(req, res) {
  try {
    const { userId, listType, reason, expireAt } = req.body;
    if (!userId || !listType) {
      return res.status(400).json({ message: 'userId 和 listType 必填' });
    }
    const type = listType === 'white' ? 'white' : 'black';
    await db.query(
      `INSERT INTO user_black_white_list (user_id, list_type, reason, expire_at)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE reason=VALUES(reason), expire_at=VALUES(expire_at)`,
      [userId, type, reason || null, expireAt || null]
    );
    res.status(201).json({ message: '添加成功' });
  } catch (err) {
    console.error('addBlackWhite error:', err);
    res.status(500).json({ message: '添加失败' });
  }
}

async function removeBlackWhite(req, res) {
  try {
    const { userId, listType } = req.params;
    await db.query('DELETE FROM user_black_white_list WHERE user_id = ? AND list_type = ?', [
      userId,
      listType === 'white' ? 'white' : 'black',
    ]);
    res.json({ message: '移除成功' });
  } catch (err) {
    console.error('removeBlackWhite error:', err);
    res.status(500).json({ message: '移除失败' });
  }
}

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getWords,
  createWord,
  updateWord,
  toggleWord,
  batchImport,
  hotReload,
  getHitLogs,
  getBlackWhiteList,
  addBlackWhite,
  removeBlackWhite,
};

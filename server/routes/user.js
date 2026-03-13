// 用户路由
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { sensitiveCheck } = require('../middleware/sensitiveCheck');

// 更新用户简介（需敏感词检测）
router.put('/profile', authenticateToken, sensitiveCheck({ field: 'bio', scene: 'bio' }), async (req, res) => {
  try {
    const { bio } = req.body;
    const userId = req.user.id;
    await db.query('UPDATE users SET bio = ? WHERE id = ?', [bio || null, userId]);
    res.json({ message: '更新成功' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Failed to update profile' });
  }
});

// 关注用户
router.post('/follow/:userId', authenticateToken, async (req, res) => {
  try {
    const followId = parseInt(req.params.userId);
    const userId = req.user.id;
    
    if (userId === followId) {
      return res.status(400).json({ message: 'You cannot follow yourself' });
    }
    
    // 检查用户是否存在
    const [users] = await db.query(
      'SELECT * FROM users WHERE id = ?',
      [followId]
    );
    
    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // 检查是否已关注
    const [follows] = await db.query(
      'SELECT * FROM follows WHERE user_id = ? AND follow_id = ?',
      [userId, followId]
    );
    
    if (follows.length > 0) {
      return res.status(400).json({ message: 'You are already following this user' });
    }
    
    await db.query(
      'INSERT INTO follows (user_id, follow_id) VALUES (?, ?)',
      [userId, followId]
    );
    
    res.json({ message: 'Successfully followed user' });
  } catch (error) {
    console.error('Follow user error:', error);
    res.status(500).json({ message: 'Failed to follow user' });
  }
});

// 取消关注
router.post('/unfollow/:userId', authenticateToken, async (req, res) => {
  try {
    const followId = parseInt(req.params.userId);
    const userId = req.user.id;
    
    await db.query(
      'DELETE FROM follows WHERE user_id = ? AND follow_id = ?',
      [userId, followId]
    );
    
    res.json({ message: 'Successfully unfollowed user' });
  } catch (error) {
    console.error('Unfollow user error:', error);
    res.status(500).json({ message: 'Failed to unfollow user' });
  }
});

// 获取用户的关注列表
router.get('/follows', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const [follows] = await db.query(`
      SELECT u.id, u.username, u.avatar 
      FROM follows f
      JOIN users u ON f.follow_id = u.id
      WHERE f.user_id = ?
    `, [userId]);
    
    res.json(follows);
  } catch (error) {
    console.error('Get follows error:', error);
    res.status(500).json({ message: 'Failed to get follows' });
  }
});

// 获取用户信息
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const [users] = await db.query(
      'SELECT id, username, email, avatar, created_at FROM users WHERE id = ?',
      [userId]
    );
    
    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(users[0]);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Failed to get user' });
  }
});

module.exports = router;

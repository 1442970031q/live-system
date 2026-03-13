/**
 * 敏感词管理后台路由
 * 所有接口需 JWT 鉴权
 */
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const ctrl = require('../controllers/sensitiveController');

router.use(authenticateToken);

// 分类管理
router.get('/categories', ctrl.getCategories);
router.post('/categories', ctrl.createCategory);
router.put('/categories/:id', ctrl.updateCategory);
router.delete('/categories/:id', ctrl.deleteCategory);

// 敏感词管理
router.get('/words', ctrl.getWords);
router.post('/words', ctrl.createWord);
router.put('/words/:id', ctrl.updateWord);
router.post('/words/:id/toggle', ctrl.toggleWord);
router.post('/words/batch-import', ctrl.batchImport);
router.post('/words/hot-reload', ctrl.hotReload);

// 违规日志
router.get('/hit-logs', ctrl.getHitLogs);

// 黑白名单
router.get('/black-white', ctrl.getBlackWhiteList);
router.post('/black-white', ctrl.addBlackWhite);
router.delete('/black-white/:userId/:listType', ctrl.removeBlackWhite);

module.exports = router;

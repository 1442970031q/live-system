/**
 * 敏感词过滤模块统一导出
 */
const DFAFilter = require('./DFAFilter');
const SensitiveWorkerPool = require('./WorkerPool');

module.exports = {
  DFAFilter,
  SensitiveWorkerPool,
};

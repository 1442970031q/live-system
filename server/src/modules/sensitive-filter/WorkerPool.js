/**
 * 敏感词检测异步工作线程池
 *
 * 论文核心创新点：解决 DFA 匹配阻塞主线程问题
 * - 基于 os.cpus().length 动态创建固定大小工作线程池
 * - 任务队列调度（setImmediate 主动让出事件循环）
 * - 线程间 DFA 状态树一致（通过 init 消息同步词库）
 * - 异常处理与日志记录
 *
 * @module SensitiveWorkerPool
 */
const { Worker } = require('worker_threads');
const os = require('os');
const path = require('path');

class SensitiveWorkerPool {
  constructor(options = {}) {
    this.size = options.size || Math.max(1, os.cpus().length - 1);
    this.workers = [];
    this.taskQueue = [];
    this.busy = new Set();
    this.taskId = 0;
    this.workerPath = path.join(__dirname, 'sensitive-worker.js');
    this.initialized = false;
  }

  /**
   * 初始化工作线程池并加载词库
   *
   * @param {Array} words 敏感词列表 [{ level, word, id }]
   * @returns {Promise<void>}
   */
  async init(words = []) {
    if (this.initialized) {
      await this.updateWords(words);
      return;
    }
    const initPromises = [];
    for (let i = 0; i < this.size; i++) {
      const worker = new Worker(this.workerPath, { workerData: {} });
      this.workers.push(worker);
      this.busy.delete(worker);

      worker.on('error', (err) => {
        console.error('[SensitiveWorkerPool] Worker error:', err);
      });
      worker.on('exit', (code) => {
        if (code !== 0) {
          console.error('[SensitiveWorkerPool] Worker exited with code', code);
        }
      });

      initPromises.push(
        new Promise((resolve, reject) => {
          const handler = (msg) => {
            worker.off('message', handler);
            if (msg.type === 'init_ok') resolve();
            else reject(new Error('Init failed'));
          };
          worker.on('message', handler);
          worker.postMessage({ type: 'init', words });
        })
      );
    }
    await Promise.all(initPromises);
    this.initialized = true;
  }

  /**
   * 热更新词库（原子化切换，无需重启）
   *
   * @param {Array} words 新的敏感词列表
   * @returns {Promise<void>}
   */
  async updateWords(words) {
    if (!this.initialized) {
      await this.init(words);
      return;
    }
    const promises = this.workers.map(
      (w) =>
        new Promise((resolve) => {
          const handler = (msg) => {
            w.off('message', handler);
            resolve();
          };
          w.on('message', handler);
          w.postMessage({ type: 'init', words });
        })
    );
    await Promise.all(promises);
  }

  /**
   * 提交检测任务到工作线程池
   * 通过 setImmediate 实现任务队列调度，避免阻塞事件循环
   *
   * @param {string} text 待检测文本
   * @returns {Promise<{ hit: boolean, highestLevel: number, matchedWords: Array }>}
   */
  check(text) {
    return new Promise((resolve, reject) => {
      const id = ++this.taskId;
      const task = { id, text, resolve, reject };

      const run = () => {
        setImmediate(() => {
          const worker = this._getIdleWorker();
          if (!worker) {
            this.taskQueue.push(task);
            return;
          }
          this._runTask(worker, task);
        });
      };

      if (this.workers.length === 0) {
        reject(new Error('Worker pool not initialized'));
        return;
      }
      run();
    });
  }

  _getIdleWorker() {
    for (const w of this.workers) {
      if (!this.busy.has(w)) return w;
    }
    return null;
  }

  _runTask(worker, task) {
    this.busy.add(worker);
    const handler = (msg) => {
      if (msg.id !== task.id) return;
      worker.off('message', handler);
      this.busy.delete(worker);
      if (msg.type === 'match_result') {
        task.resolve(msg.result);
      } else if (msg.type === 'error') {
        task.reject(new Error(msg.error || 'Match failed'));
      }
      this._processQueue();
    };
    worker.on('message', handler);
    worker.postMessage({ type: 'match', id: task.id, text: task.text });
  }

  _processQueue() {
    if (this.taskQueue.length === 0) return;
    const worker = this._getIdleWorker();
    if (!worker) return;
    const task = this.taskQueue.shift();
    this._runTask(worker, task);
  }

  /**
   * 关闭线程池
   */
  async terminate() {
    for (const w of this.workers) {
      await w.terminate();
    }
    this.workers = [];
    this.busy.clear();
    this.taskQueue.forEach((t) => t.reject(new Error('Pool terminated')));
    this.taskQueue = [];
    this.initialized = false;
  }
}

module.exports = SensitiveWorkerPool;

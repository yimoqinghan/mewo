/**
 * pm2 进程配置。
 * 用法：pm2 start deploy/ecosystem.config.cjs && pm2 save
 *
 * 2C2G 机器的内存分配思路：
 *   API     约 120~200MB 常驻
 *   Worker  约 150~250MB（下载 2K 图时会有瞬时峰值）
 *   PostgreSQL 约 300~400MB（已调低 shared_buffers）
 *   剩余约 1GB 留给系统和突发
 * 因此两个进程都限制堆上限，超了让 pm2 重启，而不是让系统 OOM 杀掉整个服务。
 */
module.exports = {
  apps: [
    {
      name: 'yanmiao-api',
      cwd: '/www/yanmiao/server',
      script: 'src/server.js',
      instances: 1,
      exec_mode: 'fork',
      node_args: '--max-old-space-size=384',
      max_memory_restart: '450M',
      env: { NODE_ENV: 'production' },
      error_file: '/var/log/yanmiao/api-error.log',
      out_file: '/var/log/yanmiao/api-out.log',
      merge_logs: true,
      time: true,
      // 连续快速崩溃说明配置或依赖有问题，不要再无限重启
      max_restarts: 10,
      min_uptime: '20s',
      restart_delay: 3000,
      kill_timeout: 10000
    },
    {
      name: 'yanmiao-worker',
      cwd: '/www/yanmiao/server',
      script: 'src/workers/generationWorker.js',
      instances: 1,
      exec_mode: 'fork',
      node_args: '--max-old-space-size=512',
      max_memory_restart: '600M',
      env: { NODE_ENV: 'production' },
      error_file: '/var/log/yanmiao/worker-error.log',
      out_file: '/var/log/yanmiao/worker-out.log',
      merge_logs: true,
      time: true,
      max_restarts: 10,
      min_uptime: '20s',
      restart_delay: 5000,
      // 给正在生成的任务留出收尾时间
      kill_timeout: 35000
    }
  ]
};

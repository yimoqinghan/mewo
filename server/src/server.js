import { buildApp } from './app.js';
import { config } from './config.js';
import { closePool } from './db/pool.js';

const app = await buildApp();

async function shutdown(signal) {
  app.log.info(`收到 ${signal}，开始优雅退出`);
  try {
    await app.close();
    await closePool();
    process.exit(0);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    `言喵后端已启动 env=${config.env} ai=${config.ai.provider} cos=${config.cos.enabled ? 'on' : 'off'}`
  );
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

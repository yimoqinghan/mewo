import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';

const app = await buildApp();

try {
  const basePayload = {
    templateKey: 'ai-image',
    catIds: [],
    assetIds: [],
    options: {}
  };

  const withoutModel = await app.inject({
    method: 'POST',
    url: '/v1/generations',
    payload: basePayload
  });
  const withEmptyModel = await app.inject({
    method: 'POST',
    url: '/v1/generations',
    payload: { ...basePayload, options: { model: '' } }
  });

  assert.equal(
    withEmptyModel.statusCode,
    withoutModel.statusCode,
    '空 model 应该和未传 model 一样进入后续鉴权，不应触发 schema 校验失败'
  );
  assert.notEqual(withEmptyModel.statusCode, 400, '空 model 不应返回参数校验错误');
  console.log('generation validation regression: passed');
} finally {
  await app.close();
}

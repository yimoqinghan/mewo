import assert from 'node:assert/strict';
import { mediaOutput, mediaTaskId } from '../src/services/ai/openai.js';

const payload = {
  data: [{ task_id: 'task-redacted', result_url: 'https://media.example.test/result.gif' }]
};

const result = mediaOutput(payload, mediaTaskId(payload), 'gif');
assert.equal(mediaTaskId(payload), 'task-redacted');
assert.deepEqual(result.imageUrls, ['https://media.example.test/result.gif']);
assert.equal(result.contentType, 'image/gif');

console.log('gif provider regression: passed');

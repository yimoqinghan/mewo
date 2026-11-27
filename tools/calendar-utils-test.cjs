const assert = require('node:assert/strict');
const { dateKey, getMonthGrid, sortEvents } = require('../miniprogram/utils/calendar');

const grid = getMonthGrid(2026, 1, [
  { id: 'birthday', date: '2026-02-14', title: '生日' },
  { id: 'vaccine', date: '2026-02-03', title: '疫苗' }
]);

assert.equal(dateKey(new Date(2026, 1, 14)), '2026-02-14');
assert.equal(grid.length, 42);
assert.equal(grid.find((day) => day.date === '2026-02-14').hasEvent, true);
assert.equal(grid.find((day) => day.date === '2026-02-14').events[0].title, '生日');
assert.deepEqual(sortEvents([
  { id: 'later', date: '2026-02-20', createdAt: 2 },
  { id: 'earlier', date: '2026-02-02', createdAt: 1 }
]).map((event) => event.id), ['earlier', 'later']);

console.log('calendar utils: passed');

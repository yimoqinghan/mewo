const assert = require('assert');
const { createLocalCat, getActiveCats, getPreferredCurrentCatId } = require('../miniprogram/utils/cat-archive');

const cat = createLocalCat({
  name: '奶糖',
  age: '2 岁',
  traits: '黑猫、黄眼睛',
  likes: '晒太阳，纸箱',
  dislikes: '吹风机'
}, [{ path: '/tmp/cat.jpg' }]);

assert.strictEqual(cat.name, '奶糖');
assert.deepStrictEqual(cat.traits, ['黑猫', '黄眼睛']);
assert.deepStrictEqual(cat.likes, ['晒太阳', '纸箱']);
assert.strictEqual(cat.photos[0].isCover, true);

const cats = [cat, { id: 'archived', name: '旧主角', archivedAt: '2026-11-20' }, { id: 'default', isDefault: true }];
assert.strictEqual(getActiveCats(cats).length, 2);
assert.strictEqual(getPreferredCurrentCatId(cats, 'missing'), 'default');
assert.strictEqual(getPreferredCurrentCatId(cats, cat.id), cat.id);
console.log('cat archive: passed');

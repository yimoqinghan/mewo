const { asset } = require('./assets');

const FALLBACK_AVATAR = asset('design-webp/cat-home.webp');

function avatarUrl(cat) {
  const avatar = cat && cat.avatar;
  return avatar?.url || avatar?.path || avatar || FALLBACK_AVATAR;
}

function normalizePhotos(cat) {
  const list = Array.isArray(cat?.photos) ? cat.photos : (Array.isArray(cat?.photoPaths) ? cat.photoPaths : []);
  return list.map((photo, index) => {
    const path = typeof photo === 'string' ? photo : (photo?.path || photo?.url || '');
    return path ? { id: photo?.id || `photo-${index}-${path}`, path, assetId: photo?.assetId || '', isCover: Boolean(photo?.isCover), createdAt: photo?.createdAt || 0 } : null;
  }).filter(Boolean);
}

function calculateAge(birthday, fallbackAge = '') {
  if (!birthday) return fallbackAge || '年龄未记录';
  const birth = new Date(`${birthday}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return fallbackAge || '年龄未记录';
  const now = new Date();
  if (birth > now) return '出生日期待确认';
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) { years -= 1; months += 12; }
  if (years <= 0) return `${Math.max(months, 0)} 个月`;
  return months ? `${years} 岁 ${months} 个月` : `${years} 岁`;
}

function defaultHumanProfile(cat) {
  const firstTrait = String(cat?.traits || '').split(/[·、,，\s]+/).filter(Boolean)[0] || '家中';
  const name = cat?.name || '喵';
  return {
    role: cat?.humanRole || `${firstTrait}小管家`,
    speechStyle: cat?.speechStyle || (cat?.personality ? `${cat.personality}，偶尔嘴硬` : '软糯又有一点傲娇'),
    catchphrase: cat?.catchphrase || `朕的${name}，过来。`
  };
}

function decorateCat(cat = {}) {
  const photos = normalizePhotos(cat);
  const cover = photos.find((photo) => photo.isCover) || photos[0];
  const traitText = Array.isArray(cat.traits) ? cat.traits.join(' · ') : (cat.traits || '');
  return {
    ...cat,
    traits: traitText,
    avatar: cover?.path || avatarUrl(cat),
    avatarAssetId: cat.avatar?.assetId || cat.avatarAssetId || '',
    photos,
    ageText: calculateAge(cat.birthday, cat.age),
    humanProfile: defaultHumanProfile(cat)
  };
}

function splitTags(value) {
  return String(value || '').split(/[、,，\s]+/).map((item) => item.trim()).filter(Boolean);
}

module.exports = { FALLBACK_AVATAR, avatarUrl, normalizePhotos, calculateAge, defaultHumanProfile, decorateCat, splitTags };

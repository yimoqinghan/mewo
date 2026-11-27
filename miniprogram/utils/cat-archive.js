const { splitTags } = require('./cat-profile');

function createLocalCat(form = {}, photos = [], existing = null) {
  const now = Date.now();
  const photoList = Array.isArray(photos) ? photos : [];
  const hasCover = photoList.some((item) => item && item.isCover);
  const normalizedPhotos = photoList.filter((photo) => photo && photo.path).map((photo, index) => ({
    ...photo,
    id: photo.id || `photo-${now}-${index}`,
    isCover: Boolean(photo.isCover) || (!hasCover && index === 0),
    createdAt: photo.createdAt || now + index
  }));
  const cover = normalizedPhotos.find((photo) => photo.isCover) || normalizedPhotos[0];
  return {
    ...(existing || {}),
    id: existing?.id || `cat-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name: String(form.name || '').trim(),
    age: String(form.age || '').trim(),
    birthday: form.birthday || '',
    traits: splitTags(form.traits),
    personality: String(form.personality || '').trim(),
    likes: splitTags(form.likes),
    dislikes: splitTags(form.dislikes),
    humanRole: String(form.humanRole || '').trim(),
    speechStyle: String(form.speechStyle || '').trim(),
    catchphrase: String(form.catchphrase || '').trim(),
    photos: normalizedPhotos,
    avatar: cover?.path || existing?.avatar || '',
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
}

function getActiveCats(cats) {
  return (Array.isArray(cats) ? cats : []).filter((cat) => !cat?.archivedAt && !cat?.archived);
}

function getPreferredCurrentCatId(cats, currentCatId = '') {
  const activeCats = getActiveCats(cats);
  if (activeCats.some((cat) => cat.id === currentCatId)) return currentCatId;
  return activeCats.find((cat) => cat.isDefault)?.id || activeCats[0]?.id || '';
}

module.exports = { createLocalCat, getActiveCats, getPreferredCurrentCatId };

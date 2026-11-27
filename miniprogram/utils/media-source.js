const PUBLIC_STATIC_HOSTS = new Set(['api.missmeow.net', 'static.missmeow.net']);

function isRemotePath(path) {
  return /^https?:\/\//i.test(String(path || ''));
}

function isPublicStaticPath(path, assetBaseUrl = '') {
  if (!isRemotePath(path)) return false;
  try {
    const url = new URL(path);
    const configuredHost = assetBaseUrl ? new URL(assetBaseUrl).hostname : '';
    const hostAllowed = PUBLIC_STATIC_HOSTS.has(url.hostname) || url.hostname === configuredHost;
    const pathAllowed = /^\/(?:assets|static)\//i.test(url.pathname);
    return url.protocol === 'https:' && hostAllowed && pathAllowed;
  } catch {
    return false;
  }
}

function remoteExtension(path) {
  const match = String(path || '').match(/\.(jpg|jpeg|png|webp)(?:\?|$)/i);
  return match ? match[1].toLowerCase() : 'jpg';
}

function shouldDownloadSource(path, assetBaseUrl = '') {
  return isRemotePath(path) && !isPublicStaticPath(path, assetBaseUrl);
}

module.exports = { isRemotePath, isPublicStaticPath, remoteExtension, shouldDownloadSource };

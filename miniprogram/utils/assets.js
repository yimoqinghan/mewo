const env = require('../config/env');

const baseUrl = String(env.assetBaseUrl || env.apiBaseUrl || '').replace(/\/$/, '');
const staticBaseUrl = String(env.staticAssetBaseUrl || '').replace(/\/$/, '');

function asset(relativePath) {
  const cleanPath = String(relativePath).replace(/^\/+/, '');
  return staticBaseUrl ? `${staticBaseUrl}/${cleanPath}` : `${baseUrl}/assets/${cleanPath}`;
}

module.exports = { baseUrl, asset };

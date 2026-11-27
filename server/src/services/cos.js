import crypto from 'node:crypto';
import COS from 'cos-nodejs-sdk-v5';
import { config } from '../config.js';
import { errors } from '../lib/errors.js';

let client = null;

function getClient() {
  if (!config.cos.enabled) {
    throw errors.unsupported('未配置 COS，无法读写媒体文件');
  }
  if (!client) {
    client = new COS({ SecretId: config.cos.secretId, SecretKey: config.cos.secretKey });
  }
  return client;
}

function commonParams(extra = {}) {
  return {
    Bucket: config.cos.bucket,
    Region: config.cos.region,
    ...extra
  };
}

/**
 * 客户端直传的预签名 PUT 地址。
 * 这样图片不经过 2C2G 的服务器，既省带宽（月流量只有 200GB），
 * 也避免 Node 进程做大文件转发。
 */
export function signPutUrl({ objectKey, contentType, expires = config.cos.signTtl }) {
  return new Promise((resolve, reject) => {
    getClient().getObjectUrl(
      commonParams({
        Key: objectKey,
        Method: 'PUT',
        Sign: true,
        Expires: expires,
        Headers: { 'Content-Type': contentType }
      }),
      (error, data) => {
        if (error) return reject(errors.upstream(`COS 签名失败：${error.message}`));
        resolve(data.Url);
      }
    );
  });
}

/**
 * 私有桶的临时读取地址。COS 返回的是 http，小程序要求 https，
 * 这里统一强制改写协议，避免真机上图片加载失败。
 */
export function cdnUrl(objectKey) {
  if (!config.cos.cdnDomain) return null;
  return `${config.cos.cdnDomain.replace(/\/$/, '')}/${objectKey}`;
}

export function signGetUrl(objectKey, expires = config.cos.signTtl, query = null) {
  return new Promise((resolve, reject) => {
    getClient().getObjectUrl(
      commonParams({
        Key: objectKey,
        Sign: true,
        Expires: expires,
        ...(query ? { Query: query } : {})
      }),
      (error, data) => {
        if (error) return reject(errors.upstream(`COS 签名失败：${error.message}`));
        resolve(data.Url.replace(/^http:\/\//, 'https://'));
      }
    );
  });
}

export async function putObject({ objectKey, buffer, contentType }) {
  return new Promise((resolve, reject) => {
    getClient().putObject(
      commonParams({ Key: objectKey, Body: buffer, ContentType: contentType }),
      (error, data) => {
        if (error) return reject(errors.upstream(`COS 上传失败：${error.message}`));
        resolve(data);
      }
    );
  });
}

export async function headObject(objectKey) {
  return new Promise((resolve, reject) => {
    getClient().headObject(commonParams({ Key: objectKey }), (error, data) => {
      if (error) return reject(error);
      resolve(data);
    });
  });
}

export async function deleteObject(objectKey) {
  return new Promise((resolve, reject) => {
    getClient().deleteObject(commonParams({ Key: objectKey }), (error, data) => {
      if (error) return reject(errors.upstream(`COS 删除失败：${error.message}`));
      resolve(data);
    });
  });
}

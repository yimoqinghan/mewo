function messageKeys(message) {
  const keys = [];
  if (message && message.id) keys.push(`id:${message.id}`);
  // 本地用户消息的 id 就是发送时生成的 clientMessageId；云端记录则同时有数据库 id 和 clientMessageId。
  const clientMessageId = message && (message.clientMessageId || message.id);
  if (clientMessageId) keys.push(`client:${clientMessageId}`);
  return keys;
}

function messageFingerprint(message) {
  return [message?.role || '', message?.text || '', Number(message?.createdAt) || 0].join('|');
}

function sortMessages(messages = []) {
  return messages
    .map((message, index) => ({ message, index }))
    .sort((left, right) => {
      const timeDiff = (Number(left.message.createdAt) || 0) - (Number(right.message.createdAt) || 0);
      if (timeDiff) return timeDiff;
      // 同一时间戳下，保证一轮对话按“用户先说、喵再答”的顺序展示。
      const roleDiff = (left.message.role === 'user' ? 0 : 1) - (right.message.role === 'user' ? 0 : 1);
      return roleDiff || left.index - right.index;
    })
    .map(({ message }) => message);
}

function mergeMessages(localMessages = [], remoteMessages = []) {
  const merged = [];
  const seenKeys = new Set();
  const seenFingerprints = new Set();

  const add = (message) => {
    if (!message || !message.text) return;
    const keys = messageKeys(message);
    if (keys.some((key) => seenKeys.has(key))) return;
    const fingerprint = messageFingerprint(message);
    if (seenFingerprints.has(fingerprint)) return;
    keys.forEach((key) => seenKeys.add(key));
    seenFingerprints.add(fingerprint);
    merged.push(message);
  };

  // 云端是权威数据；本地只补充尚未同步成功的尾部消息。
  remoteMessages.forEach(add);
  localMessages.forEach(add);
  return sortMessages(merged);
}

module.exports = { mergeMessages, sortMessages };

const textEncoder = new TextEncoder();

const json = (body, init = {}) => {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
  headers.set('access-control-allow-headers', 'content-type, x-line-signature');
  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers
  });
};

const normalizeKey = value =>
  String(value || '')
    .trim()
    .toLowerCase();

const verifyLineSignature = async (body, signature, channelSecret) => {
  if (!signature || !channelSecret) return false;

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(channelSecret),
    {name: 'HMAC', hash: 'SHA-256'},
    false,
    ['sign']
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    textEncoder.encode(body)
  );
  const expected = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return expected === signature;
};

const sendLinePushMessage = async (env, to, message) => {
  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify({
      to,
      messages: [
        {
          type: 'text',
          text: message
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LINE push failed: ${response.status} ${errorText}`);
  }
};

const getStaticUserMap = env => {
  if (!env.LINE_USER_MAP_JSON) return {};

  try {
    return JSON.parse(env.LINE_USER_MAP_JSON);
  } catch {
    return {};
  }
};

const kvKeyUserCode = userCode => `user:${normalizeKey(userCode)}`;
const kvKeyUserId = userId => `line:${String(userId || '').trim()}`;
const kvKeyAuth = userId => `auth:${String(userId || '').trim()}`;
const kvKeySendCooldown = userCode => `send:cooldown:${normalizeKey(userCode)}`;
const kvKeySendWindow = (userCode, windowId) =>
  `send:window:${normalizeKey(userCode)}:${windowId}`;
const SEND_COOLDOWN_SECONDS = 3;
const SEND_WINDOW_SECONDS = 600;
const SEND_WINDOW_LIMIT = 20;

const getUserIdByKey = async (env, userKey) => {
  const key = normalizeKey(userKey);
  if (!key) return null;

  if (env.LINE_USER_MAP) {
    return env.LINE_USER_MAP.get(kvKeyUserCode(key));
  }

  const map = getStaticUserMap(env);
  return map[key] || null;
};

const setUserIdByKey = async (env, userKey, userId) => {
  if (!env.LINE_USER_MAP) return false;
  await env.LINE_USER_MAP.put(kvKeyUserCode(userKey), userId);
  return true;
};

const getPendingAuth = async (env, userId) => {
  if (!env.LINE_USER_MAP) return null;
  return env.LINE_USER_MAP.get(kvKeyAuth(userId));
};

const setPendingAuth = async (env, userId) => {
  if (!env.LINE_USER_MAP) return false;
  await env.LINE_USER_MAP.put(kvKeyAuth(userId), String(Date.now()), {
    expirationTtl: 600
  });
  return true;
};

const clearPendingAuth = async (env, userId) => {
  if (!env.LINE_USER_MAP) return false;
  await env.LINE_USER_MAP.delete(kvKeyAuth(userId));
  return true;
};

const checkSendRateLimit = async (env, userCode) => {
  if (!env.LINE_USER_MAP) {
    return {ok: true};
  }

  const cooldownKey = kvKeySendCooldown(userCode);
  const cooldown = await env.LINE_USER_MAP.get(cooldownKey);
  if (cooldown) {
    return {
      ok: false,
      message: `送信間隔が短すぎます。${SEND_COOLDOWN_SECONDS}秒ほど待ってから再送してください。`
    };
  }

  const windowId = Math.floor(Date.now() / (SEND_WINDOW_SECONDS * 1000));
  const windowKey = kvKeySendWindow(userCode, windowId);
  const currentCount = Number(await env.LINE_USER_MAP.get(windowKey)) || 0;
  if (currentCount >= SEND_WINDOW_LIMIT) {
    return {
      ok: false,
      message: `送信回数が上限に達しました。${Math.floor(SEND_WINDOW_SECONDS / 60)}分ほど待ってから再送してください。`
    };
  }

  await env.LINE_USER_MAP.put(cooldownKey, '1', {
    expirationTtl: SEND_COOLDOWN_SECONDS
  });
  await env.LINE_USER_MAP.put(windowKey, String(currentCount + 1), {
    expirationTtl: SEND_WINDOW_SECONDS
  });

  return {ok: true};
};

const getUserCodeByUserId = async (env, userId) => {
  if (!env.LINE_USER_MAP) return null;
  return env.LINE_USER_MAP.get(kvKeyUserId(userId));
};

const setUserRegistration = async (env, userCode, userId) => {
  if (!env.LINE_USER_MAP) return false;
  const normalizedCode = normalizeKey(userCode);
  const existingCode = await getUserCodeByUserId(env, userId);

  if (existingCode && existingCode !== normalizedCode) {
    await env.LINE_USER_MAP.delete(kvKeyUserCode(existingCode));
  }

  await env.LINE_USER_MAP.put(kvKeyUserCode(normalizedCode), userId);
  await env.LINE_USER_MAP.put(kvKeyUserId(userId), normalizedCode);
  return true;
};

const handlePasswordMessage = async (env, event, text) => {
  const userId = event.source?.userId;
  if (!userId) {
    return {
      handled: true,
      replyText: 'userId を取得できませんでした。1対1トークで試してください。'
    };
  }

  const match = text.match(/^登録\s+(\S+)$/);
  if (!match) {
    return {handled: false};
  }

  const classPassword = match[1];
  if (classPassword !== env.XCRATCH_CLASS_PASSWORD) {
    return {
      handled: true,
      replyText: '利用パスワードが違います。もう一度「登録 共通パスワード」を送ってください。'
    };
  }

  await setPendingAuth(env, userId);
  return {
    handled: true,
    replyText: 'パスワードを確認しました。続けて「利用コード あなたのコード」を送ってください。'
  };
};

const handleUserCodeMessage = async (env, event, text) => {
  const userId = event.source?.userId;
  if (!userId) {
    return {
      handled: true,
      replyText: 'userId を取得できませんでした。1対1トークで試してください。'
    };
  }

  const match = text.match(/^利用コード\s+([a-zA-Z0-9_-]{4,64})$/);
  if (!match) {
    return {handled: false};
  }

  const pendingAuth = await getPendingAuth(env, userId);
  if (!pendingAuth) {
    return {
      handled: true,
      replyText: '先に「登録 共通パスワード」を送ってください。'
    };
  }

  const userKey = match[1];
  const currentUserId = await getUserIdByKey(env, userKey);
  if (currentUserId && currentUserId !== userId) {
    return {
      handled: true,
      replyText: `この利用コードは使用中です: ${userKey}。使われていない別の利用コードを送ってください。`
    };
  }

  await setUserRegistration(env, userKey, userId);
  await clearPendingAuth(env, userId);
  return {
    handled: true,
    replyText: `登録しました: ${userKey}`
  };
};

const handleRegisterMessage = async (env, event) => {
  const text = String(event.message?.text || '').trim();

  if (text === '登録') {
    return {
      handled: true,
      replyText: '「登録 共通パスワード」を送ると確認できます。確認後に「利用コード あなたのコード」を送ってください。'
    };
  }

  if (text === '利用コード') {
    return {
      handled: true,
      replyText: '「利用コード あなたのコード」の形で送ってください。'
    };
  }

  const passwordResult = await handlePasswordMessage(env, event, text);
  if (passwordResult.handled) {
    return passwordResult;
  }

  const userCodeResult = await handleUserCodeMessage(env, event, text);
  if (userCodeResult.handled) {
    return userCodeResult;
  }

  return {
    handled: false
  };
};

const replyToLine = async (env, replyToken, text) => {
  if (!replyToken || !text) return;

  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify({
      replyToken,
      messages: [
        {
          type: 'text',
          text
        }
      ]
    })
  });
};

const handleLineWebhook = async (request, env) => {
  const body = await request.text();
  const signature = request.headers.get('x-line-signature');
  const isVerified = await verifyLineSignature(
    body,
    signature,
    env.LINE_CHANNEL_SECRET
  );

  if (!isVerified) {
    return json({ok: false, message: 'invalid signature'}, {status: 401});
  }

  const payload = JSON.parse(body);
  for (const event of payload.events || []) {
    if (event.type !== 'message' || event.message?.type !== 'text') continue;

    const result = await handleRegisterMessage(env, event);
    if (result.handled) {
      await replyToLine(env, event.replyToken, result.replyText);
    }
  }

  return json({ok: true});
};

const handleSend = async request => {
  const payload = await request.json().catch(() => null);
  if (!payload) {
    return json({ok: false, message: 'invalid json'}, {status: 400});
  }

  return payload;
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return json({ok: true});
    }

    if (request.method === 'GET' && url.pathname === '/') {
      return json({
        ok: true,
        service: 'xcratch-line-webhook',
        endpoints: ['/api/send', '/api/line/webhook']
      });
    }

    if (request.method === 'POST' && url.pathname === '/api/line/webhook') {
      return handleLineWebhook(request, env);
    }

    if (request.method === 'POST' && url.pathname === '/api/send') {
      const payload = await handleSend(request);
      if (payload instanceof Response) {
        return payload;
      }

      if (payload.classPassword !== env.XCRATCH_CLASS_PASSWORD) {
        return json({ok: false, message: 'forbidden'}, {status: 403});
      }

      const message = String(payload.message || '').trim();
      const userKey = normalizeKey(payload.userCode);
      if (!message || !userKey) {
        return json(
          {ok: false, message: 'message and userCode are required'},
          {status: 400}
        );
      }

      const userId = await getUserIdByKey(env, userKey);
      if (!userId) {
        return json(
          {
            ok: false,
            message: `userKey "${userKey}" is not registered`
          },
          {status: 404}
        );
      }

      const rateLimit = await checkSendRateLimit(env, userKey);
      if (!rateLimit.ok) {
        return json({ok: false, message: rateLimit.message}, {status: 429});
      }

      await sendLinePushMessage(env, userId, message);
      return json({ok: true, message: 'sent'});
    }

    return json({ok: false, message: 'not found'}, {status: 404});
  }
};

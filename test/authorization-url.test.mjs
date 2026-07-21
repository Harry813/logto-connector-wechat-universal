import assert from 'node:assert/strict';
import { test } from 'node:test';

import createConnector, { metadata } from '../lib/index.js';

const config = {
  officialAccountAppId: 'wx-official',
  officialAccountAppSecret: 'official-secret',
  websiteAppId: 'wx-website',
  websiteAppSecret: 'website-secret',
  officialScope: 'snsapi_userinfo',
  mobileFallbackUrl: 'https://example.com/open-in-wechat',
};

const createTestConnector = async () =>
  createConnector({
    getConfig: async () => config,
  });

test('exposes a Zod-compatible config guard', async () => {
  const { configGuard } = await createTestConnector();
  assert.equal(typeof configGuard.parse, 'function');
  assert.deepEqual(configGuard.parse(config), config);
});

test('rejects non-HTTPS mobile fallback URLs', async () => {
  const { configGuard } = await createTestConnector();
  const result = configGuard.safeParse({
    ...config,
    mobileFallbackUrl: 'http://example.com/open-in-wechat',
  });

  assert.equal(result.success, false);
});

test('rejects unsupported Official Account scopes', async () => {
  const { configGuard } = await createTestConnector();
  const result = configGuard.safeParse({
    ...config,
    officialScope: 'snsapi_unsupported',
  });

  assert.equal(result.success, false);
});

test('marks WeChat AppSecrets as confidential form fields', () => {
  const secretKeys = new Set(['officialAccountAppSecret', 'websiteAppSecret']);
  const secretItems = metadata.formItems.filter(({ key }) => secretKeys.has(key));

  assert.equal(secretItems.length, 2);
  assert.ok(secretItems.every(({ isConfidential }) => isConfidential === true));
});

test('uses WeChat H5 OAuth when user agent is WeChat browser', async () => {
  const connector = await createTestConnector();
  let connectorSession;
  const uri = await connector.getAuthorizationUri(
    {
      state: 'state-1',
      redirectUri: 'https://auth.example.com/callback',
      connectorId: 'wechat-universal',
      connectorFactoryId: 'wechat-universal',
      jti: 'jti-1',
      headers: {
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) MicroMessenger/8.0.50',
      },
    },
    async (session) => {
      connectorSession = session;
    }
  );

  const url = new URL(uri.replace('#wechat_redirect', ''));
  assert.equal(url.origin + url.pathname, 'https://open.weixin.qq.com/connect/oauth2/authorize');
  assert.equal(url.searchParams.get('appid'), 'wx-official');
  assert.equal(url.searchParams.get('scope'), 'snsapi_userinfo');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('state'), 'state-1');
  assert.ok(uri.endsWith('#wechat_redirect'));
  assert.deepEqual(connectorSession, {
    nonce: 'wechat-universal:official_account_h5',
  });
});

test('uses Official Account credentials from the persisted H5 session', async () => {
  const connector = await createTestConnector();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    const endpoint = new URL(url);

    if (endpoint.pathname === '/sns/oauth2/access_token') {
      assert.equal(endpoint.searchParams.get('appid'), 'wx-official');
      assert.equal(endpoint.searchParams.get('secret'), 'official-secret');
      return new Response(
        JSON.stringify({
          access_token: 'access-token',
          openid: 'official-openid',
          unionid: 'shared-unionid',
          scope: 'snsapi_userinfo',
        }),
        { status: 200 }
      );
    }

    if (endpoint.pathname === '/sns/userinfo') {
      return new Response(
        JSON.stringify({
          openid: 'official-openid',
          unionid: 'shared-unionid',
          nickname: 'Test User',
        }),
        { status: 200 }
      );
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const user = await connector.getUserInfo({ code: 'auth-code' }, async () => ({
      nonce: 'wechat-universal:official_account_h5',
    }));
    assert.equal(user.id, 'shared-unionid');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uses website QR OAuth for desktop browsers', async () => {
  const connector = await createTestConnector();
  const uri = await connector.getAuthorizationUri(
    {
      state: 'state-2',
      redirectUri: 'https://auth.example.com/callback',
      connectorId: 'wechat-universal',
      connectorFactoryId: 'wechat-universal',
      jti: 'jti-2',
      headers: {
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Safari/605.1.15',
      },
    },
    async () => {}
  );

  const url = new URL(uri.replace('#wechat_redirect', ''));
  assert.equal(url.origin + url.pathname, 'https://open.weixin.qq.com/connect/qrconnect');
  assert.equal(url.searchParams.get('appid'), 'wx-website');
  assert.equal(url.searchParams.get('scope'), 'snsapi_login');
  assert.equal(url.searchParams.get('state'), 'state-2');
  assert.ok(uri.endsWith('#wechat_redirect'));
});

test('uses fallback page for mobile browsers outside WeChat', async () => {
  const connector = await createTestConnector();
  const uri = await connector.getAuthorizationUri(
    {
      state: 'state-3',
      redirectUri: 'https://auth.example.com/callback',
      connectorId: 'wechat-universal',
      connectorFactoryId: 'wechat-universal',
      jti: 'jti-3',
      headers: {
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      },
    },
    async () => {}
  );

  const url = new URL(uri);
  assert.equal(url.origin + url.pathname, 'https://example.com/open-in-wechat');
  assert.equal(url.searchParams.get('state'), 'state-3');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://auth.example.com/callback');
});

test('rejects WeChat sign-in when OAuth response does not include unionid', async () => {
  const connector = await createTestConnector();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    const endpoint = new URL(url);

    if (endpoint.pathname === '/sns/oauth2/access_token') {
      return new Response(
        JSON.stringify({
          access_token: 'access-token',
          openid: 'official-openid',
          scope: 'snsapi_userinfo',
        }),
        { status: 200 }
      );
    }

    if (endpoint.pathname === '/sns/userinfo') {
      return new Response(
        JSON.stringify({
          openid: 'official-openid',
          nickname: 'No UnionID',
          headimgurl: 'https://example.com/avatar.png',
        }),
        { status: 200 }
      );
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    await assert.rejects(
      connector.getUserInfo({ code: 'auth-code' }, async () => ({
        nonce: 'wechat-universal:official_account_h5',
      })),
      /unionid/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects snsapi_base sign-in when the token response has no unionid', async () => {
  const connector = await createConnector({
    getConfig: async () => ({
      ...config,
      officialScope: 'snsapi_base',
    }),
  });
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;

  globalThis.fetch = async (url) => {
    fetchCount += 1;
    const endpoint = new URL(url);
    assert.equal(endpoint.pathname, '/sns/oauth2/access_token');
    return new Response(
      JSON.stringify({
        access_token: 'access-token',
        openid: 'official-openid',
        scope: 'snsapi_base',
      }),
      { status: 200 }
    );
  };

  try {
    await assert.rejects(
      connector.getUserInfo({ code: 'auth-code' }, async () => ({
        nonce: 'wechat-universal:official_account_h5',
      })),
      /unionid/
    );
    assert.equal(fetchCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('does not expose WeChat profile data when unionid is missing', async () => {
  const connector = await createTestConnector();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    const endpoint = new URL(url);

    if (endpoint.pathname === '/sns/oauth2/access_token') {
      return new Response(
        JSON.stringify({
          access_token: 'access-token',
          openid: 'sensitive-openid',
          scope: 'snsapi_userinfo',
        }),
        { status: 200 }
      );
    }

    if (endpoint.pathname === '/sns/userinfo') {
      return new Response(
        JSON.stringify({
          openid: 'sensitive-openid',
          nickname: 'Sensitive Nickname',
          headimgurl: 'https://private.example/avatar.png',
        }),
        { status: 200 }
      );
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    await assert.rejects(
      connector.getUserInfo({ code: 'auth-code' }, async () => ({
        nonce: 'wechat-universal:official_account_h5',
      })),
      (error) => {
        assert.match(error.message, /unionid/);
        assert.doesNotMatch(error.message, /sensitive-openid/);
        assert.doesNotMatch(error.message, /Sensitive Nickname/);
        assert.doesNotMatch(error.message, /private\.example/);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('does not expose an invalid OAuth callback payload', async () => {
  const connector = await createTestConnector();

  await assert.rejects(
    connector.getUserInfo({ code: 123, state: 'sensitive-state' }),
    (error) => {
      assert.match(error.message, /Invalid WeChat authorization callback/);
      assert.doesNotMatch(error.message, /sensitive-state/);
      return true;
    }
  );
});

test('does not expose access tokens from malformed WeChat responses', async () => {
  const connector = await createTestConnector();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ access_token: 'sensitive-access-token' }), { status: 200 });

  try {
    await assert.rejects(
      connector.getUserInfo({ code: 'auth-code' }, async () => ({
        nonce: 'wechat-universal:official_account_h5',
      })),
      (error) => {
        assert.match(error.message, /Invalid WeChat access token response/);
        assert.doesNotMatch(error.message, /sensitive-access-token/);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('does not expose response bodies from WeChat HTTP errors', async () => {
  const connector = await createTestConnector();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ access_token: 'sensitive-http-token' }), { status: 401 });

  try {
    await assert.rejects(
      connector.getUserInfo({ code: 'auth-code' }, async () => ({
        nonce: 'wechat-universal:official_account_h5',
      })),
      (error) => {
        assert.match(error.message, /WeChat HTTP 401/);
        assert.doesNotMatch(error.message, /sensitive-http-token/);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

import { z } from 'zod';

const metadata = {
  id: 'wechat-universal',
  target: 'wechat',
  platform: 'Universal',
  name: {
    en: 'WeChat Universal',
    'zh-CN': '微信实验版',
  },
  logo: './logo.svg',
  logoDark: null,
  description: {
    en: 'Routes WeChat sign-in between Official Account H5 OAuth and Website QR OAuth.',
    'zh-CN': '按 UA 在微信公众号 H5 授权和网站扫码登录之间分流。',
  },
  readme: './README.md',
  formItems: [
    {
      key: 'officialAccountAppId',
      label: 'Official Account App ID',
      required: true,
      type: 'Text',
      placeholder: '<official-account-app-id>',
    },
    {
      key: 'officialAccountAppSecret',
      label: 'Official Account App Secret',
      required: true,
      type: 'Text',
      isConfidential: true,
      placeholder: '<official-account-app-secret>',
    },
    {
      key: 'websiteAppId',
      label: 'Website App ID',
      required: true,
      type: 'Text',
      placeholder: '<website-app-id>',
    },
    {
      key: 'websiteAppSecret',
      label: 'Website App Secret',
      required: true,
      type: 'Text',
      isConfidential: true,
      placeholder: '<website-app-secret>',
    },
    {
      key: 'officialScope',
      label: 'Official Account Scope',
      required: false,
      type: 'Select',
      defaultValue: 'snsapi_userinfo',
      selectItems: [
        { value: 'snsapi_userinfo', title: 'snsapi_userinfo' },
        { value: 'snsapi_base', title: 'snsapi_base' },
      ],
      description:
        'Use snsapi_base only when the token response contains unionid; otherwise sign-in is rejected.',
    },
    {
      key: 'mobileFallbackUrl',
      label: 'Mobile Fallback URL',
      required: false,
      type: 'Text',
      placeholder: 'https://example.com/open-in-wechat',
    },
  ],
};

const websiteAuthorizationEndpoint = 'https://open.weixin.qq.com/connect/qrconnect';
const officialAuthorizationEndpoint = 'https://open.weixin.qq.com/connect/oauth2/authorize';
const accessTokenEndpoint = 'https://api.weixin.qq.com/sns/oauth2/access_token';
const userInfoEndpoint = 'https://api.weixin.qq.com/sns/userinfo';
const defaultTimeout = 5000;
const officialAccountSessionNonce = `${metadata.id}:official_account_h5`;

const officialScopeGuard = z.enum(['snsapi_userinfo', 'snsapi_base']);
const httpsUrlGuard = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === 'https:', 'mobileFallbackUrl must use HTTPS.');

const configGuard = z.object({
  officialAccountAppId: z.string().trim().min(1),
  officialAccountAppSecret: z.string().trim().min(1),
  websiteAppId: z.string().trim().min(1),
  websiteAppSecret: z.string().trim().min(1),
  officialScope: officialScopeGuard.optional(),
  mobileFallbackUrl: httpsUrlGuard.optional(),
});

const assertConfig = (config) => {
  const result = configGuard.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid WeChat universal connector config: ${JSON.stringify(result.error)}`);
  }
  return result.data;
};

const isWechatBrowser = (userAgent = '') => /MicroMessenger/i.test(userAgent);
const isMobileBrowser = (userAgent = '') =>
  /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(userAgent);

const appendWechatRedirect = (url) => `${url}#wechat_redirect`;

const createAuthorizationUrl = (endpoint, parameters) => {
  const query = new URLSearchParams(parameters);
  return appendWechatRedirect(`${endpoint}?${query.toString()}`);
};

const createFallbackUrl = (fallbackUrl, state, redirectUri) => {
  const url = new URL(fallbackUrl);
  url.searchParams.set('state', state);
  url.searchParams.set('redirect_uri', redirectUri);
  return url.toString();
};

const resolveMode = (userAgent, config) => {
  if (isWechatBrowser(userAgent)) {
    return 'official_account_h5';
  }

  if (isMobileBrowser(userAgent) && config.mobileFallbackUrl) {
    return 'mobile_external_fallback';
  }

  return 'website_qr';
};

const getAuthorizationUri =
  (getConfig) =>
  async ({ state, redirectUri, headers = {}, scope: customScope }, setSession = async () => {}) => {
    const config = assertConfig(await getConfig(metadata.id));
    const mode = resolveMode(headers.userAgent, config);

    await setSession({
      nonce: mode === 'official_account_h5' ? officialAccountSessionNonce : `${metadata.id}:${mode}`,
    });

    if (mode === 'official_account_h5') {
      return createAuthorizationUrl(officialAuthorizationEndpoint, {
        appid: config.officialAccountAppId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: officialScopeGuard.parse(customScope ?? config.officialScope ?? 'snsapi_userinfo'),
        state,
      });
    }

    if (mode === 'mobile_external_fallback') {
      return createFallbackUrl(config.mobileFallbackUrl, state, redirectUri);
    }

    return createAuthorizationUrl(websiteAuthorizationEndpoint, {
      appid: config.websiteAppId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'snsapi_login',
      state,
    });
  };

const parseCallback = (data) => {
  if (!data || typeof data !== 'object' || typeof data.code !== 'string') {
    throw new Error('Invalid WeChat authorization callback.');
  }

  return data.code;
};

const fetchJson = async (url, searchParams) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), defaultTimeout);

  try {
    const endpoint = new URL(url);
    for (const [key, value] of Object.entries(searchParams)) {
      endpoint.searchParams.set(key, value);
    }

    const response = await fetch(endpoint, { signal: controller.signal });
    const rawText = await response.text();
    const data = JSON.parse(rawText);

    if (!response.ok) {
      throw new Error(`WeChat HTTP ${response.status}.`);
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
};

const getModeConfig = (mode, config) =>
  mode === 'official_account_h5'
    ? {
        appId: config.officialAccountAppId,
        appSecret: config.officialAccountAppSecret,
        scope: config.officialScope ?? 'snsapi_userinfo',
      }
    : {
        appId: config.websiteAppId,
        appSecret: config.websiteAppSecret,
        scope: 'snsapi_login',
      };

const assertWechatSuccess = (data, phase) => {
  if (data.errcode) {
    throw new Error(`WeChat ${phase} failed: ${data.errcode} ${data.errmsg ?? ''}`.trim());
  }
};

const getTokenResponse = async (code, modeConfig) => {
  const data = await fetchJson(accessTokenEndpoint, {
    appid: modeConfig.appId,
    secret: modeConfig.appSecret,
    code,
    grant_type: 'authorization_code',
  });

  assertWechatSuccess(data, 'access token');

  if (typeof data.access_token !== 'string' || typeof data.openid !== 'string') {
    throw new Error('Invalid WeChat access token response.');
  }

  return data;
};

const getWechatUserInfo = async (tokenResponse, modeConfig) => {
  if (modeConfig.scope === 'snsapi_base') {
    return tokenResponse;
  }

  const data = await fetchJson(userInfoEndpoint, {
    access_token: tokenResponse.access_token,
    openid: tokenResponse.openid,
    lang: 'zh_CN',
  });

  assertWechatSuccess(data, 'userinfo');
  return data;
};

const normalizeUserInfo = (tokenResponse, userInfo) => {
  const id = userInfo.unionid ?? tokenResponse.unionid;

  if (!id) {
    throw new Error(
      'WeChat response does not include unionid. Make sure the Official Account and Website App are bound to the same WeChat Open Platform account.'
    );
  }

  return {
    id,
    avatar: userInfo.headimgurl,
    name: userInfo.nickname,
    rawData: {
      token: {
        openid: tokenResponse.openid,
        unionid: tokenResponse.unionid,
        scope: tokenResponse.scope,
        expires_in: tokenResponse.expires_in,
      },
      userInfo,
    },
  };
};

const getUserInfo =
  (getConfig) =>
  async (data, getSession = async () => ({})) => {
    const code = parseCallback(data);
    const config = assertConfig(await getConfig(metadata.id));
    const session = await getSession();
    const mode = session.nonce === officialAccountSessionNonce ? 'official_account_h5' : 'website_qr';
    const modeConfig = getModeConfig(mode, config);
    const tokenResponse = await getTokenResponse(code, modeConfig);
    const userInfo = await getWechatUserInfo(tokenResponse, modeConfig);

    return normalizeUserInfo(tokenResponse, userInfo);
  };

const createWechatUniversalConnector = async ({ getConfig }) => ({
  metadata,
  type: 'Social',
  configGuard,
  getAuthorizationUri: getAuthorizationUri(getConfig),
  getUserInfo: getUserInfo(getConfig),
});

export { configGuard, metadata, createAuthorizationUrl, resolveMode };
export default createWechatUniversalConnector;

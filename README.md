# Logto WeChat Universal Connector

[简体中文](./README.zh-CN.md)

An **unofficial and experimental** social connector for self-hosted Logto. It routes sign-in between WeChat Official Account H5 OAuth and WeChat Website Application QR OAuth while using `unionid` as the only Logto social identity ID.

> This project is not affiliated with or endorsed by Logto, Tencent, or WeChat. Do not use it without reviewing the source and validating it in your own environment.

## Why this connector exists

Logto provides separate official connectors for WeChat Web and WeChat Native. Some self-hosted deployments need one sign-in entry that behaves differently by browser context:

- WeChat in-app browser: Official Account H5 OAuth.
- Desktop browser: Website Application QR OAuth.
- Mobile browser outside WeChat: redirect to an optional guidance or fallback page.

The connector deliberately rejects authentication if WeChat does not return `unionid`. Falling back to `openid` can create separate Logto users for the same person across an Official Account and a Website Application.

## Status

This repository is an alpha community project. It has unit coverage for routing and UnionID enforcement, but it is not an official Logto connector and carries no compatibility or availability guarantee.

## Prerequisites

- A self-hosted Logto deployment that supports third-party connectors.
- A verified WeChat Official Account with web authorization enabled.
- A WeChat Website Application.
- Both applications bound to the same WeChat Open Platform account so that they can return the same `unionid`.
- The Logto callback domain configured as an allowed WeChat web authorization domain.

## Installation from source

Clone this repository into Logto's connector packages directory:

```bash
git clone https://github.com/Harry813/logto-connector-wechat-universal.git \
  packages/connectors/connector-wechat-universal
npm run cli connector link
```

Restart Logto after linking. The exact commands depend on how your Logto deployment is built. See the [official Logto connector documentation](https://docs.logto.io/logto-oss/develop-your-connector) and review [`examples/Dockerfile`](./examples/Dockerfile) for a container-image outline.

## Configuration

Create the **WeChat Universal** connector in the Logto Admin Console and provide:

| Field | Required | Description |
| --- | --- | --- |
| `officialAccountAppId` | Yes | WeChat Official Account AppID |
| `officialAccountAppSecret` | Yes | WeChat Official Account AppSecret |
| `websiteAppId` | Yes | WeChat Website Application AppID |
| `websiteAppSecret` | Yes | WeChat Website Application AppSecret |
| `officialScope` | No | `snsapi_userinfo` by default; `snsapi_base` is supported only when the token response contains `unionid` |
| `mobileFallbackUrl` | No | HTTPS page shown to mobile browsers outside WeChat |

Never commit real AppIDs or AppSecrets. Store them only through Logto's connector configuration.

## Identity behavior

The returned Logto identity ID is:

```text
userInfo.unionid ?? tokenResponse.unionid
```

If neither response contains `unionid`, sign-in fails. There is intentionally no `openid` fallback.

## Security and privacy

- OAuth credentials are sent only to WeChat's official token endpoint.
- Access tokens are not returned in connector `rawData`. The remaining `rawData` is stored by Logto and includes `openid`, `unionid`, scope, expiry metadata, nickname, avatar URL, and the WeChat user-info response; operators must treat it as personal data.
- Missing-UnionID errors do not include `openid`, nickname, avatar URL, or the raw WeChat profile.
- User-agent routing is a convenience mechanism, not a security boundary.
- Review the compiled connector before deployment, as recommended by Logto for every third-party connector.

Report vulnerabilities according to [`SECURITY.md`](./SECURITY.md).

## Development

The current implementation uses only platform APIs at runtime. Run the tests with Node.js 22.14 or a later Node.js 22 release, matching Logto v1.41.0's connector runtime:

```bash
npm test
```

## License

Mozilla Public License 2.0. See [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).

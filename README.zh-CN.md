# Logto 微信 Universal Connector

[English](./README.md)

这是一个面向自托管 Logto 的**非官方实验性**微信社交登录 Connector。它会根据浏览器环境，在微信公众号 H5 网页授权与微信网站应用扫码授权之间分流，并且只使用 `unionid` 作为 Logto 社交身份 ID。

> 本项目与 Logto、腾讯或微信没有隶属或官方合作关系。部署前请自行审查源码，并在自己的环境中完成验证。

## 使用场景

- 微信内置浏览器：使用公众号 H5 OAuth。
- 桌面浏览器：使用网站应用二维码 OAuth。
- 微信外的手机浏览器：可跳转到配置的引导页。

如果微信没有返回 `unionid`，Connector 会拒绝登录。它不会降级使用 `openid`，因为同一个自然人在公众号和网站应用下可能拥有不同的 `openid`，降级会导致 Logto 创建重复用户。

## 当前状态

这是 Alpha 阶段的社区项目，不是 Logto 官方 Connector。现有单元测试覆盖了授权分流与 UnionID 强制规则，但不承诺适配所有 Logto 版本或微信账号配置。

## 前置条件

- 支持第三方 Connector 的自托管 Logto。
- 已开通网页授权能力的认证微信公众号。
- 微信网站应用。
- 公众号和网站应用绑定在同一个微信开放平台账号下，以便返回一致的 `unionid`。
- 已将 Logto 回调域名配置为微信网页授权域名。

## 从源码安装

将仓库克隆到 Logto 的 Connector 目录：

```bash
git clone https://github.com/Harry813/logto-connector-wechat-universal.git \
  packages/connectors/connector-wechat-universal
npm run cli connector link
```

完成链接后重启 Logto。不同部署方式的构建命令可能不同，请参考 [Logto 官方 Connector 开发文档](https://docs.logto.io/logto-oss/develop-your-connector) 和 [`examples/Dockerfile`](./examples/Dockerfile)。

## 配置项

在 Logto Admin Console 中创建 **WeChat Universal** Connector：

| 配置项 | 必填 | 说明 |
| --- | --- | --- |
| `officialAccountAppId` | 是 | 微信公众号 AppID |
| `officialAccountAppSecret` | 是 | 微信公众号 AppSecret |
| `websiteAppId` | 是 | 微信网站应用 AppID |
| `websiteAppSecret` | 是 | 微信网站应用 AppSecret |
| `officialScope` | 否 | 默认 `snsapi_userinfo`；只有 token 响应含 `unionid` 时才能使用 `snsapi_base` |
| `mobileFallbackUrl` | 否 | 微信外手机浏览器打开的 HTTPS 引导页 |

不要把真实 AppID 或 AppSecret 提交到代码仓库，只通过 Logto Connector 配置保存。

## 身份规则

Connector 返回给 Logto 的身份 ID 为：

```text
userInfo.unionid ?? tokenResponse.unionid
```

两处都没有 `unionid` 时登录失败，不提供 `openid` fallback。

## 安全与隐私

- OAuth 凭据只发送到微信官方 token 接口。
- Connector 的 `rawData` 不保存 access token；其余 `rawData` 会由 Logto 存储，包含 `openid`、`unionid`、scope、过期信息、昵称、头像地址和微信用户资料响应，运营方必须按个人信息进行保护。
- 缺少 UnionID 的异常不会输出 `openid`、昵称、头像地址或完整微信用户资料。
- User-Agent 分流只是交互便利机制，不是安全边界。
- 按照 Logto 对第三方 Connector 的建议，部署前应审查实际执行代码。

安全问题请按照 [`SECURITY.md`](./SECURITY.md) 私下报告。

## 开发与测试

使用 Node.js 22.14 或更新的 Node.js 22 版本，与 Logto v1.41.0 的 Connector 运行时保持一致：

```bash
npm test
```

## 许可证

Mozilla Public License 2.0，详见 [`LICENSE`](./LICENSE) 和 [`NOTICE`](./NOTICE)。

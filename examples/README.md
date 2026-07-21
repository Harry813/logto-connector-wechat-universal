# Container image example

The example Dockerfile illustrates the connector layout only. Build it from the repository root and always pin a Logto version you have tested:

```bash
docker build \
  --build-arg LOGTO_VERSION=<tested-logto-version> \
  -f examples/Dockerfile \
  -t logto-with-wechat-universal:local .
```

Do not put connector credentials in the image, Dockerfile, build arguments, or repository. Configure AppIDs and AppSecrets in the Logto Admin Console after deployment.

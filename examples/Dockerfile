# Replace this tag with the exact Logto version validated by your deployment.
ARG LOGTO_VERSION
FROM ghcr.io/logto-io/logto:${LOGTO_VERSION}

COPY . /etc/logto/packages/connectors/connector-wechat-universal

WORKDIR /etc/logto
RUN npm run cli connector link

FROM node:12-alpine
ARG CODEARTIFACT_AUTH_TOKEN

COPY . /app
WORKDIR /app
RUN  apk --no-cache add tzdata && \
  cp /usr/share/zoneinfo/Asia/Seoul /etc/localtime && \
  echo "Asia/Seoul" > /etc/timezone && \
  yarn --prod=false && \
  yarn build && \
  yarn --prod=true && \
  rm -rf src && \
  rm -rf .npmrc

CMD yarn start
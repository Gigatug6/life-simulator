FROM node:24-bookworm-slim
ARG HOST_UID=1000
ARG HOST_GID=1000
RUN groupmod -o -g ${HOST_GID} node \
 && usermod -o -u ${HOST_UID} -g ${HOST_GID} node \
 && mkdir -p /app/node_modules && chown -R node:node /app
USER node
WORKDIR /app

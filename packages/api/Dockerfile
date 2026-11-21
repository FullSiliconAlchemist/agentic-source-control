ARG NODE_VERSION=24.22.3

FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/api/package.json packages/api/package.json
RUN pnpm install --frozen-lockfile --filter @quickstart-template/api...

FROM deps AS build
COPY packages/api packages/api
RUN pnpm --filter @quickstart-template/api build

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/api/package.json packages/api/package.json
RUN pnpm install --prod --frozen-lockfile --filter @quickstart-template/api...

FROM node:${NODE_VERSION}-alpine AS runner
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app/packages/api

COPY --chown=node:node --from=prod-deps /app/node_modules /app/node_modules
COPY --chown=node:node --from=prod-deps /app/packages/api/node_modules /app/packages/api/node_modules
COPY --chown=node:node --from=prod-deps /app/packages/api/package.json /app/packages/api/package.json
COPY --chown=node:node --from=build /app/packages/api/dist /app/packages/api/dist

ENTRYPOINT ["docker-entrypoint.sh"]
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]

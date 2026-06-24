FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PATH"
RUN corepack enable
RUN pnpm config --global set store-dir /pnpm-store

FROM base AS build
COPY . /usr/src/app
WORKDIR /usr/src/app
RUN pnpm install --frozen-lockfile
RUN pnpm --filter=proxy build
RUN pnpm deploy --filter=proxy --prod /prod/proxy

FROM base AS proxy
COPY --from=build /prod/proxy /prod/proxy
WORKDIR /prod/proxy
EXPOSE 3000
CMD ["node", "dist/index.js"]

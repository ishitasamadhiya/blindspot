# Blindspot: web + API in one container. Build: docker build -t blindspot .   Run: docker run -p 4040:4040 blindspot
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY video/package.json video/
RUN npm ci --no-audit --no-fund --omit=optional
COPY . .
RUN npm run build -w apps/web

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production BLINDSPOT_DB=/data/blindspot.sqlite PORT=4040
COPY --from=build /app /app
VOLUME ["/data"]
EXPOSE 4040
CMD ["npx", "tsx", "apps/server/src/main.ts"]

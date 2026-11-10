FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci

COPY client/ ./client/
RUN npm run build -w client

COPY server/ ./server/
RUN npm run build -w server

FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci --omit=dev

COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "server/dist/index.js"]

FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY public ./public
RUN npm run build


FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/public ./public
COPY --chown=node:node .env.example ./.env.example

RUN mkdir -p /app/data /app/uploads/question-media \
  && chown -R node:node /app

EXPOSE 5050

USER node

CMD ["node", "dist/index.js"]

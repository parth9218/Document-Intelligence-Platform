FROM node:22-alpine AS builder

ARG ENVIRONMENT=dev

WORKDIR /app
RUN apk add --no-cache openssl wget
RUN wget https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -O /app/global-bundle.pem
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN if [ "$ENVIRONMENT" = "prod" ]; then \
  echo "{}" > /app/swagger.json; \
  npm uninstall swagger-ui-express; \
  else \
  SWAGGER_OUT=/app/swagger.json npm run api:docs:generate; \
  fi
RUN npm run build
RUN npm prune --production

FROM node:22-alpine AS runner

WORKDIR /app
RUN apk add --no-cache openssl
RUN addgroup -S appgroup && adduser -S appuser -G appgroup -u 1001

COPY --chown=1001:1001 --from=builder /app/package*.json ./
COPY --chown=1001:1001 --from=builder /app/node_modules ./node_modules
COPY --chown=1001:1001 --from=builder /app/dist ./dist
COPY --chown=1001:1001 --from=builder /app/prisma ./prisma
COPY --chown=1001:1001 --from=builder /app/global-bundle.pem ./global-bundle.pem
COPY --chown=1001:1001 --from=builder /app/swagger.json ./swagger.json

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE ${PORT}

# Switch to the numeric UID instead of the string name
USER 1001
CMD ["npm", "start"]

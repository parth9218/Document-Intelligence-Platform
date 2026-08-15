FROM node:22-alpine AS builder

WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npm run db:generate
COPY . .
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

ENV PORT=3000
ENV NODE_ENV=dev

EXPOSE ${PORT}
RUN addgroup -S appgroup && adduser -S appuser -G appgroup -u 1001

# Change ownership using numeric IDs
RUN chown -R 1001:1001 /app

# Switch to the numeric UID instead of the string name
USER 1001
CMD ["npm", "start"]

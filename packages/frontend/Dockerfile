# StoneOS frontend — multi-stage build using Next.js standalone output
# (next.config.js has output: "standalone"), which bundles only the
# traced dependencies a request actually needs, not full node_modules.

FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
# NEXT_PUBLIC_* vars are baked in at build time, not read at runtime —
# pass them as build args so the image is correct for the environment
# it's actually being built for.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

# ---- Production stage ----
FROM node:24-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Run unprivileged — see the note in the backend Dockerfile. Next's
# standalone output only reads from /app at runtime, so dropping privileges
# after the copies is safe.
RUN chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "server.js"]

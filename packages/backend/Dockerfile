# StoneOS backend — multi-stage build. Final image is small (only prod
# deps + compiled JS + generated Prisma client), not the whole build toolchain.

FROM node:20-alpine AS builder
WORKDIR /app

# Install ALL deps (including dev) — needed for `nest build` and `prisma generate`.
COPY package.json ./
COPY prisma ./prisma
RUN npm install

COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate
RUN npm run build

# ---- Production stage ----
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev

# Prisma's generated client is version-matched to the schema — copy it
# rather than regenerating in the slim stage (keeps this stage free of
# devDependencies like the Prisma CLI itself).
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma

EXPOSE 4000
CMD ["node", "dist/main.js"]

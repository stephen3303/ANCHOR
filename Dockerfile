# Multi-stage build for the ANCHOR prototype. Produces a small image that runs
# the Next.js standalone server on port 3000.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Optional override for the footer commit tag; by default it is read from .git.
ARG GIT_COMMIT=
ENV NEXT_TELEMETRY_DISABLED=1 GIT_COMMIT=$GIT_COMMIT
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S anchor && adduser -S anchor -G anchor
COPY --from=build --chown=anchor:anchor /app/.next/standalone ./
COPY --from=build --chown=anchor:anchor /app/.next/static ./.next/static
COPY --from=build --chown=anchor:anchor /app/public ./public
USER anchor
EXPOSE 3000
CMD ["node", "server.js"]

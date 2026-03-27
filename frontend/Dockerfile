# ── Stage 1: Install & Build ──────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* bun.lockb* ./
RUN if [ -f bun.lockb ]; then \
      npm i -g bun && bun install --frozen-lockfile; \
    else \
      npm ci; \
    fi

COPY . .

ARG VITE_API_BASE_URL

RUN npm run build

# ── Stage 2: Serve with Nginx ────────────────────────────────────────────────
FROM nginx:alpine AS production

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Домен платформы для этого развёртывания (apex → лендинг Кворума). Vite подхватывает
# VITE_-префиксные переменные окружения на сборке.
ARG VITE_PLATFORM_DOMAIN=""
ENV VITE_PLATFORM_DOMAIN=$VITE_PLATFORM_DOMAIN

RUN npm run build

FROM nginx:1.29-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

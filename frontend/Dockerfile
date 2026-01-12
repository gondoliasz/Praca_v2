# Build stage
FROM node:18-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./ 
COPY frontend/vite.config.js ./ 
COPY frontend/ ./
RUN npm ci
RUN npm run build

# Production stage - nginx
FROM nginx:stable-alpine
# remove default nginx config and copy our config (overridden by docker-compose volume)
RUN rm /etc/nginx/conf.d/default.conf || true
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
# copy built static files
COPY --from=build /app/dist /usr/share/nginx/html
# Increase client body size to allow larger CSV uploads via nginx proxy
# Expose port 80 for nginx; docker-compose maps it to host 5173
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
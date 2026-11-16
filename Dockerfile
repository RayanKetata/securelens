# SecureLens web app image: builds the React app, then serves it with
# nginx, which also forwards /api/ to the backend container.
FROM node:24-alpine AS build

WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# The browser calls the API on the same origin, through nginx.
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:1.29-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 80

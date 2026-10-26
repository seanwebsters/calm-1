# Image for long-running hosts (Railway, Fly.io, Render, ECS…).
# Web:    docker run … calm-1                 (default CMD: npm start)
# Worker: docker run … calm-1 npm run worker  (background jobs + check-ins)
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "start"]

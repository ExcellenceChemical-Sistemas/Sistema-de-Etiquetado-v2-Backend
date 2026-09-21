FROM node:22-slim

# OpenSSL: lo necesita el motor de Prisma en runtime
RUN apt-get update && apt-get install -y --no-install-recommends     openssl     ca-certificates     && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm install
RUN npx prisma generate

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start:prod"]

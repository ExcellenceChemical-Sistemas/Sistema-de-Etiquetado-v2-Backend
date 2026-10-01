FROM node:22-slim

# OpenSSL: lo necesita el motor de Prisma en runtime.
# poppler-utils (pdftoppm) + tesseract-ocr: respaldo para leer fichas de seguridad (FDS)
# escaneadas sin texto embebido (ver src/productos/ocr-ficha.ts).
RUN apt-get update && apt-get install -y --no-install-recommends     openssl     ca-certificates     poppler-utils     tesseract-ocr     tesseract-ocr-spa     && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm install
RUN npx prisma generate

COPY . .
RUN npm run build

EXPOSE 3000
# Aplica las migraciones pendientes ANTES de arrancar. Si falla (o falta DIRECT_URL),
# el contenedor no arranca y la plataforma conserva la versión anterior en vez de
# publicar código que espera columnas que todavía no existen.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:prod"]

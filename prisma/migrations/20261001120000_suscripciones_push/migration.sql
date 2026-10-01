-- Suscripciones de Web Push (una fila por navegador/dispositivo). Solo aditivo: tabla nueva.

-- CreateTable
CREATE TABLE "suscripciones_push" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suscripciones_push_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suscripciones_push_endpoint_key" ON "suscripciones_push"("endpoint");

-- CreateIndex
CREATE INDEX "suscripciones_push_usuarioId_idx" ON "suscripciones_push"("usuarioId");

-- AddForeignKey
ALTER TABLE "suscripciones_push" ADD CONSTRAINT "suscripciones_push_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: toda tabla nueva debe habilitarlo (ver CLAUDE.md) porque Supabase expone
-- el schema "public" por HTTP con la anon key; el backend no se ve afectado
-- porque se conecta como owner de la tabla (BYPASSRLS).
ALTER TABLE "suscripciones_push" ENABLE ROW LEVEL SECURITY;

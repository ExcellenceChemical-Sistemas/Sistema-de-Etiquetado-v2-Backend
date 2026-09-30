-- Notificaciones internas (no correo) + marca de "alerta de 48h ya avisada" en pedidos.
-- Solo aditivo: columna nueva que acepta nulos y tabla nueva, no cambia ni borra datos.

ALTER TABLE "pedidos" ADD COLUMN "alerta48hEnviadaEn" TIMESTAMP(3);

-- CreateEnum
CREATE TYPE "TipoNotificacion" AS ENUM ('PEDIDO_VENCIDO');

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "tipo" "TipoNotificacion" NOT NULL,
    "mensaje" TEXT NOT NULL,
    "pedidoId" INTEGER,
    "leidaEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notificaciones_usuarioId_idx" ON "notificaciones"("usuarioId");

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: toda tabla nueva debe habilitarlo (ver CLAUDE.md) porque Supabase expone
-- el schema "public" por HTTP con la anon key; el backend no se ve afectado
-- porque se conecta como owner de la tabla (BYPASSRLS).
ALTER TABLE "notificaciones" ENABLE ROW LEVEL SECURITY;

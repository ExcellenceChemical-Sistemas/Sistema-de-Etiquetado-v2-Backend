-- CreateEnum
CREATE TYPE "EstadoCotizacion" AS ENUM ('PENDIENTE_ENVIO', 'ENVIADO');

-- CreateTable
CREATE TABLE "cotizaciones" (
    "id" SERIAL NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "numeroProforma" TEXT NOT NULL,
    "notas" TEXT,
    "estado" "EstadoCotizacion" NOT NULL DEFAULT 'PENDIENTE_ENVIO',
    "enviadoEn" TIMESTAMP(3),
    "enviadoPorId" INTEGER,
    "recordatorioEnviadoEn" TIMESTAMP(3),
    "creadoPorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cotizaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cotizaciones_clienteId_idx" ON "cotizaciones"("clienteId");

-- CreateIndex
CREATE INDEX "cotizaciones_estado_idx" ON "cotizaciones"("estado");

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_enviadoPorId_fkey" FOREIGN KEY ("enviadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS: toda tabla nueva debe habilitarlo (ver CLAUDE.md) porque Supabase expone
-- el schema "public" por HTTP con la anon key; el backend no se ve afectado
-- porque se conecta como owner de la tabla (BYPASSRLS).
ALTER TABLE "cotizaciones" ENABLE ROW LEVEL SECURITY;

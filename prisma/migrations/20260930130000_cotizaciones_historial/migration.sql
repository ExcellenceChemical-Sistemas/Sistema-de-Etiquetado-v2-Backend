-- CreateTable
CREATE TABLE "cotizaciones_historial" (
    "id" SERIAL NOT NULL,
    "cotizacionId" INTEGER NOT NULL,
    "campo" TEXT NOT NULL,
    "valorAnterior" TEXT,
    "valorNuevo" TEXT,
    "editadoPorId" INTEGER NOT NULL,
    "editadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cotizaciones_historial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cotizaciones_historial_cotizacionId_idx" ON "cotizaciones_historial"("cotizacionId");

-- AddForeignKey
ALTER TABLE "cotizaciones_historial" ADD CONSTRAINT "cotizaciones_historial_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "cotizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones_historial" ADD CONSTRAINT "cotizaciones_historial_editadoPorId_fkey" FOREIGN KEY ("editadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS: mismo motivo que el resto de tablas nuevas (Supabase expone public por HTTP con la anon key).
ALTER TABLE "cotizaciones_historial" ENABLE ROW LEVEL SECURITY;

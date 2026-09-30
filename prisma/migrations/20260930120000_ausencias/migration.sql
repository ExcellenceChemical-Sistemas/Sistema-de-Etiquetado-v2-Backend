-- CreateTable
CREATE TABLE "ausencias" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "desde" DATE NOT NULL,
    "hasta" DATE NOT NULL,
    "motivo" TEXT,
    "registradoPorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ausencias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ausencias_usuarioId_idx" ON "ausencias"("usuarioId");

-- AddForeignKey
ALTER TABLE "ausencias" ADD CONSTRAINT "ausencias_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ausencias" ADD CONSTRAINT "ausencias_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS: Supabase expone el schema public por HTTP con la anon key en el frontend;
-- sin esto cualquiera podria leer ausencias directo, salteando el guard de NestJS.
ALTER TABLE "ausencias" ENABLE ROW LEVEL SECURITY;

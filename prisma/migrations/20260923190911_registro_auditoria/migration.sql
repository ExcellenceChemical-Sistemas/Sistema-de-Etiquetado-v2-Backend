-- CreateTable
CREATE TABLE "registro_auditoria" (
    "id" SERIAL NOT NULL,
    "accion" TEXT NOT NULL,
    "actorId" INTEGER,
    "actorNombre" TEXT NOT NULL,
    "objetivoId" INTEGER,
    "objetivoNombre" TEXT NOT NULL,
    "detalle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registro_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "registro_auditoria_createdAt_idx" ON "registro_auditoria"("createdAt");

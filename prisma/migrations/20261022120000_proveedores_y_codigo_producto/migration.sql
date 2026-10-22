-- Nuevo recurso de permisos para el panel Proveedores
-- AlterEnum
ALTER TYPE "Recurso" ADD VALUE 'PROVEEDORES';

-- Código interno opcional (único) en productos
-- AlterTable
ALTER TABLE "productos" ADD COLUMN     "codigo" TEXT;

-- CreateTable
CREATE TABLE "proveedores" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombreNormalizado" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proveedores_nombre_key" ON "proveedores"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "proveedores_nombreNormalizado_key" ON "proveedores"("nombreNormalizado");

-- CreateIndex
CREATE UNIQUE INDEX "productos_codigo_key" ON "productos"("codigo");

-- RLS: toda tabla nueva lleva RLS activo (ver CLAUDE.md, migración activar_rls)
ALTER TABLE "proveedores" ENABLE ROW LEVEL SECURITY;

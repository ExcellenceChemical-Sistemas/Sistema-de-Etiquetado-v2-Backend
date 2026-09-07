-- CreateEnum
CREATE TYPE "ModuloDocumentos" AS ENUM ('KPIS', 'ISO');

-- CreateEnum
CREATE TYPE "TipoCarpeta" AS ENUM ('ANIO', 'PROCESO', 'PERIODO', 'RI', 'DS', 'OBSOLETO');

-- CreateEnum
CREATE TYPE "ProcesoIndicador" AS ENUM ('COMERCIAL', 'COMPRAS', 'ALMACEN_DISTRIBUCION', 'CONTROL_CALIDAD', 'SGC', 'DIRECCION_PLANEAMIENTO', 'RRHH', 'SERVICIOS_GENERALES');

-- CreateEnum
CREATE TYPE "TipoArchivoDocumento" AS ENUM ('PDF', 'WORD', 'EXCEL');

-- CreateEnum
CREATE TYPE "TipoAccesoIndicador" AS ENUM ('LECTURA', 'ESCRITURA');

-- CreateEnum
CREATE TYPE "TipoAccesoISO" AS ENUM ('VISUALIZACION', 'EDICION_TOTAL');

-- CreateTable
CREATE TABLE "carpetas" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "carpetaPadreId" INTEGER,
    "modulo" "ModuloDocumentos" NOT NULL,
    "tipo" "TipoCarpeta",
    "proceso" "ProcesoIndicador",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carpetas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archivos" (
    "id" SERIAL NOT NULL,
    "carpetaId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoArchivoDocumento" NOT NULL,
    "storagePath" TEXT NOT NULL,
    "subidoPorId" INTEGER NOT NULL,
    "fechaSubida" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archivos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accesos_indicador" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "proceso" "ProcesoIndicador" NOT NULL,
    "tipoAcceso" "TipoAccesoIndicador" NOT NULL,

    CONSTRAINT "accesos_indicador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accesos_iso" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "tipoAcceso" "TipoAccesoISO" NOT NULL,

    CONSTRAINT "accesos_iso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "carpetas_carpetaPadreId_idx" ON "carpetas"("carpetaPadreId");

-- CreateIndex
CREATE INDEX "archivos_carpetaId_idx" ON "archivos"("carpetaId");

-- CreateIndex
CREATE UNIQUE INDEX "accesos_indicador_usuarioId_proceso_key" ON "accesos_indicador"("usuarioId", "proceso");

-- CreateIndex
CREATE UNIQUE INDEX "accesos_iso_usuarioId_key" ON "accesos_iso"("usuarioId");

-- AddForeignKey
ALTER TABLE "carpetas" ADD CONSTRAINT "carpetas_carpetaPadreId_fkey" FOREIGN KEY ("carpetaPadreId") REFERENCES "carpetas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_carpetaId_fkey" FOREIGN KEY ("carpetaId") REFERENCES "carpetas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_subidoPorId_fkey" FOREIGN KEY ("subidoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accesos_indicador" ADD CONSTRAINT "accesos_indicador_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accesos_iso" ADD CONSTRAINT "accesos_iso_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

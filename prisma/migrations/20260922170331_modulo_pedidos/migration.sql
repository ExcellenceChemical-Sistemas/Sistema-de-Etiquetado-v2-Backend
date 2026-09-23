-- CreateEnum
CREATE TYPE "TipoDocumentoCliente" AS ENUM ('RUC', 'DNI', 'CARNET_EXTRANJERIA');

-- CreateEnum
CREATE TYPE "CategoriaObservacionPedido" AS ENUM ('INSUMO_EN_IMPORTACION', 'INSUMO_SIN_STOCK', 'RECOGE_EN_ALMACEN', 'IMPORTACION_EXPORTACION', 'CANCELADO', 'OTRO');

-- AlterEnum
ALTER TYPE "Recurso" ADD VALUE 'PEDIDOS';

-- CreateTable
CREATE TABLE "clientes" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombreNormalizado" TEXT NOT NULL,
    "tipoDocumento" "TipoDocumentoCliente",
    "numeroDocumento" TEXT,
    "direccion" TEXT,
    "celular" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos" (
    "id" SERIAL NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "numeroProforma" TEXT NOT NULL,
    "recibidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "preparadoEn" TIMESTAMP(3),
    "salioEn" TIMESTAMP(3),
    "entregadoEn" TIMESTAMP(3),
    "categoriaObservacion" "CategoriaObservacionPedido",
    "detalleObservacion" TEXT,
    "creadoPorId" INTEGER NOT NULL,
    "ultimoEditadoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clientes_nombre_key" ON "clientes"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_nombreNormalizado_key" ON "clientes"("nombreNormalizado");

-- CreateIndex
CREATE INDEX "pedidos_clienteId_idx" ON "pedidos"("clienteId");

-- CreateIndex
CREATE INDEX "pedidos_numeroProforma_idx" ON "pedidos"("numeroProforma");

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_ultimoEditadoPorId_fkey" FOREIGN KEY ("ultimoEditadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "trabajos_impresion" ADD COLUMN     "escaneos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ultimoEscaneoAt" TIMESTAMP(3);

-- Proveedor elegido al imprimir con la plantilla completa-rombo.
ALTER TABLE "trabajos_impresion" ADD COLUMN "proveedorId" INTEGER;

ALTER TABLE "trabajos_impresion"
  ADD CONSTRAINT "trabajos_impresion_proveedorId_fkey"
  FOREIGN KEY ("proveedorId") REFERENCES "proveedores"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
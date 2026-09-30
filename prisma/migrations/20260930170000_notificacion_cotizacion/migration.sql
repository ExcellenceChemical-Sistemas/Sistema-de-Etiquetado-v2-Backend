-- Aviso de "cotización aprobada sin avisar a almacén" pasa de correo (n8n) a notificación interna.
-- Solo aditivo: nuevo valor de enum y columna nullable.
ALTER TYPE "TipoNotificacion" ADD VALUE 'COTIZACION_SIN_AVISO_ALMACEN';

ALTER TABLE "notificaciones" ADD COLUMN "cotizacionId" INTEGER;

ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_cotizacionId_fkey"
  FOREIGN KEY ("cotizacionId") REFERENCES "cotizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

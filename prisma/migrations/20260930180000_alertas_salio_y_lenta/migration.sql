-- Dos alertas internas nuevas: pedido que salió sin marcarse entregado, y cotización que tarda
-- en enviarse. Solo aditivo: columnas nuevas nullable y 2 valores de enum nuevos.
ALTER TYPE "TipoNotificacion" ADD VALUE 'PEDIDO_SALIO_SIN_ENTREGAR';
ALTER TYPE "TipoNotificacion" ADD VALUE 'COTIZACION_RESPUESTA_LENTA';

ALTER TABLE "pedidos" ADD COLUMN "alertaSalioSinEntregarEnviadaEn" TIMESTAMP(3);
ALTER TABLE "cotizaciones" ADD COLUMN "alertaLentaEnviadaEn" TIMESTAMP(3);

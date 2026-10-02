-- Índices para los crons de alertas (AlertasPedidosService / AlertasCotizacionesService /
-- CotizacionesService.findPendientesDeRecordatorio): cada uno corre cada 15-30 min y hoy
-- escanea la tabla entera por falta de índice en las columnas de fecha que filtra. Columnas
-- de igualdad/IS NULL primero, el rango de fecha al final (orden recomendado para un índice
-- B-tree compuesto en Postgres).
CREATE INDEX "pedidos_alerta48hEnviadaEn_entregadoEn_salioEn_recibidoEn_idx" ON "pedidos" ("alerta48hEnviadaEn", "entregadoEn", "salioEn", "recibidoEn");
CREATE INDEX "pedidos_alertaSalioSinEntregarEnviadaEn_entregadoEn_salioE_idx" ON "pedidos" ("alertaSalioSinEntregarEnviadaEn", "entregadoEn", "salioEn");

CREATE INDEX "cotizaciones_recordatorioEnviadoEn_avisoAlmacenEn_pedidoApr_idx" ON "cotizaciones" ("recordatorioEnviadoEn", "avisoAlmacenEn", "pedidoAprobadoEn");
CREATE INDEX "cotizaciones_alertaLentaEnviadaEn_cotizacionEnviadaEn_requ_idx" ON "cotizaciones" ("alertaLentaEnviadaEn", "cotizacionEnviadaEn", "requerimientoEn");

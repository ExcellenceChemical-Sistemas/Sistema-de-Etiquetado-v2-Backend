-- Reutiliza el enum CategoriaObservacionPedido (ya existe) para la observación/excepción de
-- Cotizacion, en vez de crear un catálogo paralelo que diría lo mismo con otro nombre.
ALTER TABLE "cotizaciones" ADD COLUMN "categoriaObservacion" "CategoriaObservacionPedido";
ALTER TABLE "cotizaciones" ADD COLUMN "detalleObservacion" TEXT;

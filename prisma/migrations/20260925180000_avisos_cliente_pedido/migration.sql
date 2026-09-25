-- Avisos automaticos al cliente: correo del cliente (opcional) y marcas de "aviso enviado" en el pedido.
-- Solo aditiva: columnas nuevas que aceptan nulos, no cambia ni borra datos. Las tablas ya tienen RLS.
ALTER TABLE "clientes" ADD COLUMN "email" TEXT;

ALTER TABLE "pedidos" ADD COLUMN "avisoSalioEnviadoEn" TIMESTAMP(3),
                      ADD COLUMN "avisoEntregadoEnviadoEn" TIMESTAMP(3);

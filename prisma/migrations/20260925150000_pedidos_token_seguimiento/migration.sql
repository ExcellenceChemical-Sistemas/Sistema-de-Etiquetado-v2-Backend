-- Enlace público de seguimiento del pedido: cada pedido recibe un token aleatorio (122 bits)
-- que genera la propia base, así los pedidos que ya existan lo reciben también.
-- Solo aditiva: no borra ni cambia datos. La tabla ya tiene RLS activado.
ALTER TABLE "pedidos" ADD COLUMN "tokenSeguimiento" TEXT NOT NULL DEFAULT replace((gen_random_uuid())::text, '-'::text, ''::text);

CREATE UNIQUE INDEX "pedidos_tokenSeguimiento_key" ON "pedidos"("tokenSeguimiento");

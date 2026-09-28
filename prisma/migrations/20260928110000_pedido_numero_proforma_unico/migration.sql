-- DropIndex
DROP INDEX "pedidos_numeroProforma_idx";

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_numeroProforma_key" ON "pedidos"("numeroProforma");

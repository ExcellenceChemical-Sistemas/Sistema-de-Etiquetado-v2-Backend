-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "desactivadoEn" TIMESTAMP(3),
ADD COLUMN     "desactivadoPorId" INTEGER;

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_desactivadoPorId_fkey" FOREIGN KEY ("desactivadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

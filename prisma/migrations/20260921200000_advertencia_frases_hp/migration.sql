-- AlterTable
ALTER TABLE "productos" ADD COLUMN "palabraAdvertencia" TEXT,
ADD COLUMN "frasesH" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "frasesP" TEXT[] DEFAULT ARRAY[]::TEXT[];

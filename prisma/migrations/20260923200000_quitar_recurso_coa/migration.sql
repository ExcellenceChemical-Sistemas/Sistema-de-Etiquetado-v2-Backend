-- Quita el valor COA del enum "Recurso": ningún guard lo usaba (subir el COA es
-- LOTES.puedeEditar) y no había filas de Permiso con ese valor. Postgres no
-- permite borrar un valor de un enum, así que se recrea el tipo.
BEGIN;
CREATE TYPE "Recurso_new" AS ENUM ('LOTES', 'PRODUCTOS', 'FABRICANTES', 'PLANTILLAS', 'USUARIOS', 'ETIQUETAS', 'PEDIDOS');
ALTER TABLE "Permiso" ALTER COLUMN "recurso" TYPE "Recurso_new" USING ("recurso"::text::"Recurso_new");
ALTER TYPE "Recurso" RENAME TO "Recurso_old";
ALTER TYPE "Recurso_new" RENAME TO "Recurso";
DROP TYPE "public"."Recurso_old";
COMMIT;

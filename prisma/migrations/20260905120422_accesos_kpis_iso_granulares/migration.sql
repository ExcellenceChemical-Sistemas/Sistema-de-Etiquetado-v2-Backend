-- AlterEnum
ALTER TYPE "TipoArchivoDocumento" ADD VALUE 'POWERPOINT';

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "esAdminKpis" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "accesos_indicador" DROP COLUMN "tipoAcceso",
ADD COLUMN     "puedeAdjuntar" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "puedeDescargar" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "puedeEditar" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "puedeEliminar" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "puedeVer" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "accesos_iso" DROP COLUMN "tipoAcceso",
ADD COLUMN     "gestionaObsoleto" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "puedeAdjuntar" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "puedeDescargar" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "puedeEditar" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "puedeEliminar" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "puedeVer" BOOLEAN NOT NULL DEFAULT false;

-- DropEnum
DROP TYPE "TipoAccesoISO";

-- DropEnum
DROP TYPE "TipoAccesoIndicador";


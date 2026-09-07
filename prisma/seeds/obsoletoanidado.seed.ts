// Fixture temporal para validar Obsoleto anidado (auditoría #4).
// Correr desde el repo de BACKEND:  npx tsx prisma/seeds/obsoleto-anidado.seed.ts
// Crea "2024" dentro de la carpeta Obsoleto de ISO, con tipo: null a propósito
// — ese null es justo lo que hacía que el frontend la tratara como ISO normal.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, ModuloDocumentos, TipoCarpeta } from '../../src/generated/prisma';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const obsoleto = await prisma.carpeta.findFirst({
    where: { modulo: ModuloDocumentos.ISO, tipo: TipoCarpeta.OBSOLETO },
  });
  if (!obsoleto) throw new Error('No existe la carpeta Obsoleto: correr antes kpis-iso-2026.seed.ts');

  const anidada =
    (await prisma.carpeta.findFirst({
      where: { carpetaPadreId: obsoleto.id, nombre: '2024' },
    })) ??
    (await prisma.carpeta.create({
      data: {
        nombre: '2024',
        carpetaPadreId: obsoleto.id,
        modulo: ModuloDocumentos.ISO,
        tipo: null,
      },
    }));

  console.log(`Obsoleto = #${obsoleto.id} -> anidada "2024" = #${anidada.id}`);
  console.log(`Probar en el front: /kpis/${anidada.id}`);
}

main().finally(() => prisma.$disconnect());

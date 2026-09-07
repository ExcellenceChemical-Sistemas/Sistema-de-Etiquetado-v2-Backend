// prisma/seeds/kpis-iso-2026.seed.ts
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  ModuloDocumentos,
  TipoCarpeta,
  ProcesoIndicador,
} from '../../src/generated/prisma';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const MESES = [
  '1.ENERO', '2.FEBRERO', '3.MARZO', '4.ABRIL', '5.MAYO', '6.JUNIO',
  '7.JULIO', '8.AGOSTO', '9.SEPTIEMBRE', '10.OCTUBRE', '11.NOVIEMBRE', '12.DICIEMBRE',
];

const TRIMESTRES = ['1er Trimestre', '2do Trimestre', '3er Trimestre', '4to Trimestre'];
const SEMESTRES = ['1er Semestre', '2do Semestre'];

type Periodicidad = 'MENSUAL' | 'TRIMESTRAL' | 'SEMESTRAL';

const PROCESOS: { proceso: ProcesoIndicador; nombre: string; periodicidad: Periodicidad }[] = [
  { proceso: 'COMERCIAL', nombre: '1. INDICADOR-COMERCIAL-MENSUAL', periodicidad: 'MENSUAL' },
  { proceso: 'COMPRAS', nombre: '2. INDICADOR-COMPRAS-MENSUAL', periodicidad: 'MENSUAL' },
  { proceso: 'ALMACEN_DISTRIBUCION', nombre: '3. INDICADOR-ALMACÉN Y DISTRIBUCIÓN-MENSUAL', periodicidad: 'MENSUAL' },
  { proceso: 'CONTROL_CALIDAD', nombre: '4. INDICADOR-CONTROL DE CALIDAD-MENSUAL', periodicidad: 'MENSUAL' },
  { proceso: 'SGC', nombre: '5. INDICADOR-SGC-TRIMESTRAL', periodicidad: 'TRIMESTRAL' },
  { proceso: 'DIRECCION_PLANEAMIENTO', nombre: '6. INDICADOR-DIRECCIÓN Y PLANEAMIENTO-TRIMESTRAL', periodicidad: 'TRIMESTRAL' },
  { proceso: 'RRHH', nombre: '7. INDICADOR-RR.HH-SEMESTRAL', periodicidad: 'SEMESTRAL' },
  { proceso: 'SERVICIOS_GENERALES', nombre: '8. INDICADOR-SERVICIOS GENERALES-SEMESTRAL', periodicidad: 'SEMESTRAL' },
];

function periodosDe(periodicidad: Periodicidad): string[] {
  if (periodicidad === 'MENSUAL') return MESES;
  if (periodicidad === 'TRIMESTRAL') return TRIMESTRES;
  return SEMESTRES;
}

async function crearIndicadores(carpetaAnioId: number) {
  const indicadoresRoot = await prisma.carpeta.create({
    data: {
      nombre: 'INDICADORES',
      carpetaPadreId: carpetaAnioId,
      modulo: ModuloDocumentos.KPIS,
    },
  });

  for (const p of PROCESOS) {
    const carpetaProceso = await prisma.carpeta.create({
      data: {
        nombre: p.nombre,
        carpetaPadreId: indicadoresRoot.id,
        modulo: ModuloDocumentos.KPIS,
        tipo: TipoCarpeta.PROCESO,
        proceso: p.proceso,
      },
    });

    for (const periodo of periodosDe(p.periodicidad)) {
      const carpetaPeriodo = await prisma.carpeta.create({
        data: {
          nombre: periodo,
          carpetaPadreId: carpetaProceso.id,
          modulo: ModuloDocumentos.KPIS,
          tipo: TipoCarpeta.PERIODO,
          proceso: p.proceso,
        },
      });

      await prisma.carpeta.createMany({
        data: [
          { nombre: 'RI', carpetaPadreId: carpetaPeriodo.id, modulo: ModuloDocumentos.KPIS, tipo: TipoCarpeta.RI, proceso: p.proceso },
          { nombre: 'DS', carpetaPadreId: carpetaPeriodo.id, modulo: ModuloDocumentos.KPIS, tipo: TipoCarpeta.DS, proceso: p.proceso },
        ],
      });
    }
  }
}

async function crearIso(carpetaAnioId: number) {
  await prisma.carpeta.create({
    data: {
      nombre: 'Obsoleto',
      carpetaPadreId: carpetaAnioId,
      modulo: ModuloDocumentos.ISO,
      tipo: TipoCarpeta.OBSOLETO,
    },
  });
}

/**
 * Guarda de idempotencia: este seed usa `create` (no upsert), así que correrlo
 * dos veces duplicaría el árbol entero — dos raíces "2026" indistinguibles en
 * el explorador. Chequea las raíces antes de tocar nada.
 * Devuelve true si ya hay algo creado para ese año.
 */
async function anioYaExiste(anio: number): Promise<boolean> {
  const raizKpis = await prisma.carpeta.findFirst({
    where: { carpetaPadreId: null, modulo: ModuloDocumentos.KPIS, nombre: String(anio) },
    select: { id: true },
  });
  const raizIso = await prisma.carpeta.findFirst({
    where: { carpetaPadreId: null, modulo: ModuloDocumentos.ISO, nombre: `ISO-SGC-${anio}` },
    select: { id: true },
  });

  if (!raizKpis && !raizIso) return false;

  console.log(`⏭️  El árbol de ${anio} ya existe, no se creó nada.`);
  if (raizKpis) console.log(`   raíz KPIS "${anio}" -> carpeta #${raizKpis.id}`);
  if (raizIso) console.log(`   raíz ISO "ISO-SGC-${anio}" -> carpeta #${raizIso.id}`);
  if (!raizKpis || !raizIso) {
    console.warn(
      '   ⚠️  Solo existe una de las dos raíces: el árbol quedó a medias. ' +
        'Revisalo a mano antes de volver a correr el seed.',
    );
  }
  return true;
}

async function crearAnio(anio: number) {
  if (await anioYaExiste(anio)) return;

  const carpetaAnioKpis = await prisma.carpeta.create({
    data: { nombre: String(anio), modulo: ModuloDocumentos.KPIS, tipo: TipoCarpeta.ANIO },
  });
  await crearIndicadores(carpetaAnioKpis.id);

  const carpetaAnioIso = await prisma.carpeta.create({
    data: { nombre: `ISO-SGC-${anio}`, modulo: ModuloDocumentos.ISO, tipo: TipoCarpeta.ANIO },
  });
  await crearIso(carpetaAnioIso.id);

  console.log(`Año ${anio} creado: KPIS carpeta #${carpetaAnioKpis.id}, ISO carpeta #${carpetaAnioIso.id}`);
}

// Año a sembrar. Para clonar 2027 alcanza con cambiar esta constante:
// la guarda de idempotencia hace que correrlo de nuevo con 2026 sea inofensivo.
const ANIO = 2026;

crearAnio(ANIO)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

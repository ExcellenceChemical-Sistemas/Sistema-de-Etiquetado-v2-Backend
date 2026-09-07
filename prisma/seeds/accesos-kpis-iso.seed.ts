// prisma/seeds/accesos-kpis-iso.seed.ts
//
// Seed de accesos de KPIs/ISO con el modelo granular de 5 booleanos (§1.1).
// Asigna LECTURA (ver + descargar) a TODOS los usuarios no-admin, en los 8
// procesos de Indicadores y en ISO. Idempotente: usa upsert, se puede correr
// las veces que haga falta.
//   npm run seed:accesos
//
// A diferencia de la versión anterior, no hardcodea nombres de usuario: los
// levanta de la base. Antes buscaba "Edin"/"Joel"/"Willy"/"Kathy"/"Alice", que
// no existen acá, y además fallaba por mayúsculas ("Willy" != "willy").
//
// NOTA: este seed NO crea carpetas ni archivos. El árbol de carpetas lo arma
// prisma/seeds/kpis-iso-2026.seed.ts (`npm run seed:kpis`).
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, ProcesoIndicador } from '../../src/generated/prisma';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/** Los 5 flags granulares que comparten AccesoIndicador y AccesoISO. */
interface PermisosDocumento {
  puedeVer: boolean;
  puedeDescargar: boolean;
  puedeAdjuntar: boolean;
  puedeEditar: boolean;
  puedeEliminar: boolean;
}

const LECTURA: PermisosDocumento = {
  puedeVer: true,
  puedeDescargar: true,
  puedeAdjuntar: false,
  puedeEditar: false,
  puedeEliminar: false,
};

// Nombres que quedan fuera del seed a propósito.
// "maya" está duplicado en la base (id=3 maya@gmail.com sin usar, id=4
// maya123@gmail.com activo); hasta resolver cuál se queda, no se le asigna
// nada a ninguna de las dos para no ensuciar la fila que después se borre.
const NOMBRES_EXCLUIDOS = ['maya'];

const TODOS_LOS_PROCESOS = Object.values(ProcesoIndicador);

async function main() {
  // Los esAdmin ya tienen bypass total sobre KPIs/ISO — asignarles accesos
  // explícitos no cambiaría nada y solo agregaría filas al pedo.
  const usuarios = await prisma.usuario.findMany({
    where: {
      esAdmin: false,
      nombre: { notIn: NOMBRES_EXCLUIDOS },
    },
    select: { id: true, nombre: true },
    orderBy: { id: 'asc' },
  });

  if (usuarios.length === 0) {
    console.warn('⚠️  No hay usuarios no-admin elegibles — no se asignó ningún acceso.');
    return;
  }

  console.log(
    `Asignando LECTURA (ver + descargar) a ${usuarios.length} usuario(s): ` +
      usuarios.map((u) => `${u.nombre}#${u.id}`).join(', '),
  );

  let indicadores = 0;
  let iso = 0;

  for (const usuario of usuarios) {
    for (const proceso of TODOS_LOS_PROCESOS) {
      await prisma.accesoIndicador.upsert({
        where: { usuarioId_proceso: { usuarioId: usuario.id, proceso } },
        update: { ...LECTURA },
        create: { usuarioId: usuario.id, proceso, ...LECTURA },
      });
      indicadores++;
    }

    // gestionaObsoleto queda en false: la carpeta Obsoleto sigue siendo
    // exclusiva de quien la gestione explícitamente (§1.1 punto 3).
    await prisma.accesoISO.upsert({
      where: { usuarioId: usuario.id },
      update: { ...LECTURA, gestionaObsoleto: false },
      create: { usuarioId: usuario.id, ...LECTURA, gestionaObsoleto: false },
    });
    iso++;
  }

  console.log(`✅ ${indicadores} acceso(s) de indicador y ${iso} de ISO aplicados.`);
  console.log(
    'Recordá (§1.1): con solo LECTURA en ISO se ven los PDF pero NO los ' +
      'Word/Excel/PowerPoint — esos requieren puedeEditar.',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

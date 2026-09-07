import { AccesoDocumentosService } from './acceso-documentos.service';

// Árbol mínimo que replica la base real:
//   #191 ISO-SGC-2026 (raíz ISO)   -> archivo #3 boleta.pdf (PDF), #99 prueba.docx (WORD)
//   #1 2026 / #2 INDICADORES / #3c proceso / #4 1.ENERO / #6 DS -> archivo #7 (PDF, KPIS)
const CARPETAS: Record<number, any> = {
  191: { id: 191, nombre: 'ISO-SGC-2026', carpetaPadreId: null, modulo: 'ISO', tipo: 'ANIO', proceso: null },
  1: { id: 1, nombre: '2026', carpetaPadreId: null, modulo: 'KPIS', tipo: 'ANIO', proceso: null },
  2: { id: 2, nombre: 'INDICADORES', carpetaPadreId: 1, modulo: 'KPIS', tipo: null, proceso: null },
  30: { id: 30, nombre: '1. INDICADOR-COMERCIAL-MENSUAL', carpetaPadreId: 2, modulo: 'KPIS', tipo: 'PROCESO', proceso: 'COMERCIAL' },
  4: { id: 4, nombre: '1.ENERO', carpetaPadreId: 30, modulo: 'KPIS', tipo: 'PERIODO', proceso: 'COMERCIAL' },
  6: { id: 6, nombre: 'DS', carpetaPadreId: 4, modulo: 'KPIS', tipo: 'DS', proceso: 'COMERCIAL' },
};

const ARCHIVOS: Record<number, any> = {
  3: { id: 3, nombre: 'boleta.pdf', tipo: 'PDF', carpetaId: 191 },
  99: { id: 99, nombre: 'prueba.docx', tipo: 'WORD', carpetaId: 191 },
  7: { id: 7, nombre: 'Informe_TPOO_final.pdf', tipo: 'PDF', carpetaId: 6 },
};

/** willy tal como quedaría en la prueba manual: LECTURA + puedeEliminar forzado en true. */
const ACCESO_ISO_WILLY = {
  usuarioId: 6,
  puedeVer: true,
  puedeDescargar: true,
  puedeAdjuntar: false,
  puedeEditar: false,
  puedeEliminar: true, // ← forzado a mano para la prueba
  gestionaObsoleto: false,
};

const ACCESO_INDICADOR_WILLY: Record<string, any> = {
  COMERCIAL: {
    usuarioId: 6,
    proceso: 'COMERCIAL',
    puedeVer: true,
    puedeDescargar: true,
    puedeAdjuntar: false,
    puedeEditar: false,
    puedeEliminar: true,
  },
};

function crearServicio(overrides: { iso?: any; indicador?: any } = {}) {
  const accesoIso = { ...ACCESO_ISO_WILLY, ...(overrides.iso ?? {}) };
  const accesoIndicador = {
    COMERCIAL: { ...ACCESO_INDICADOR_WILLY.COMERCIAL, ...(overrides.indicador ?? {}) },
  };
  const prisma: any = {
    carpeta: {
      findUnique: jest.fn(async ({ where }: any) => CARPETAS[where.id] ?? null),
    },
    archivo: {
      findUnique: jest.fn(async ({ where }: any) => {
        const a = ARCHIVOS[where.id];
        return a ? { ...a, carpeta: CARPETAS[a.carpetaId] } : null;
      }),
    },
    accesoISO: {
      findUnique: jest.fn(async () => accesoIso),
    },
    accesoIndicador: {
      findUnique: jest.fn(async ({ where }: any) =>
        accesoIndicador[where.usuarioId_proceso.proceso] ?? null,
      ),
      count: jest.fn(async () => Object.keys(accesoIndicador).length),
    },
  };
  return new AccesoDocumentosService(prisma);
}

describe('AccesoDocumentosService — reglas de archivo (§1.1)', () => {
  const willy = { id: 6, esAdmin: false };
  const admin = { id: 1, esAdmin: true };
  let servicio: AccesoDocumentosService;

  beforeEach(() => {
    servicio = crearServicio();
  });

  describe('punto 2 — visibilidad por tipo en ISO', () => {
    it('deja ver un PDF de ISO con solo puedeVer', async () => {
      await expect(servicio.puedeVerArchivo(willy, 3)).resolves.toBe(true);
    });

    it('oculta un Word de ISO si no tiene puedeEditar', async () => {
      await expect(servicio.puedeVerArchivo(willy, 99)).resolves.toBe(false);
    });

    it('en KPIS no distingue por tipo', async () => {
      await expect(servicio.puedeVerArchivo(willy, 7)).resolves.toBe(true);
    });
  });

  describe('punto 1 — regla dura de PDFs en ISO', () => {
    it('bloquea el borrado de un PDF de ISO aunque puedeEliminar sea true', async () => {
      await expect(servicio.puedeEliminarArchivo(willy, 3)).resolves.toBe(false);
    });

    it('esAdmin saltea la regla dura', async () => {
      await expect(servicio.puedeEliminarArchivo(admin, 3)).resolves.toBe(true);
    });
  });

  describe('regla nueva — no se elimina lo que no se puede ver', () => {
    // Este es el gap: antes del fix devolvía true, porque el Word no es
    // esPdfIso y puedeEliminar estaba en true. willy podía borrar un archivo
    // que ni siquiera le aparecía en el listado.
    it('bloquea el borrado de un Word de ISO invisible para el usuario', async () => {
      await expect(servicio.puedeVerArchivo(willy, 99)).resolves.toBe(false);
      await expect(servicio.puedeEliminarArchivo(willy, 99)).resolves.toBe(false);
    });

    it('no rompe el borrado en KPIS: si lo ve y tiene el flag, borra', async () => {
      await expect(servicio.puedeVerArchivo(willy, 7)).resolves.toBe(true);
      await expect(servicio.puedeEliminarArchivo(willy, 7)).resolves.toBe(true);
    });
  });

  describe('puedeDescargar — el flag ahora se valida en backend', () => {
    // Antes de este fix, GET /archivos/:id/url exigía solo 'ver', así que
    // puedeDescargar era el único permiso que vivía nada más que en el frontend:
    // el botón se ocultaba pero el endpoint entregaba la signed URL igual.
    it('bloquea la descarga en KPIS cuando puedeDescargar es false', async () => {
      const s = crearServicio({ indicador: { puedeDescargar: false } });
      await expect(s.puedeVerArchivo(willy, 7)).resolves.toBe(true); // lo ve...
      await expect(s.puedeDescargarArchivo(willy, 7)).resolves.toBe(false); // ...pero no lo baja
    });

    it('permite la descarga en KPIS cuando puedeDescargar es true', async () => {
      await expect(servicio.puedeDescargarArchivo(willy, 7)).resolves.toBe(true);
    });

    it('excepción del visor: un PDF de ISO se sirve con puedeVer aunque puedeDescargar sea false', async () => {
      const s = crearServicio({ iso: { puedeDescargar: false } });
      await expect(s.puedeDescargarArchivo(willy, 3)).resolves.toBe(true);
    });

    it('no se descarga lo que no se puede ver, ni con puedeDescargar en true', async () => {
      const s = crearServicio({ iso: { puedeDescargar: true } });
      await expect(s.puedeVerArchivo(willy, 99)).resolves.toBe(false); // Word de ISO sin puedeEditar
      await expect(s.puedeDescargarArchivo(willy, 99)).resolves.toBe(false);
    });

    it('esAdmin descarga siempre', async () => {
      const s = crearServicio({ iso: { puedeDescargar: false }, indicador: { puedeDescargar: false } });
      await expect(s.puedeDescargarArchivo(admin, 7)).resolves.toBe(true);
      await expect(s.puedeDescargarArchivo(admin, 99)).resolves.toBe(true);
    });
  });
});

// @nestjs/schedule se distribuye como ESM puro; Jest no lo transforma por defecto y rompe al
// importar el decorador @Cron (ver mismo mock en resumen-diario.service.spec.ts).
jest.mock('@nestjs/schedule', () => ({ Cron: () => () => undefined }));

import { AlertasCotizacionesService } from './alertas-cotizaciones.service';

const AHORA = new Date('2026-09-15T12:00:00Z'); // martes
const EDITOR_SIN_REFRIGERIO = { id: 1, refrigerioInicioMinutos: null, refrigerioFinMinutos: null };
const DESTINATARIO = { id: 1 };

function crearServicio(opts: {
  pendientesRecordatorio?: any[];
  candidatasLentas?: any[];
  destinatarios?: any[];
  editores?: any[];
} = {}) {
  const prisma: any = {
    usuario: {
      findMany: jest.fn(({ select }: any) => {
        if ('id' in select && Object.keys(select).length === 1) {
          return Promise.resolve(opts.destinatarios ?? [DESTINATARIO]);
        }
        return Promise.resolve(opts.editores ?? [EDITOR_SIN_REFRIGERIO]);
      }),
    },
    cotizacion: {
      findMany: jest.fn(() => Promise.resolve(opts.candidatasLentas ?? [])),
      update: jest.fn(() => Promise.resolve({})),
    },
    notificacion: {
      createMany: jest.fn(() => Promise.resolve({ count: 0 })),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const cotizacionesService: any = {
    findPendientesDeRecordatorio: jest.fn(() => Promise.resolve(opts.pendientesRecordatorio ?? [])),
  };
  const push: any = { enviarA: jest.fn(() => Promise.resolve()) };
  return {
    servicio: new AlertasCotizacionesService(prisma, cotizacionesService, push),
    prisma,
    cotizacionesService,
    push,
  };
}

describe('AlertasCotizacionesService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(AHORA);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('avisarRecordatorioAlmacen', () => {
    it('sin pendientes, no busca destinatarios ni notifica', async () => {
      const { servicio, prisma } = crearServicio({ pendientesRecordatorio: [] });
      await servicio.avisarRecordatorioAlmacen();
      expect(prisma.usuario.findMany).not.toHaveBeenCalled();
      expect(prisma.notificacion.createMany).not.toHaveBeenCalled();
    });

    it('con pendientes, notifica a cada destinatario por cada cotización (ya reservada por findPendientesDeRecordatorio)', async () => {
      const cotizacion = { id: 5, numeroProforma: 'PF01-5', cliente: { nombre: 'Cliente Almacén' } };
      const { servicio, prisma, push, cotizacionesService } = crearServicio({
        pendientesRecordatorio: [cotizacion],
        destinatarios: [{ id: 1 }, { id: 2 }],
      });
      await servicio.avisarRecordatorioAlmacen();

      expect(cotizacionesService.findPendientesDeRecordatorio).toHaveBeenCalled();
      expect(prisma.notificacion.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ usuarioId: 1, tipo: 'COTIZACION_SIN_AVISO_ALMACEN', cotizacionId: 5 }),
          expect.objectContaining({ usuarioId: 2, tipo: 'COTIZACION_SIN_AVISO_ALMACEN', cotizacionId: 5 }),
        ],
      });
      expect(push.enviarA).toHaveBeenCalledWith([1, 2], expect.objectContaining({ titulo: 'Cotización sin aviso a almacén' }));
    });

    it('sin destinatarios (nadie edita Cotizaciones), no notifica aunque haya pendientes', async () => {
      const cotizacion = { id: 6, numeroProforma: 'PF01-6', cliente: { nombre: 'Cliente Y' } };
      const { servicio, prisma } = crearServicio({ pendientesRecordatorio: [cotizacion], destinatarios: [] });
      await servicio.avisarRecordatorioAlmacen();
      expect(prisma.notificacion.createMany).not.toHaveBeenCalled();
    });
  });

  describe('avisarRespuestaLenta', () => {
    it('sin candidatas, no busca destinatarios', async () => {
      const { servicio, prisma } = crearServicio({ candidatasLentas: [] });
      await servicio.avisarRespuestaLenta();
      expect(prisma.usuario.findMany).not.toHaveBeenCalled();
    });

    it('una cotización con más de 24h hábiles sin cotizarse dispara la notificación y marca alertaLentaEnviadaEn', async () => {
      const cotizacion = {
        id: 30,
        numeroProforma: null,
        requerimientoEn: new Date('2026-09-08T07:30:00Z'), // martes anterior, jornada completa: ~54.5h hábiles hasta AHORA
        cliente: { nombre: 'Cliente Lento' },
      };
      const { servicio, prisma, push } = crearServicio({ candidatasLentas: [cotizacion] });
      await servicio.avisarRespuestaLenta();

      expect(prisma.cotizacion.update).toHaveBeenCalledWith({
        where: { id: 30 },
        data: { alertaLentaEnviadaEn: AHORA },
      });
      expect(prisma.notificacion.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ usuarioId: 1, tipo: 'COTIZACION_RESPUESTA_LENTA', cotizacionId: 30 })],
      });
      expect(push.enviarA).toHaveBeenCalled();
    });

    it('una cotización reciente (menos de 24h hábiles) no se notifica todavía', async () => {
      const cotizacion = {
        id: 31,
        numeroProforma: null,
        requerimientoEn: new Date('2026-09-15T10:00:00Z'), // hace 2h
        cliente: { nombre: 'Cliente Reciente' },
      };
      const { servicio, prisma } = crearServicio({ candidatasLentas: [cotizacion] });
      await servicio.avisarRespuestaLenta();
      expect(prisma.cotizacion.update).not.toHaveBeenCalled();
      expect(prisma.notificacion.createMany).not.toHaveBeenCalled();
    });

    it('sin destinatarios (nadie edita Cotizaciones), no notifica aunque la demora supere el umbral', async () => {
      const cotizacion = {
        id: 32,
        numeroProforma: null,
        requerimientoEn: new Date('2026-09-08T07:30:00Z'),
        cliente: { nombre: 'Cliente Z' },
      };
      const { servicio, prisma } = crearServicio({ candidatasLentas: [cotizacion], destinatarios: [] });
      await servicio.avisarRespuestaLenta();
      expect(prisma.cotizacion.update).not.toHaveBeenCalled();
    });
  });
});

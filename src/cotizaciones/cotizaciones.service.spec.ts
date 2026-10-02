import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma';
import {
  CotizacionesService,
  calcularAlertasCotizacion,
  derivarEstadoCotizacion,
} from './cotizaciones.service';

const COTIZACION_VACIA = {
  id: 1,
  clienteId: 1,
  numeroProforma: null as string | null,
  notas: null as string | null,
  requerimientoEn: new Date('2026-09-01T10:00:00Z'),
  cotizacionEnviadaEn: null as Date | null,
  pedidoAprobadoEn: null as Date | null,
  avisoAlmacenEn: null as Date | null,
  recordatorioEnviadoEn: null as Date | null,
  creadoPorId: 7,
  ultimoEditadoPorId: 7,
};

function crearServicio(cotizaciones: any[], opts: { errorCreate?: Error; errorUpdate?: Error } = {}) {
  const historial: any[] = [];
  const prisma: any = {
    cotizacion: {
      create: jest.fn(({ data }: any) => {
        if (opts.errorCreate) return Promise.reject(opts.errorCreate);
        return Promise.resolve({ ...COTIZACION_VACIA, ...data, id: cotizaciones[0]?.id ?? 1 });
      }),
      findMany: jest.fn(() => Promise.resolve(cotizaciones)),
      findUnique: jest.fn(({ where }: any) => Promise.resolve(cotizaciones.find((c) => c.id === where.id) ?? null)),
      update: jest.fn(({ where, data }: any) => {
        if (opts.errorUpdate) return Promise.reject(opts.errorUpdate);
        const actual = cotizaciones.find((c) => c.id === where.id) ?? cotizaciones[0];
        return Promise.resolve({ ...actual, ...data });
      }),
      updateMany: jest.fn(() => Promise.resolve({ count: cotizaciones.length })),
      delete: jest.fn(({ where }: any) => Promise.resolve(cotizaciones.find((c) => c.id === where.id))),
    },
    cotizacionHistorial: {
      create: jest.fn(({ data }: any) => {
        historial.push(data);
        return Promise.resolve(data);
      }),
      findMany: jest.fn(() => Promise.resolve([])),
    },
    pedido: {
      findMany: jest.fn(() => Promise.resolve([])),
    },
    $transaction: jest.fn((cb: any) => cb(prisma)),
  };
  const ausenciasService: any = {
    obtenerPorUsuarios: jest.fn(() => Promise.resolve(new Map())),
  };
  return { servicio: new CotizacionesService(prisma, ausenciasService), prisma, historial, ausenciasService };
}

describe('calcularAlertasCotizacion', () => {
  const BASE = {
    requerimientoEn: new Date('2026-09-02T15:00:00Z'), // miércoles, día laboral
    cotizacionEnviadaEn: null as Date | null,
    pedidoAprobadoEn: null as Date | null,
    avisoAlmacenEn: null as Date | null,
    creadoPorId: 1,
    ultimoEditadoPorId: null as number | null,
  };

  it('sin fechas marcadas fuera de requerimientoEn, y todo en día laboral sin ausencia → sin alertas', () => {
    const alertas = calcularAlertasCotizacion(BASE, new Map(), []);
    expect(alertas).toEqual([]);
  });

  it('una fecha cayendo en fin de semana dispara FERIADO_O_FIN_DE_SEMANA', () => {
    const cotizacion = { ...BASE, requerimientoEn: new Date('2026-09-06T15:00:00Z') }; // domingo
    const alertas = calcularAlertasCotizacion(cotizacion, new Map(), []);
    expect(alertas).toEqual([{ campo: 'requerimientoEn', tipo: 'FERIADO_O_FIN_DE_SEMANA' }]);
  });

  it('una fecha cayendo en feriado peruano dispara FERIADO_O_FIN_DE_SEMANA', () => {
    const cotizacion = { ...BASE, requerimientoEn: new Date('2026-01-01T15:00:00Z') }; // Año Nuevo
    const alertas = calcularAlertasCotizacion(cotizacion, new Map(), []);
    expect(alertas).toEqual([{ campo: 'requerimientoEn', tipo: 'FERIADO_O_FIN_DE_SEMANA' }]);
  });

  it('una fecha dentro de una ausencia del creador dispara AUSENCIA_REGISTRADA con el motivo', () => {
    const ausencias = new Map([
      [1, [{ desde: new Date('2026-09-01'), hasta: new Date('2026-09-05'), motivo: 'Vacaciones' }]],
    ]);
    const alertas = calcularAlertasCotizacion(BASE, ausencias, []);
    expect(alertas).toEqual([{ campo: 'requerimientoEn', tipo: 'AUSENCIA_REGISTRADA', motivo: 'Vacaciones' }]);
  });

  it('una ausencia del último editor también cuenta, no solo la del creador', () => {
    const cotizacion = { ...BASE, ultimoEditadoPorId: 2 };
    const ausencias = new Map([
      [2, [{ desde: new Date('2026-09-01'), hasta: new Date('2026-09-05'), motivo: null }]],
    ]);
    const alertas = calcularAlertasCotizacion(cotizacion, ausencias, []);
    expect(alertas).toEqual([{ campo: 'requerimientoEn', tipo: 'AUSENCIA_REGISTRADA', motivo: undefined }]);
  });

  it('feriado y ausencia no se acumulan para el mismo campo: el feriado gana (son ramas excluyentes)', () => {
    const cotizacion = { ...BASE, requerimientoEn: new Date('2026-09-06T15:00:00Z') }; // domingo
    const ausencias = new Map([
      [1, [{ desde: new Date('2026-09-01'), hasta: new Date('2026-09-10'), motivo: 'Vacaciones' }]],
    ]);
    const alertas = calcularAlertasCotizacion(cotizacion, ausencias, []);
    expect(alertas).toEqual([{ campo: 'requerimientoEn', tipo: 'FERIADO_O_FIN_DE_SEMANA' }]);
  });

  it('el historial registrado más de 24h después de la fecha dispara CARGA_TARDIA', () => {
    const historial = [
      { campo: 'requerimientoEn', valorNuevo: BASE.requerimientoEn.toISOString(), editadoEn: new Date('2026-09-05T15:00:00Z') },
    ];
    const alertas = calcularAlertasCotizacion(BASE, new Map(), historial);
    expect(alertas).toEqual([
      expect.objectContaining({ campo: 'requerimientoEn', tipo: 'CARGA_TARDIA' }),
    ]);
  });

  it('un historial dentro de las 24h no dispara CARGA_TARDIA', () => {
    const historial = [
      { campo: 'requerimientoEn', valorNuevo: BASE.requerimientoEn.toISOString(), editadoEn: new Date('2026-09-02T20:00:00Z') },
    ];
    const alertas = calcularAlertasCotizacion(BASE, new Map(), historial);
    expect(alertas).toEqual([]);
  });

  it('un campo sin fecha (null) no se evalúa', () => {
    const alertas = calcularAlertasCotizacion(BASE, new Map(), []);
    expect(alertas.some((a) => a.campo === 'cotizacionEnviadaEn')).toBe(false);
  });
});

describe('derivarEstadoCotizacion', () => {
  const casos: [string, object, string][] = [
    ['sin ninguna fecha → RECIBIDO', {}, 'RECIBIDO'],
    ['con cotización enviada → COTIZADO', { cotizacionEnviadaEn: new Date() }, 'COTIZADO'],
    ['con pedido aprobado → APROBADO', { cotizacionEnviadaEn: new Date(), pedidoAprobadoEn: new Date() }, 'APROBADO'],
    [
      'con aviso a almacén → AVISADO_ALMACEN',
      { cotizacionEnviadaEn: new Date(), pedidoAprobadoEn: new Date(), avisoAlmacenEn: new Date() },
      'AVISADO_ALMACEN',
    ],
    // La etapa más avanzada manda aunque falten las anteriores.
    ['avisado sin marcar las anteriores → AVISADO_ALMACEN', { avisoAlmacenEn: new Date() }, 'AVISADO_ALMACEN'],
  ];

  it.each(casos)('%s', (_nombre, fechas, esperado) => {
    expect(
      derivarEstadoCotizacion({
        cotizacionEnviadaEn: null,
        pedidoAprobadoEn: null,
        avisoAlmacenEn: null,
        ...fechas,
      } as any),
    ).toBe(esperado);
  });
});

describe('findAll / findOne', () => {
  it('findAll deriva el estado de cada cotización', async () => {
    const { servicio } = crearServicio([{ ...COTIZACION_VACIA, cotizacionEnviadaEn: new Date() }]);
    const [c] = await servicio.findAll();
    expect(c.estado).toBe('COTIZADO');
  });

  it('findAll filtra por estado con la misma regla con la que se deriva', async () => {
    const { servicio, prisma } = crearServicio([]);
    const esperados: Record<string, object> = {
      RECIBIDO: { cotizacionEnviadaEn: null },
      COTIZADO: { cotizacionEnviadaEn: { not: null }, pedidoAprobadoEn: null },
      APROBADO: { pedidoAprobadoEn: { not: null }, avisoAlmacenEn: null },
      AVISADO_ALMACEN: { avisoAlmacenEn: { not: null } },
    };
    for (const [estado, where] of Object.entries(esperados)) {
      await servicio.findAll(estado as any);
      const llamada = prisma.cotizacion.findMany.mock.calls.at(-1)[0];
      expect(llamada.where).toEqual(where);
    }
  });

  it('findOne de una cotización inexistente → NotFound', async () => {
    const { servicio } = crearServicio([]);
    await expect(servicio.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('findOne adjunta el pedido relacionado por numeroProforma', async () => {
    const { servicio, prisma } = crearServicio([{ ...COTIZACION_VACIA, numeroProforma: 'PF01-1' }]);
    prisma.pedido.findMany.mockResolvedValueOnce([
      {
        id: 5,
        numeroProforma: 'PF01-1',
        recibidoEn: new Date(),
        inicioPreparacionEn: null,
        preparadoEn: null,
        salioEn: null,
        entregadoEn: null,
        tokenSeguimiento: 'tok',
      },
    ]);
    const c = await servicio.findOne(1);
    expect(c.pedidoRelacionado?.id).toBe(5);
  });
});

describe('create', () => {
  it('sin requerimientoEn en el body, usa el default del schema y lo registra en el historial', async () => {
    const { servicio, historial } = crearServicio([]);
    const cotizacion = await servicio.create({ clienteId: 1 } as any, 7);
    expect(cotizacion.estado).toBe('RECIBIDO');
    expect(historial[0]).toMatchObject({ campo: 'requerimientoEn', valorAnterior: null, editadoPorId: 7 });
  });

  it('con requerimientoEn en el body, se usa tal cual (no está protegida)', async () => {
    const { servicio, prisma } = crearServicio([]);
    await servicio.create({ clienteId: 1, requerimientoEn: '2026-09-10T00:00:00.000Z' } as any, 7);
    const data = prisma.cotizacion.create.mock.calls[0][0].data;
    expect(data.requerimientoEn).toEqual(new Date('2026-09-10T00:00:00.000Z'));
  });
});

describe('update — fechas protegidas (marcar vs. corregir)', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-15T12:00:00Z'));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('marcar cotizacionEnviadaEn sin proforma (ni guardada ni en el PATCH) → BadRequest', async () => {
    const { servicio } = crearServicio([{ ...COTIZACION_VACIA }]);
    await expect(
      servicio.update(1, { cotizacionEnviadaEn: '2026-09-15T08:00:00.000Z' } as any, 7, false),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('al marcar por primera vez, ignora la fecha que mandó el cliente y usa la hora del servidor', async () => {
    const { servicio, prisma } = crearServicio([{ ...COTIZACION_VACIA, numeroProforma: 'PF01-1' }]);
    await servicio.update(
      1,
      { cotizacionEnviadaEn: '2020-01-01T00:00:00.000Z' } as any,
      7,
      false,
    );
    const data = prisma.cotizacion.update.mock.calls[0][0].data;
    expect(data.cotizacionEnviadaEn).toEqual(new Date('2026-09-15T12:00:00Z'));
  });

  it('corregir una fecha ya marcada sin ser admin → Forbidden, no escribe', async () => {
    const { servicio, prisma } = crearServicio([
      { ...COTIZACION_VACIA, numeroProforma: 'PF01-1', cotizacionEnviadaEn: new Date('2026-09-10T00:00:00Z') },
    ]);
    await expect(
      servicio.update(1, { cotizacionEnviadaEn: '2026-09-11T00:00:00.000Z' } as any, 7, false),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.cotizacion.update).not.toHaveBeenCalled();
  });

  it('corregir una fecha ya marcada como admin sin motivo → BadRequest', async () => {
    const { servicio } = crearServicio([
      { ...COTIZACION_VACIA, numeroProforma: 'PF01-1', cotizacionEnviadaEn: new Date('2026-09-10T00:00:00Z') },
    ]);
    await expect(
      servicio.update(1, { cotizacionEnviadaEn: '2026-09-11T00:00:00.000Z' } as any, 7, true),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('corregir una fecha ya marcada como admin con motivo: usa la fecha enviada y registra el motivo', async () => {
    const { servicio, prisma, historial } = crearServicio([
      { ...COTIZACION_VACIA, numeroProforma: 'PF01-1', cotizacionEnviadaEn: new Date('2026-09-10T00:00:00Z') },
    ]);
    await servicio.update(
      1,
      { cotizacionEnviadaEn: '2026-09-11T00:00:00.000Z', motivoCorreccion: 'Error de tipeo' } as any,
      7,
      true,
    );
    const data = prisma.cotizacion.update.mock.calls[0][0].data;
    expect(data.cotizacionEnviadaEn).toEqual(new Date('2026-09-11T00:00:00.000Z'));
    expect(historial.at(-1)).toMatchObject({ campo: 'cotizacionEnviadaEn', motivo: 'Error de tipeo' });
  });

  it('requerimientoEn se puede editar libremente, sin exigir admin ni motivo', async () => {
    const { servicio, prisma } = crearServicio([{ ...COTIZACION_VACIA }]);
    await servicio.update(1, { requerimientoEn: '2026-09-20T00:00:00.000Z' } as any, 7, false);
    const data = prisma.cotizacion.update.mock.calls[0][0].data;
    expect(data.requerimientoEn).toEqual(new Date('2026-09-20T00:00:00.000Z'));
  });

  it('una proforma duplicada → Conflict, no un 500 genérico', async () => {
    const duplicada = new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' });
    const { servicio } = crearServicio([{ ...COTIZACION_VACIA }], { errorUpdate: duplicada });
    await expect(
      servicio.update(1, { numeroProforma: 'PF01-1' } as any, 7, false),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('otros errores de Prisma no se confunden con el de proforma duplicada', async () => {
    const otro = new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'test' });
    const { servicio } = crearServicio([{ ...COTIZACION_VACIA }], { errorUpdate: otro });
    await expect(servicio.update(1, { numeroProforma: 'PF01-1' } as any, 7, false)).rejects.toBe(otro);
  });
});

describe('update — revertirEtapa', () => {
  it('sin ser admin → Forbidden', async () => {
    const { servicio } = crearServicio([{ ...COTIZACION_VACIA, cotizacionEnviadaEn: new Date() }]);
    await expect(
      servicio.update(1, { revertirEtapa: 'cotizacionEnviadaEn', motivoCorreccion: 'clic por error' } as any, 7, false),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('como admin sin motivo → BadRequest', async () => {
    const { servicio } = crearServicio([{ ...COTIZACION_VACIA, cotizacionEnviadaEn: new Date() }]);
    await expect(
      servicio.update(1, { revertirEtapa: 'cotizacionEnviadaEn' } as any, 7, true),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('revertir una etapa que no está marcada → BadRequest', async () => {
    const { servicio } = crearServicio([{ ...COTIZACION_VACIA }]);
    await expect(
      servicio.update(1, { revertirEtapa: 'cotizacionEnviadaEn', motivoCorreccion: 'clic por error' } as any, 7, true),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('revertir una etapa limpia también las etapas posteriores que dependen de ella', async () => {
    const { servicio, prisma, historial } = crearServicio([
      {
        ...COTIZACION_VACIA,
        cotizacionEnviadaEn: new Date('2026-09-10T00:00:00Z'),
        pedidoAprobadoEn: new Date('2026-09-11T00:00:00Z'),
        avisoAlmacenEn: new Date('2026-09-12T00:00:00Z'),
      },
    ]);
    await servicio.update(1, { revertirEtapa: 'pedidoAprobadoEn', motivoCorreccion: 'clic por error' } as any, 7, true);

    const data = prisma.cotizacion.update.mock.calls[0][0].data;
    expect(data.pedidoAprobadoEn).toBeNull();
    expect(data.avisoAlmacenEn).toBeNull();
    expect(data).not.toHaveProperty('cotizacionEnviadaEn'); // la etapa anterior no se toca
    expect(historial.map((h) => h.campo)).toEqual(
      expect.arrayContaining(['pedidoAprobadoEn', 'avisoAlmacenEn']),
    );
    expect(historial.every((h) => h.motivo === 'clic por error')).toBe(true);
  });
});

describe('remove', () => {
  it('una cotización inexistente → NotFound, no borra nada', async () => {
    const { servicio, prisma } = crearServicio([]);
    await expect(servicio.remove(99)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.cotizacion.delete).not.toHaveBeenCalled();
  });

  it('borra la cotización existente', async () => {
    const { servicio, prisma } = crearServicio([{ ...COTIZACION_VACIA }]);
    await servicio.remove(1);
    expect(prisma.cotizacion.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });
});

describe('findPendientesDeRecordatorio', () => {
  it('sin candidatas, no llama a updateMany', async () => {
    const { servicio, prisma } = crearServicio([]);
    const resultado = await servicio.findPendientesDeRecordatorio(new Date());
    expect(resultado).toEqual([]);
    expect(prisma.cotizacion.updateMany).not.toHaveBeenCalled();
  });

  it('reserva (marca recordatorioEnviadoEn) las candidatas antes de devolverlas, para no avisar dos veces', async () => {
    const limite = new Date('2026-09-15T17:00:00Z');
    const candidata = { ...COTIZACION_VACIA, id: 3, pedidoAprobadoEn: new Date('2026-09-14T10:00:00Z') };
    const { servicio, prisma } = crearServicio([candidata]);

    const resultado = await servicio.findPendientesDeRecordatorio(limite);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].estado).toBe('APROBADO');
    expect(prisma.cotizacion.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [3] }, recordatorioEnviadoEn: null },
      data: { recordatorioEnviadoEn: expect.any(Date) },
    });
  });
});

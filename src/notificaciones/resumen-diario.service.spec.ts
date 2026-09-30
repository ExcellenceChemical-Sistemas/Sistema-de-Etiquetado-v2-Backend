// @nestjs/schedule se distribuye como ESM puro; Jest no lo transforma por defecto y rompe al
// importar el decorador @Cron. Se mockea para poder testear el servicio sin tocar la config
// global de Jest (mismo problema no se topó antes porque ningún otro *.spec.ts importaba un
// servicio con @Cron directamente).
jest.mock('@nestjs/schedule', () => ({ Cron: () => () => undefined }));

import { ResumenDiarioService } from './resumen-diario.service';

function crearServicio(overrides: {
  yaEnviado?: any;
  pedidosVencidos?: number;
  pedidosSalieron?: number;
  cotizacionesSinAviso?: number;
  cotizacionesLentas?: number;
  usuarios?: any[];
} = {}) {
  const prisma: any = {
    notificacion: {
      findFirst: jest.fn(() => Promise.resolve(overrides.yaEnviado ?? null)),
      createMany: jest.fn(() => Promise.resolve({ count: 0 })),
    },
    pedido: {
      count: jest
        .fn()
        .mockResolvedValueOnce(overrides.pedidosVencidos ?? 0)
        .mockResolvedValueOnce(overrides.pedidosSalieron ?? 0),
    },
    cotizacion: {
      count: jest
        .fn()
        .mockResolvedValueOnce(overrides.cotizacionesSinAviso ?? 0)
        .mockResolvedValueOnce(overrides.cotizacionesLentas ?? 0),
    },
    usuario: {
      findMany: jest.fn(() => Promise.resolve(overrides.usuarios ?? [{ id: 1 }])),
    },
  };
  return { servicio: new ResumenDiarioService(prisma), prisma };
}

describe('ResumenDiarioService', () => {
  it('no manda nada si ya se envió un resumen hoy', async () => {
    const { servicio, prisma } = crearServicio({ yaEnviado: { id: 99 } });
    await servicio.enviarResumenDiario();
    expect(prisma.pedido.count).not.toHaveBeenCalled();
    expect(prisma.notificacion.createMany).not.toHaveBeenCalled();
  });

  it('no manda nada si no hay alertas abiertas (día tranquilo)', async () => {
    const { servicio, prisma } = crearServicio({});
    await servicio.enviarResumenDiario();
    expect(prisma.notificacion.createMany).not.toHaveBeenCalled();
  });

  it('arma un solo resumen por destinatario cuando hay alertas abiertas', async () => {
    const { servicio, prisma } = crearServicio({
      pedidosVencidos: 2,
      cotizacionesLentas: 1,
      usuarios: [{ id: 1 }, { id: 2 }],
    });
    await servicio.enviarResumenDiario();
    expect(prisma.notificacion.createMany).toHaveBeenCalledTimes(1);
    const { data } = prisma.notificacion.createMany.mock.calls[0][0];
    expect(data).toHaveLength(2);
    expect(data[0].tipo).toBe('RESUMEN_DIARIO');
    expect(data[0].mensaje).toContain('2 pedido(s) vencido(s) sin salir');
    expect(data[0].mensaje).toContain('1 cotización(es) con respuesta lenta');
  });

  it('no manda nada si hay alertas abiertas pero ningún destinatario', async () => {
    const { servicio, prisma } = crearServicio({ pedidosVencidos: 1, usuarios: [] });
    await servicio.enviarResumenDiario();
    expect(prisma.notificacion.createMany).not.toHaveBeenCalled();
  });
});

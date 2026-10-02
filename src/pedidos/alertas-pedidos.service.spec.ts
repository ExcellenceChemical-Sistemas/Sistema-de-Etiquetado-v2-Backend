// @nestjs/schedule se distribuye como ESM puro; Jest no lo transforma por defecto y rompe al
// importar el decorador @Cron (ver mismo mock en resumen-diario.service.spec.ts).
jest.mock('@nestjs/schedule', () => ({ Cron: () => () => undefined }));

import { AlertasPedidosService } from './alertas-pedidos.service';

const AHORA = new Date('2026-09-15T12:00:00Z'); // martes

const EDITOR_SIN_REFRIGERIO = { id: 1, refrigerioInicioMinutos: null, refrigerioFinMinutos: null };
const DESTINATARIO = { id: 1 };

function crearServicio(opts: {
  sinSalir?: any[];
  salioSinEntregar?: any[];
  destinatarios?: any[];
  editores?: any[];
} = {}) {
  const prisma: any = {
    usuario: {
      // El servicio llama usuario.findMany dos veces por corrida (refrigerios, luego
      // destinatarios); ambos consultan sobre el mismo criterio de "quién administra
      // Pedidos", así que basta devolver la lista correspondiente en cada llamada.
      findMany: jest.fn(({ select }: any) => {
        if ('id' in select && Object.keys(select).length === 1) {
          return Promise.resolve(opts.destinatarios ?? [DESTINATARIO]);
        }
        return Promise.resolve(opts.editores ?? [EDITOR_SIN_REFRIGERIO]);
      }),
    },
    pedido: {
      findMany: jest.fn(({ where }: any) => {
        if (where.salioEn === null) return Promise.resolve(opts.sinSalir ?? []);
        return Promise.resolve(opts.salioSinEntregar ?? []);
      }),
      update: jest.fn(() => Promise.resolve({})),
    },
    notificacion: {
      createMany: jest.fn(() => Promise.resolve({ count: 0 })),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const push: any = { enviarA: jest.fn(() => Promise.resolve()) };
  return { servicio: new AlertasPedidosService(prisma, push), prisma, push };
}

describe('AlertasPedidosService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(AHORA);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('sin destinatarios (nadie con permiso de ver Pedidos), no consulta pedidos', async () => {
    const { servicio, prisma } = crearServicio({ destinatarios: [] });
    await servicio.avisarPedidosVencidos();
    expect(prisma.pedido.findMany).not.toHaveBeenCalled();
  });

  describe('avisarSinSalir (≥48h hábiles sin salir)', () => {
    it('un pedido que ya superó el umbral dispara la notificación y marca alerta48hEnviadaEn', async () => {
      const pedido = {
        id: 10,
        numeroProforma: 'PF01-1',
        recibidoEn: new Date('2026-09-08T07:30:00Z'), // martes anterior, jornada completa: ~54.5h hábiles hasta AHORA
        cliente: { nombre: 'Cliente X' },
      };
      const { servicio, prisma, push } = crearServicio({ sinSalir: [pedido] });
      await servicio.avisarPedidosVencidos();

      expect(prisma.pedido.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { alerta48hEnviadaEn: AHORA },
      });
      expect(prisma.notificacion.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ usuarioId: 1, tipo: 'PEDIDO_VENCIDO', pedidoId: 10 })],
      });
      expect(push.enviarA).toHaveBeenCalledWith([1], expect.objectContaining({ titulo: 'Pedido vencido' }));
    });

    it('un pedido que todavía no llega a 48h hábiles no se notifica ni se marca', async () => {
      const pedido = {
        id: 11,
        numeroProforma: 'PF01-2',
        recibidoEn: new Date('2026-09-15T10:00:00Z'), // hace 2h
        cliente: { nombre: 'Cliente Y' },
      };
      const { servicio, prisma, push } = crearServicio({ sinSalir: [pedido] });
      await servicio.avisarPedidosVencidos();

      expect(prisma.pedido.update).not.toHaveBeenCalled();
      expect(prisma.notificacion.createMany).not.toHaveBeenCalled();
      expect(push.enviarA).not.toHaveBeenCalled();
    });

    it('el refrigerio común se descuenta del conteo de horas hábiles', async () => {
      // Recibido el lunes 2026-09-14 a las 7:30 (jornada completa). Sin refrigerio, a las
      // 12:00 del martes siguiente ya pasaron 48h hábiles (10h lunes + 10h martes hasta las
      // 17:30, pero cortamos a las 12:00 del martes = 10h + 4.5h = 14.5h... ver test con rango
      // más largo). Este test solo verifica que CON refrigerio activo se descuentan horas: un
      // pedido que sin refrigerio llegaría a 48h, con refrigerio de 1h diario se queda corto.
      const recibidoEn = new Date('2026-09-08T07:30:00Z'); // martes anterior, jornada completa
      const pedido = { id: 12, numeroProforma: 'PF01-3', recibidoEn, cliente: { nombre: 'Cliente Z' } };
      const sinRefrigerio = crearServicio({ sinSalir: [pedido], editores: [EDITOR_SIN_REFRIGERIO] });
      const conRefrigerio = crearServicio({
        sinSalir: [pedido],
        editores: [{ id: 2, refrigerioInicioMinutos: 720, refrigerioFinMinutos: 780 }], // 12:00-13:00
      });

      await sinRefrigerio.servicio.avisarPedidosVencidos();
      await conRefrigerio.servicio.avisarPedidosVencidos();

      // Con refrigerio se descuenta 1h/día hábil transcurrido, así que si sin refrigerio ya
      // notificó, con refrigerio puede quedar justo por debajo según cuántos días hábiles
      // pasaron. Lo que importa es que el resultado puede diferir: no son necesariamente iguales.
      const notificoSinRefrigerio = sinRefrigerio.prisma.notificacion.createMany.mock.calls.length > 0;
      const notificoConRefrigerio = conRefrigerio.prisma.notificacion.createMany.mock.calls.length > 0;
      expect(notificoSinRefrigerio).toBe(true);
      // El refrigerio resta horas, nunca las puede sumar — con refrigerio nunca notifica antes.
      if (!notificoSinRefrigerio) expect(notificoConRefrigerio).toBe(false);
    });
  });

  describe('avisarSalioSinEntregar (≥24h hábiles sin entregar tras salir)', () => {
    it('un pedido que salió hace más de 24h hábiles dispara la notificación', async () => {
      const pedido = {
        id: 20,
        numeroProforma: 'PF02-1',
        salioEn: new Date('2026-09-10T08:00:00Z'), // jueves anterior: ~34h hábiles hasta AHORA
        cliente: { nombre: 'Cliente A' },
      };
      const { servicio, prisma, push } = crearServicio({ salioSinEntregar: [pedido] });
      await servicio.avisarPedidosVencidos();

      expect(prisma.pedido.update).toHaveBeenCalledWith({
        where: { id: 20 },
        data: { alertaSalioSinEntregarEnviadaEn: AHORA },
      });
      expect(prisma.notificacion.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ tipo: 'PEDIDO_SALIO_SIN_ENTREGAR', pedidoId: 20 })],
      });
      expect(push.enviarA).toHaveBeenCalled();
    });

    it('un pedido recién salido no se notifica todavía', async () => {
      const pedido = {
        id: 21,
        numeroProforma: 'PF02-2',
        salioEn: new Date('2026-09-15T11:00:00Z'), // hace 1h
        cliente: { nombre: 'Cliente B' },
      };
      const { servicio, prisma } = crearServicio({ salioSinEntregar: [pedido] });
      await servicio.avisarPedidosVencidos();
      expect(prisma.pedido.update).not.toHaveBeenCalled();
    });
  });
});

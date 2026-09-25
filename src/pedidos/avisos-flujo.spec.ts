import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { PedidosService } from './pedidos.service';

/**
 * Flujo completo tal como lo hace la gente en la pantalla de pedidos, con una "base" en memoria
 * que conserva el estado entre cambios (los otros tests usan dobles que no lo conservan).
 * Cubre lo que se probó a mano: marcar etapas, y CORREGIR fechas ya marcadas.
 */

function crearEntorno(cliente: { email: string | null }) {
  // Pedido en memoria
  const fila: any = {
    id: 1,
    clienteId: 1,
    numeroProforma: 'PF-PRUEBA',
    tokenSeguimiento: 'tok',
    recibidoEn: new Date('2026-09-01T10:00:00Z'),
    inicioPreparacionEn: null,
    preparadoEn: null,
    salioEn: null,
    entregadoEn: null,
    avisoSalioEnviadoEn: null,
    avisoEntregadoEnviadoEn: null,
    categoriaObservacion: null,
    detalleObservacion: null,
  };
  const leer = () => ({ ...fila, cliente: { ...cliente } });

  const prisma: any = {
    pedido: {
      findUnique: jest.fn(() => Promise.resolve(leer())),
      update: jest.fn(({ data }: any) => {
        Object.assign(fila, Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)));
        return Promise.resolve(leer());
      }),
      updateMany: jest.fn(({ where, data }: any) => {
        const cumple = Object.entries(where).every(([k, v]) => (v === null ? fila[k] === null : fila[k] === v));
        if (!cumple) return Promise.resolve({ count: 0 });
        Object.assign(fila, data);
        return Promise.resolve({ count: 1 });
      }),
    },
  };

  process.env.RESEND_API_KEY = 're_prueba';
  process.env.MAIL_REMITENTE = 'Excellence Chemical <onboarding@resend.dev>';
  process.env.FRONTEND_URL = 'https://excellencechemical.vercel.app';
  const correos: { asunto: string }[] = [];
  (global as any).fetch = jest.fn((_url: string, init: any) => {
    correos.push({ asunto: JSON.parse(init.body).subject });
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('') });
  });

  const servicio = new PedidosService(prisma, new NotificacionesService(prisma));
  const hora = (h: number) => new Date(`2026-09-02T${String(h).padStart(2, '0')}:00:00Z`).toISOString();
  return { servicio, correos, fila, hora };
}

describe('avisos al cliente: flujo completo', () => {
  it('avisa al marcar "salió" y al marcar "entregado", y NUNCA al corregir una fecha', async () => {
    const { servicio, correos, hora } = crearEntorno({ email: 'cliente@empresa.com' });

    await servicio.update(1, { inicioPreparacionEn: hora(8) } as any, 7);
    await servicio.update(1, { preparadoEn: hora(9) } as any, 7);
    expect(correos).toHaveLength(0); // ninguna de estas etapas avisa

    await servicio.update(1, { salioEn: hora(10) } as any, 7);
    expect(correos.map((c) => c.asunto)).toEqual(['Tu pedido PF-PRUEBA salió de nuestro almacén']);

    // CORREGIR la hora de "salió": es lo que probó el usuario. No debe salir otro correo.
    await servicio.update(1, { salioEn: hora(11) } as any, 7);
    await servicio.update(1, { salioEn: hora(12) } as any, 7);
    expect(correos).toHaveLength(1);

    await servicio.update(1, { entregadoEn: hora(13) } as any, 7);
    expect(correos.map((c) => c.asunto)).toEqual([
      'Tu pedido PF-PRUEBA salió de nuestro almacén',
      'Tu pedido PF-PRUEBA fue entregado',
    ]);

    // Y corregir la entrega tampoco reenvía.
    await servicio.update(1, { entregadoEn: hora(14) } as any, 7);
    await servicio.update(1, { salioEn: hora(9) } as any, 7);
    expect(correos).toHaveLength(2);
  });

  it('un cambio de observación o de la fecha de recepción no avisa', async () => {
    const { servicio, correos, hora } = crearEntorno({ email: 'cliente@empresa.com' });
    await servicio.update(1, { salioEn: hora(10) } as any, 7);
    await servicio.update(1, { categoriaObservacion: 'OTRO', detalleObservacion: 'x' } as any, 7);
    await servicio.update(1, { recibidoEn: hora(7) } as any, 7);
    expect(correos).toHaveLength(1);
  });

  it('dos cambios de "salió" a la vez mandan un solo correo', async () => {
    const { servicio, correos, hora } = crearEntorno({ email: 'cliente@empresa.com' });
    await Promise.all([
      servicio.update(1, { salioEn: hora(10) } as any, 7),
      servicio.update(1, { salioEn: hora(10) } as any, 8),
    ]);
    expect(correos).toHaveLength(1);
  });

  it('sin correo del cliente no envía nada en todo el flujo', async () => {
    const { servicio, correos, hora } = crearEntorno({ email: null });
    await servicio.update(1, { salioEn: hora(10) } as any, 7);
    await servicio.update(1, { entregadoEn: hora(13) } as any, 7);
    expect(correos).toHaveLength(0);
  });
});

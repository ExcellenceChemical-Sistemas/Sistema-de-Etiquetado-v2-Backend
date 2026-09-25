import { NotFoundException } from '@nestjs/common';
import { PedidosPublicosService, seguimientoVigente, SEGUIMIENTO_DIAS_TRAS_ENTREGA } from './pedidos-publicos.service';

const dias = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

// Un pedido tal como lo devolvería una consulta SIN `select`: con todo lo interno.
const PEDIDO_COMPLETO = {
  id: 7,
  clienteId: 3,
  cliente: { nombre: 'Farmacia Santa Rosa', numeroDocumento: '20123456789' },
  numeroProforma: 'PF-0042',
  tokenSeguimiento: 'abc',
  recibidoEn: dias(5),
  inicioPreparacionEn: dias(4),
  preparadoEn: null,
  salioEn: null,
  entregadoEn: null,
  categoriaObservacion: 'DEMORA',
  detalleObservacion: 'El cliente debe 3 facturas',
  creadoPorId: 1,
  ultimoEditadoPorId: 2,
};

function crearServicio(pedido: any) {
  // Simula al `select`: devuelve solo las claves pedidas, como haría Prisma.
  const findUnique = jest.fn(({ select }: any) => {
    if (!pedido) return Promise.resolve(null);
    if (!select) return Promise.resolve(pedido);
    return Promise.resolve(Object.fromEntries(Object.keys(select).map((k) => [k, pedido[k]])));
  });
  return { servicio: new PedidosPublicosService({ pedido: { findUnique } } as any), findUnique };
}

describe('seguimientoVigente', () => {
  it('un pedido sin entregar siempre está vigente', () => {
    expect(seguimientoVigente(null)).toBe(true);
  });

  it('un pedido entregado se ve hasta el plazo y después no', () => {
    expect(seguimientoVigente(dias(SEGUIMIENTO_DIAS_TRAS_ENTREGA - 1))).toBe(true);
    expect(seguimientoVigente(dias(SEGUIMIENTO_DIAS_TRAS_ENTREGA + 1))).toBe(false);
  });
});

describe('PedidosPublicosService.obtener', () => {
  it('devuelve proforma, fechas y el estado derivado', async () => {
    const { servicio } = crearServicio(PEDIDO_COMPLETO);
    const r = await servicio.obtener('abc');
    expect(r.numeroProforma).toBe('PF-0042');
    expect(r.estado).toBe('EN_PREPARACION');
    expect(r.recibidoEn).toEqual(PEDIDO_COMPLETO.recibidoEn);
  });

  it('NO expone nada interno: cliente, observación, ids ni el propio token', async () => {
    const { servicio } = crearServicio(PEDIDO_COMPLETO);
    const r = await servicio.obtener('abc');
    expect(Object.keys(r).sort()).toEqual([
      'entregadoEn',
      'estado',
      'inicioPreparacionEn',
      'numeroProforma',
      'preparadoEn',
      'recibidoEn',
      'salioEn',
    ]);
    expect(JSON.stringify(r)).not.toMatch(/Santa Rosa|facturas|20123456789/);
  });

  it('busca por token, no por id', async () => {
    const { servicio, findUnique } = crearServicio(PEDIDO_COMPLETO);
    await servicio.obtener('abc');
    expect(findUnique.mock.calls[0][0].where).toEqual({ tokenSeguimiento: 'abc' });
  });

  it('un token que no existe da 404', async () => {
    const { servicio } = crearServicio(null);
    await expect(servicio.obtener('nada')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('un pedido entregado hace más del plazo da el mismo 404 que uno inexistente', async () => {
    const viejo = { ...PEDIDO_COMPLETO, entregadoEn: dias(SEGUIMIENTO_DIAS_TRAS_ENTREGA + 5) };
    const a = await crearServicio(viejo).servicio.obtener('abc').catch((e) => e);
    const b = await crearServicio(null).servicio.obtener('abc').catch((e) => e);
    expect(a).toBeInstanceOf(NotFoundException);
    expect(a.message).toBe(b.message);
  });
});

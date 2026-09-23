import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma';
import { QR_MARGEN_RETENCION_DIAS } from '../etiquetas/qr-vigencia';
import { LotesService } from './lotes.service';

const DIA_MS = 24 * 60 * 60 * 1000;
const hace = (dias: number) => new Date(Date.now() - dias * DIA_MS);

function crearServicio(opts: { lote?: any; impresos?: { createdAt: Date }[] } = {}) {
  const lote = opts.lote === undefined ? { id: 1, fechaVencimientoOrden: hace(-60) } : opts.lote;
  const prisma: any = {
    lote: {
      findUnique: jest.fn(() => Promise.resolve(lote)),
      delete: jest.fn(() => Promise.resolve(lote)),
      create: jest.fn(({ data }: any) => Promise.resolve({ id: 1, ...data })),
    },
    producto: { findUnique: jest.fn(() => Promise.resolve({ id: 1 })) },
    fabricante: { findUnique: jest.fn(() => Promise.resolve({ id: 1 })) },
    trabajoImpresion: {
      findMany: jest.fn(() => Promise.resolve(opts.impresos ?? [])),
      deleteMany: jest.fn(() => Promise.resolve({ count: 0 })),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { servicio: new LotesService(prisma), prisma };
}

describe('remove — un lote con QR en uso no se elimina', () => {
  it('lote con una etiqueta impresa y QR vigente → Conflict, sin borrar nada', async () => {
    const { servicio, prisma } = crearServicio({ impresos: [{ createdAt: hace(3) }] });

    await expect(servicio.remove(1)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.lote.delete).not.toHaveBeenCalled();
    expect(prisma.trabajoImpresion.deleteMany).not.toHaveBeenCalled();
  });

  it('el mensaje cuenta las etiquetas en singular y plural', async () => {
    const uno = crearServicio({ impresos: [{ createdAt: hace(1) }] });
    await expect(uno.servicio.remove(1)).rejects.toThrow('1 etiqueta impresa con QR en uso');

    const dos = crearServicio({ impresos: [{ createdAt: hace(1) }, { createdAt: hace(2) }] });
    await expect(dos.servicio.remove(1)).rejects.toThrow('2 etiquetas impresas con QR en uso');
  });

  it('si el lote venció hace más que el margen de retención, se puede eliminar', async () => {
    const lote = { id: 1, fechaVencimientoOrden: hace(QR_MARGEN_RETENCION_DIAS + 10) };
    const { servicio, prisma } = crearServicio({ lote, impresos: [{ createdAt: hace(500) }] });

    await servicio.remove(1);
    expect(prisma.lote.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it('sin etiquetas impresas, borra el lote junto con su historial', async () => {
    const { servicio, prisma } = crearServicio();

    await servicio.remove(1);
    expect(prisma.trabajoImpresion.deleteMany).toHaveBeenCalledWith({ where: { loteId: 1 } });
    expect(prisma.lote.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it('solo mira los trabajos IMPRESOS con token (los pendientes o fallidos no bloquean)', async () => {
    const { servicio, prisma } = crearServicio();
    await servicio.remove(1);

    expect(prisma.trabajoImpresion.findMany.mock.calls[0][0].where).toEqual({
      loteId: 1,
      estado: 'IMPRESO',
      token: { not: null },
    });
  });

  it('un lote inexistente → NotFound', async () => {
    const { servicio } = crearServicio({ lote: null });
    await expect(servicio.remove(99)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('create', () => {
  const dto = {
    numeroLote: ' L-1 ',
    fechaFabricacion: '01/2026',
    fechaVencimiento: '03/2027',
    productoId: 1,
    fabricanteId: 1,
  };

  it('normaliza el texto y calcula fechaVencimientoOrden desde la fecha del COA', async () => {
    const { servicio, prisma } = crearServicio();
    await servicio.create(dto as any);

    const data = prisma.lote.create.mock.calls[0][0].data;
    expect(data.numeroLote).toBe('L-1');
    expect(data.fechaVencimiento).toBe('03/2027');
    expect(data.fechaVencimientoOrden).toBeInstanceOf(Date);
  });

  it('producto inexistente → NotFound y no crea', async () => {
    const { servicio, prisma } = crearServicio();
    prisma.producto.findUnique.mockResolvedValueOnce(null);

    await expect(servicio.create(dto as any)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.lote.create).not.toHaveBeenCalled();
  });

  it('un duplicado (P2002) se traduce a Conflict', async () => {
    const { servicio, prisma } = crearServicio();
    prisma.lote.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );

    await expect(servicio.create(dto as any)).rejects.toBeInstanceOf(ConflictException);
  });
});

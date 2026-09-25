import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { UpdatePedidoDto } from './dto/update-pedido.dto';

export type EstadoPedido = 'RECIBIDO' | 'EN_PREPARACION' | 'PREPARADO' | 'SALIO' | 'ENTREGADO';

// No hay columna `estado` en la tabla (ver comentario en schema.prisma): se
// deriva de qué fechas están seteadas, así nunca puede desincronizarse de la
// fecha real de cada etapa.
export function derivarEstado(pedido: {
  inicioPreparacionEn: Date | null;
  preparadoEn: Date | null;
  salioEn: Date | null;
  entregadoEn: Date | null;
}): EstadoPedido {
  if (pedido.entregadoEn) return 'ENTREGADO';
  if (pedido.salioEn) return 'SALIO';
  if (pedido.preparadoEn) return 'PREPARADO';
  if (pedido.inicioPreparacionEn) return 'EN_PREPARACION';
  return 'RECIBIDO';
}

const WHERE_POR_ESTADO: Record<EstadoPedido, Prisma.PedidoWhereInput> = {
  RECIBIDO: { inicioPreparacionEn: null },
  EN_PREPARACION: { inicioPreparacionEn: { not: null }, preparadoEn: null },
  PREPARADO: { preparadoEn: { not: null }, salioEn: null },
  SALIO: { salioEn: { not: null }, entregadoEn: null },
  ENTREGADO: { entregadoEn: { not: null } },
};

const INCLUDE_PEDIDO = {
  cliente: true,
  creadoPor: { select: { id: true, nombre: true } },
  ultimoEditadoPor: { select: { id: true, nombre: true } },
} satisfies Prisma.PedidoInclude;

@Injectable()
export class PedidosService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePedidoDto, creadoPorId: number) {
    const pedido = await this.prisma.pedido.create({
      data: {
        clienteId: dto.clienteId,
        numeroProforma: dto.numeroProforma.trim(),
        recibidoEn: dto.recibidoEn ? new Date(dto.recibidoEn) : undefined,
        creadoPorId,
        ultimoEditadoPorId: creadoPorId,
      },
      include: INCLUDE_PEDIDO,
    });
    return { ...pedido, estado: derivarEstado(pedido) };
  }

  async findAll(estado?: EstadoPedido) {
    const pedidos = await this.prisma.pedido.findMany({
      where: estado ? WHERE_POR_ESTADO[estado] : undefined,
      include: INCLUDE_PEDIDO,
      orderBy: { recibidoEn: 'desc' },
    });
    return pedidos.map((p) => ({ ...p, estado: derivarEstado(p) }));
  }

  async findOne(id: number) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id },
      include: INCLUDE_PEDIDO,
    });
    if (!pedido) {
      throw new NotFoundException(`Pedido con id ${id} no encontrado`);
    }
    return { ...pedido, estado: derivarEstado(pedido) };
  }

  async update(id: number, dto: UpdatePedidoDto, editadoPorId: number) {
    await this.findOne(id);
    const pedido = await this.prisma.pedido.update({
      where: { id },
      data: {
        ...(dto.recibidoEn && { recibidoEn: new Date(dto.recibidoEn) }),
        ...(dto.inicioPreparacionEn && { inicioPreparacionEn: new Date(dto.inicioPreparacionEn) }),
        ...(dto.preparadoEn && { preparadoEn: new Date(dto.preparadoEn) }),
        ...(dto.salioEn && { salioEn: new Date(dto.salioEn) }),
        ...(dto.entregadoEn && { entregadoEn: new Date(dto.entregadoEn) }),
        ...(dto.categoriaObservacion !== undefined && {
          categoriaObservacion: dto.categoriaObservacion,
        }),
        ...(dto.detalleObservacion !== undefined && {
          detalleObservacion: dto.detalleObservacion,
        }),
        ultimoEditadoPorId: editadoPorId,
      },
      include: INCLUDE_PEDIDO,
    });
    return { ...pedido, estado: derivarEstado(pedido) };
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.pedido.delete({ where: { id } });
  }
}

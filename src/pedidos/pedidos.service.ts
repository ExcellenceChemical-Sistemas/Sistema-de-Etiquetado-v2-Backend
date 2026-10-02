import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { validarOrdenCronologico } from '../common/validacion/orden-etapas';
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

export interface CotizacionRelacionada {
  id: number;
  numeroProforma: string | null;
  requerimientoEn: Date;
}

@Injectable()
export class PedidosService {
  constructor(private prisma: PrismaService) {}

  // Misma llave natural que del lado de Cotizacion (numeroProforma de KEYFACIL, sin relación
  // formal en el schema — ver CLAUDE.md), para mostrar en el indicador de Pedidos cuánto tardó
  // realmente el cliente desde que pidió la cotización, no solo desde que almacén recibió el
  // pedido. Bulk (no una consulta por fila) para poder usarse en findAll.
  private async adjuntarCotizacionesRelacionadas<T extends { numeroProforma: string }>(
    pedidos: T[],
  ): Promise<(T & { cotizacionRelacionada: CotizacionRelacionada | null })[]> {
    const proformas = [...new Set(pedidos.map((p) => p.numeroProforma))];
    const cotizaciones = proformas.length
      ? await this.prisma.cotizacion.findMany({
          where: { numeroProforma: { in: proformas } },
          select: { id: true, numeroProforma: true, requerimientoEn: true },
        })
      : [];
    const cotizacionPorProforma = new Map(cotizaciones.map((c) => [c.numeroProforma, c]));
    return pedidos.map((p) => ({
      ...p,
      cotizacionRelacionada: cotizacionPorProforma.get(p.numeroProforma) ?? null,
    }));
  }

  async create(dto: CreatePedidoDto, creadoPorId: number) {
    try {
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
    } catch (error) {
      // P2002: violación de la restricción única de numeroProforma (dos pedidos no pueden
      // compartir el mismo número de proforma).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Ya existe un pedido con la proforma "${dto.numeroProforma.trim()}"`);
      }
      throw error;
    }
  }

  async findAll(estado?: EstadoPedido) {
    const pedidos = await this.prisma.pedido.findMany({
      where: estado ? WHERE_POR_ESTADO[estado] : undefined,
      include: INCLUDE_PEDIDO,
      orderBy: { recibidoEn: 'desc' },
    });
    const conCotizacion = await this.adjuntarCotizacionesRelacionadas(pedidos);
    return conCotizacion.map((p) => ({ ...p, estado: derivarEstado(p) }));
  }

  async findOne(id: number) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id },
      include: INCLUDE_PEDIDO,
    });
    if (!pedido) {
      throw new NotFoundException(`Pedido con id ${id} no encontrado`);
    }
    const [conCotizacion] = await this.adjuntarCotizacionesRelacionadas([pedido]);
    return { ...conCotizacion, estado: derivarEstado(pedido) };
  }

  async update(id: number, dto: UpdatePedidoDto, editadoPorId: number) {
    const actual = await this.findOne(id);

    // Valida con la foto final (lo que ya estaba + lo que llega en este PATCH), no solo los
    // campos que vienen en el DTO: un admin podría corregir una fecha intermedia y romper el
    // orden contra una etapa que no está tocando en este mismo pedido.
    validarOrdenCronologico([
      { label: 'Recibido', valor: dto.recibidoEn ? new Date(dto.recibidoEn) : actual.recibidoEn },
      {
        label: 'Inicio de preparación',
        valor: dto.inicioPreparacionEn ? new Date(dto.inicioPreparacionEn) : actual.inicioPreparacionEn,
      },
      { label: 'Preparado', valor: dto.preparadoEn ? new Date(dto.preparadoEn) : actual.preparadoEn },
      { label: 'Salió', valor: dto.salioEn ? new Date(dto.salioEn) : actual.salioEn },
      { label: 'Entregado', valor: dto.entregadoEn ? new Date(dto.entregadoEn) : actual.entregadoEn },
    ]);

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

  // Invalida el enlace público (/p/<token>) actual y emite uno nuevo, por ejemplo si el
  // cliente perdió el link o se compartió por error. Mismo formato que el que genera la
  // base al crear el pedido (32 hex = 128 bits al azar).
  async regenerarToken(id: number, editadoPorId: number) {
    await this.findOne(id);
    const pedido = await this.prisma.pedido.update({
      where: { id },
      data: {
        tokenSeguimiento: randomBytes(16).toString('hex'),
        ultimoEditadoPorId: editadoPorId,
      },
      include: INCLUDE_PEDIDO,
    });
    return { ...pedido, estado: derivarEstado(pedido) };
  }
}

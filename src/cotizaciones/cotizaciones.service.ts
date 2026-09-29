import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCotizacionDto } from './dto/create-cotizacion.dto';
import { UpdateCotizacionDto } from './dto/update-cotizacion.dto';

export type EstadoCotizacion = 'RECIBIDO' | 'COTIZADO' | 'APROBADO' | 'AVISADO_ALMACEN';

// Sin columna "estado" en la tabla (mismo criterio que Pedido): se deriva de qué fechas están
// seteadas, así nunca se desincroniza de la fecha real de cada etapa.
export function derivarEstadoCotizacion(c: {
  cotizacionEnviadaEn: Date | null;
  pedidoAprobadoEn: Date | null;
  avisoAlmacenEn: Date | null;
}): EstadoCotizacion {
  if (c.avisoAlmacenEn) return 'AVISADO_ALMACEN';
  if (c.pedidoAprobadoEn) return 'APROBADO';
  if (c.cotizacionEnviadaEn) return 'COTIZADO';
  return 'RECIBIDO';
}

const WHERE_POR_ESTADO: Record<EstadoCotizacion, Prisma.CotizacionWhereInput> = {
  RECIBIDO: { cotizacionEnviadaEn: null },
  COTIZADO: { cotizacionEnviadaEn: { not: null }, pedidoAprobadoEn: null },
  APROBADO: { pedidoAprobadoEn: { not: null }, avisoAlmacenEn: null },
  AVISADO_ALMACEN: { avisoAlmacenEn: { not: null } },
};

const INCLUDE_COTIZACION = {
  cliente: true,
  creadoPor: { select: { id: true, nombre: true } },
  ultimoEditadoPor: { select: { id: true, nombre: true } },
} satisfies Prisma.CotizacionInclude;

@Injectable()
export class CotizacionesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateCotizacionDto, creadoPorId: number) {
    const cotizacion = await this.prisma.cotizacion.create({
      data: {
        clienteId: dto.clienteId,
        notas: dto.notas?.trim() || undefined,
        requerimientoEn: dto.requerimientoEn ? new Date(dto.requerimientoEn) : undefined,
        creadoPorId,
        ultimoEditadoPorId: creadoPorId,
      },
      include: INCLUDE_COTIZACION,
    });
    return { ...cotizacion, estado: derivarEstadoCotizacion(cotizacion) };
  }

  async findAll(estado?: EstadoCotizacion) {
    const cotizaciones = await this.prisma.cotizacion.findMany({
      where: estado ? WHERE_POR_ESTADO[estado] : undefined,
      include: INCLUDE_COTIZACION,
      orderBy: { requerimientoEn: 'desc' },
    });
    return cotizaciones.map((c) => ({ ...c, estado: derivarEstadoCotizacion(c) }));
  }

  async findOne(id: number) {
    const cotizacion = await this.prisma.cotizacion.findUnique({
      where: { id },
      include: INCLUDE_COTIZACION,
    });
    if (!cotizacion) {
      throw new NotFoundException(`Cotización con id ${id} no encontrada`);
    }
    return { ...cotizacion, estado: derivarEstadoCotizacion(cotizacion) };
  }

  async update(id: number, dto: UpdateCotizacionDto, editadoPorId: number) {
    const actual = await this.findOne(id);

    // No se puede marcar "cotización enviada" sin saber la proforma de KEYFACIL — o ya está
    // guardada de antes, o viene en este mismo PATCH.
    const proformaFinal = dto.numeroProforma !== undefined ? dto.numeroProforma.trim() : actual.numeroProforma;
    if (dto.cotizacionEnviadaEn && !proformaFinal) {
      throw new BadRequestException('Para marcar la cotización como enviada hace falta el número de proforma de KEYFACIL');
    }

    try {
      const cotizacion = await this.prisma.cotizacion.update({
        where: { id },
        data: {
          ...(dto.clienteId !== undefined && { clienteId: dto.clienteId }),
          ...(dto.numeroProforma !== undefined && { numeroProforma: dto.numeroProforma.trim() || null }),
          ...(dto.notas !== undefined && { notas: dto.notas.trim() || null }),
          ...(dto.requerimientoEn && { requerimientoEn: new Date(dto.requerimientoEn) }),
          ...(dto.cotizacionEnviadaEn && { cotizacionEnviadaEn: new Date(dto.cotizacionEnviadaEn) }),
          ...(dto.pedidoAprobadoEn && { pedidoAprobadoEn: new Date(dto.pedidoAprobadoEn) }),
          ...(dto.avisoAlmacenEn && { avisoAlmacenEn: new Date(dto.avisoAlmacenEn) }),
          ultimoEditadoPorId: editadoPorId,
        },
        include: INCLUDE_COTIZACION,
      });
      return { ...cotizacion, estado: derivarEstadoCotizacion(cotizacion) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Ya existe una cotización con la proforma "${dto.numeroProforma?.trim()}"`);
      }
      throw error;
    }
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.cotizacion.delete({ where: { id } });
  }

  // Recordatorio (n8n): cotizaciones aprobadas hace más de `horas` que todavía no se avisaron a
  // almacén. Reserva (recordatorioEnviadoEn) con updateMany antes de devolver la lista, mismo
  // patrón que avisoSalioEnviadoEn en Pedidos — así no se manda el mismo aviso dos veces.
  async findPendientesDeRecordatorio(horas: number) {
    const limite = new Date(Date.now() - horas * 3_600_000);
    const candidatas = await this.prisma.cotizacion.findMany({
      where: {
        pedidoAprobadoEn: { not: null, lt: limite },
        avisoAlmacenEn: null,
        recordatorioEnviadoEn: null,
      },
      include: INCLUDE_COTIZACION,
      orderBy: { pedidoAprobadoEn: 'asc' },
    });
    if (candidatas.length === 0) return candidatas;

    const ids = candidatas.map((c) => c.id);
    await this.prisma.cotizacion.updateMany({
      where: { id: { in: ids }, recordatorioEnviadoEn: null },
      data: { recordatorioEnviadoEn: new Date() },
    });
    return candidatas.map((c) => ({ ...c, estado: derivarEstadoCotizacion(c) }));
  }
}

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoCotizacion, Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCotizacionDto } from './dto/create-cotizacion.dto';
import { UpdateCotizacionDto } from './dto/update-cotizacion.dto';

const INCLUDE_COTIZACION = {
  cliente: true,
  creadoPor: { select: { id: true, nombre: true } },
  enviadoPor: { select: { id: true, nombre: true } },
} satisfies Prisma.CotizacionInclude;

@Injectable()
export class CotizacionesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateCotizacionDto, creadoPorId: number) {
    try {
      return await this.prisma.cotizacion.create({
        data: {
          clienteId: dto.clienteId,
          numeroProforma: dto.numeroProforma.trim(),
          notas: dto.notas?.trim() || undefined,
          creadoPorId,
        },
        include: INCLUDE_COTIZACION,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Ya existe una cotización con la proforma "${dto.numeroProforma.trim()}"`);
      }
      throw error;
    }
  }

  findAll(estado?: EstadoCotizacion) {
    return this.prisma.cotizacion.findMany({
      where: estado ? { estado } : undefined,
      include: INCLUDE_COTIZACION,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const cotizacion = await this.prisma.cotizacion.findUnique({
      where: { id },
      include: INCLUDE_COTIZACION,
    });
    if (!cotizacion) {
      throw new NotFoundException(`Cotización con id ${id} no encontrada`);
    }
    return cotizacion;
  }

  async update(id: number, dto: UpdateCotizacionDto) {
    await this.findOne(id);
    try {
      return await this.prisma.cotizacion.update({
        where: { id },
        data: {
          ...(dto.clienteId !== undefined && { clienteId: dto.clienteId }),
          ...(dto.numeroProforma !== undefined && { numeroProforma: dto.numeroProforma.trim() }),
          ...(dto.notas !== undefined && { notas: dto.notas.trim() || null }),
        },
        include: INCLUDE_COTIZACION,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Ya existe una cotización con la proforma "${dto.numeroProforma?.trim()}"`);
      }
      throw error;
    }
  }

  // Para el recordatorio automático (n8n): devuelve las que llevan más de `horas` sin marcarse
  // ENVIADO y sin recordatorio previo, y de una vez reserva el envío (recordatorioEnviadoEn) con
  // un updateMany antes de devolver la lista — mismo patrón que avisoSalioEnviadoEn en Pedidos.
  // Así, si n8n falla al mandar el correo después de esta llamada, no se vuelve a preguntar por
  // la misma cotización en la próxima corrida (hay que resetear el campo a mano si hace falta
  // reintentar).
  async findPendientesDeRecordatorio(horas: number) {
    const limite = new Date(Date.now() - horas * 3_600_000);
    const candidatas = await this.prisma.cotizacion.findMany({
      where: {
        estado: EstadoCotizacion.PENDIENTE_ENVIO,
        createdAt: { lt: limite },
        recordatorioEnviadoEn: null,
      },
      include: INCLUDE_COTIZACION,
      orderBy: { createdAt: 'asc' },
    });
    if (candidatas.length === 0) return candidatas;

    const ids = candidatas.map((c) => c.id);
    await this.prisma.cotizacion.updateMany({
      where: { id: { in: ids }, recordatorioEnviadoEn: null },
      data: { recordatorioEnviadoEn: new Date() },
    });
    return candidatas;
  }

  // Marca que ya se envió a almacén. Solo procede desde PENDIENTE_ENVIO: una cotización ya
  // enviada no se puede "reenviar" desde acá (evita pisar enviadoEn/enviadoPorId por error).
  async marcarEnviada(id: number, enviadoPorId: number) {
    const cotizacion = await this.findOne(id);
    if (cotizacion.estado === EstadoCotizacion.ENVIADO) {
      throw new ConflictException('Esta cotización ya estaba marcada como enviada a almacén');
    }
    return this.prisma.cotizacion.update({
      where: { id },
      data: {
        estado: EstadoCotizacion.ENVIADO,
        enviadoEn: new Date(),
        enviadoPorId,
      },
      include: INCLUDE_COTIZACION,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.cotizacion.delete({ where: { id } });
  }
}

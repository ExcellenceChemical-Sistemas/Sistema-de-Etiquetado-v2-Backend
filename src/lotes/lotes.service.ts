import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { qrVigente } from '../etiquetas/qr-vigencia';
import { parsearFechaVencimiento } from '../common/parsear-fecha-vencimiento';
import { CreateLoteDto } from './dto/create-lote.dto';
import { UpdateLoteDto } from './dto/update-lote.dto';

@Injectable()
export class LotesService {
  constructor(private prisma: PrismaService) {}

  private async validarRelaciones(productoId: number, fabricanteId: number) {
    const [producto, fabricante] = await Promise.all([
      this.prisma.producto.findUnique({ where: { id: productoId } }),
      this.prisma.fabricante.findUnique({ where: { id: fabricanteId } }),
    ]);
    if (!producto) {
      throw new NotFoundException(`Producto con id ${productoId} no encontrado`);
    }
    if (!fabricante) {
      throw new NotFoundException(`Fabricante con id ${fabricanteId} no encontrado`);
    }
  }

  async create(dto: CreateLoteDto) {
    await this.validarRelaciones(dto.productoId, dto.fabricanteId);

    try {
      return await this.prisma.lote.create({
        data: {
          numeroLote: dto.numeroLote.trim(),
          fechaFabricacion: dto.fechaFabricacion.trim(),
          fechaVencimiento: dto.fechaVencimiento.trim(),
          fechaVencimientoOrden: parsearFechaVencimiento(dto.fechaVencimiento),
          productoId: dto.productoId,
          fabricanteId: dto.fabricanteId,
        },
        include: { producto: true, fabricante: true },
      });
    } catch (error) {
      this.handleDuplicado(error);
    }
  }

  findAll() {
    return this.prisma.lote.findMany({
      include: { producto: true, fabricante: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const lote = await this.prisma.lote.findUnique({
      where: { id },
      include: { producto: true, fabricante: true },
    });
    if (!lote) {
      throw new NotFoundException(`Lote con id ${id} no encontrado`);
    }
    return lote;
  }

  async update(id: number, dto: UpdateLoteDto) {
    await this.findOne(id);

    if (dto.productoId || dto.fabricanteId) {
      const actual = await this.prisma.lote.findUniqueOrThrow({ where: { id } });
      await this.validarRelaciones(
        dto.productoId ?? actual.productoId,
        dto.fabricanteId ?? actual.fabricanteId,
      );
    }

    try {
      return await this.prisma.lote.update({
        where: { id },
        data: {
          ...(dto.numeroLote && { numeroLote: dto.numeroLote.trim() }),
          ...(dto.fechaFabricacion && { fechaFabricacion: dto.fechaFabricacion.trim() }),
          ...(dto.fechaVencimiento && {
            fechaVencimiento: dto.fechaVencimiento.trim(),
            fechaVencimientoOrden: parsearFechaVencimiento(dto.fechaVencimiento),
          }),
          ...(dto.productoId && { productoId: dto.productoId }),
          ...(dto.fabricanteId && { fabricanteId: dto.fabricanteId }),
        },
        include: { producto: true, fabricante: true },
      });
    } catch (error) {
      this.handleDuplicado(error);
    }
  }

  async remove(id: number) {
    const lote = await this.findOne(id);
    // Un trabajo IMPRESO con token es el respaldo del QR ya pegado en un envase:
    // mientras el enlace esté vigente, el lote no se puede eliminar. La vigencia
    // depende del vencimiento del propio lote (+ margen de retención), así que
    // no se puede filtrar directo en la consulta — hay que evaluar cada uno.
    const impresos = await this.prisma.trabajoImpresion.findMany({
      where: { loteId: id, estado: 'IMPRESO', token: { not: null } },
      select: { createdAt: true },
    });
    const conQrVigente = impresos.filter((t) =>
      qrVigente({ createdAt: t.createdAt, lote: { fechaVencimientoOrden: lote.fechaVencimientoOrden } }),
    ).length;
    if (conQrVigente > 0) {
      throw new ConflictException(
        `No se puede eliminar: el lote tiene ${conQrVigente} etiqueta${conQrVigente === 1 ? '' : 's'} impresa${conQrVigente === 1 ? '' : 's'} con QR en uso`,
      );
    }
    // El resto del historial (pendientes, fallidas, sin QR vigente) se borra con el lote.
    const [, loteEliminado] = await this.prisma.$transaction([
      this.prisma.trabajoImpresion.deleteMany({ where: { loteId: id } }),
      this.prisma.lote.delete({ where: { id } }),
    ]);
    return loteEliminado;
  }

  // --- COA ---

  async setCoaUrl(id: number, coaUrl: string) {
    await this.findOne(id);
    return this.prisma.lote.update({
      where: { id },
      data: { coaUrl },
      include: { producto: true, fabricante: true },
    });
  }

  async removeCoaUrl(id: number) {
    const lote = await this.findOne(id);
    if (!lote.coaUrl) return lote;
    return this.prisma.lote.update({
      where: { id },
      data: { coaUrl: null },
      include: { producto: true, fabricante: true },
    });
  }

  private handleDuplicado(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(
        'Ya existe un lote con ese número para este producto y fabricante',
      );
    }
    throw error;
  }
}
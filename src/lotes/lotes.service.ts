import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
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
    await this.findOne(id);
    try {
      return await this.prisma.lote.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException(
          'No se puede eliminar: el lote tiene etiquetas generadas en el historial',
        );
      }
      throw error;
    }
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
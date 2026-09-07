import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { normalizarTexto } from '../common/normalizar-texto';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';

@Injectable()
export class ProductosService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateProductoDto) {
    try {
      return await this.prisma.producto.create({
        data: {
          nombre: dto.nombre.trim(),
          nombreNormalizado: normalizarTexto(dto.nombre),
          nfpaSalud: dto.nfpaSalud,
          nfpaInflamabilidad: dto.nfpaInflamabilidad,
          nfpaReactividad: dto.nfpaReactividad,
        },
      });
    } catch (error) {
      this.handleDuplicado(error);
    }
  }

  findAll() {
    return this.prisma.producto.findMany({ orderBy: { nombre: 'asc' } });
  }

  async findOne(id: number) {
    const producto = await this.prisma.producto.findUnique({ where: { id } });
    if (!producto) {
      throw new NotFoundException(`Producto con id ${id} no encontrado`);
    }
    return producto;
  }

  async update(id: number, dto: UpdateProductoDto) {
    await this.findOne(id);
    try {
      return await this.prisma.producto.update({
        where: { id },
        data: {
          ...(dto.nombre && {
            nombre: dto.nombre.trim(),
            nombreNormalizado: normalizarTexto(dto.nombre),
          }),
          ...(dto.nfpaSalud !== undefined && { nfpaSalud: dto.nfpaSalud }),
          ...(dto.nfpaInflamabilidad !== undefined && { nfpaInflamabilidad: dto.nfpaInflamabilidad }),
          ...(dto.nfpaReactividad !== undefined && { nfpaReactividad: dto.nfpaReactividad }),
        },
      });
    } catch (error) {
      this.handleDuplicado(error);
    }
  }

  async remove(id: number) {
    await this.findOne(id);
    try {
      return await this.prisma.producto.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException(
          'No se puede eliminar: el producto tiene lotes asociados',
        );
      }
      throw error;
    }
  }

  async setFichaSeguridadUrl(id: number, fichaSeguridadUrl: string) {
    await this.findOne(id);
    return this.prisma.producto.update({
      where: { id },
      data: { fichaSeguridadUrl },
    });
  }

  async removeFichaSeguridadUrl(id: number) {
    const producto = await this.findOne(id);
    if (!producto.fichaSeguridadUrl) return producto;
    return this.prisma.producto.update({
      where: { id },
      data: { fichaSeguridadUrl: null },
    });
  }

  private handleDuplicado(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Ya existe un producto con ese nombre');
    }
    throw error;
  }
}
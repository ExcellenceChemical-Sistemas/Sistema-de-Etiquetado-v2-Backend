import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { normalizarTexto } from '../common/normalizar-texto';
import { CreateProveedorDto } from './dto/create-proveedor.dto';
import { UpdateProveedorDto } from './dto/update-proveedor.dto';

@Injectable()
export class ProveedoresService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateProveedorDto) {
    try {
      return await this.prisma.proveedor.create({
        data: {
          nombre: dto.nombre.trim(),
          nombreNormalizado: normalizarTexto(dto.nombre),
        },
      });
    } catch (error) {
      this.handleDuplicado(error);
    }
  }

  findAll() {
    return this.prisma.proveedor.findMany({ orderBy: { nombre: 'asc' } });
  }

  async findOne(id: number) {
    const proveedor = await this.prisma.proveedor.findUnique({ where: { id } });
    if (!proveedor) {
      throw new NotFoundException(`Proveedor con id ${id} no encontrado`);
    }
    return proveedor;
  }

  async update(id: number, dto: UpdateProveedorDto) {
    await this.findOne(id);
    try {
      return await this.prisma.proveedor.update({
        where: { id },
        data: {
          ...(dto.nombre && {
            nombre: dto.nombre.trim(),
            nombreNormalizado: normalizarTexto(dto.nombre),
          }),
        },
      });
    } catch (error) {
      this.handleDuplicado(error);
    }
  }

  async remove(id: number) {
    await this.findOne(id);
    // Proveedor aún no se relaciona con otras tablas: no hay FK que bloquee el borrado.
    return this.prisma.proveedor.delete({ where: { id } });
  }

  private handleDuplicado(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Ya existe un proveedor con ese nombre');
    }
    throw error;
  }
}
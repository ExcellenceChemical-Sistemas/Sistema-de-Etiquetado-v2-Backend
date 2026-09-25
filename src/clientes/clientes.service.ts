import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { normalizarTexto } from '../common/normalizar-texto';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';

@Injectable()
export class ClientesService {
  constructor(private prisma: PrismaService) {}

  private handleDuplicado(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Ya existe un cliente con ese nombre');
    }
    throw error as Error;
  }

  async create(dto: CreateClienteDto) {
    try {
      return await this.prisma.cliente.create({
        data: {
          nombre: dto.nombre.trim(),
          nombreNormalizado: normalizarTexto(dto.nombre),
          tipoDocumento: dto.tipoDocumento,
          numeroDocumento: dto.numeroDocumento,
          direccion: dto.direccion,
          celular: dto.celular,
          email: dto.email?.trim().toLowerCase(),
          autorizaContactoEn: dto.autorizaContacto ? new Date() : null,
        },
      });
    } catch (error) {
      this.handleDuplicado(error);
    }
  }

  // El frontend trae la lista completa y filtra en memoria (Searchcombobox),
  // igual que ya hace con los combobox de lote — son ~300 clientes, no hace
  // falta búsqueda del lado del servidor.
  findAll() {
    return this.prisma.cliente.findMany({ orderBy: { nombre: 'asc' } });
  }

  async findOne(id: number) {
    const cliente = await this.prisma.cliente.findUnique({ where: { id } });
    if (!cliente) {
      throw new NotFoundException(`Cliente con id ${id} no encontrado`);
    }
    return cliente;
  }

  async update(id: number, dto: UpdateClienteDto) {
    const actual = await this.findOne(id);
    try {
      return await this.prisma.cliente.update({
        where: { id },
        data: {
          ...(dto.nombre !== undefined && {
            nombre: dto.nombre.trim(),
            nombreNormalizado: normalizarTexto(dto.nombre),
          }),
          ...(dto.tipoDocumento !== undefined && { tipoDocumento: dto.tipoDocumento }),
          ...(dto.numeroDocumento !== undefined && { numeroDocumento: dto.numeroDocumento }),
          ...(dto.direccion !== undefined && { direccion: dto.direccion }),
          ...(dto.celular !== undefined && { celular: dto.celular }),
          // Cadena vacía = quitar el correo.
          ...(dto.email !== undefined && { email: dto.email.trim().toLowerCase() || null }),
          // Marcar registra la fecha (sin pisar la de una autorización anterior); desmarcar la retira.
          ...(dto.autorizaContacto === true && {
            autorizaContactoEn: actual.autorizaContactoEn ?? new Date(),
          }),
          ...(dto.autorizaContacto === false && { autorizaContactoEn: null }),
        },
      });
    } catch (error) {
      this.handleDuplicado(error);
    }
  }

  async remove(id: number) {
    await this.findOne(id);
    // `cliente` en Pedido es onDelete: Restrict — un cliente con pedidos
    // registrados no se puede borrar, se avisa antes de que Postgres tire
    // la excepción de FK.
    const conPedidos = await this.prisma.pedido.count({ where: { clienteId: id } });
    if (conPedidos > 0) {
      throw new ConflictException(
        `No se puede eliminar: el cliente tiene ${conPedidos} pedido${conPedidos === 1 ? '' : 's'} registrado${conPedidos === 1 ? '' : 's'}`,
      );
    }
    return this.prisma.cliente.delete({ where: { id } });
  }
}

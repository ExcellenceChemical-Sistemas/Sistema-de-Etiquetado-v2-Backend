import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GenerarEtiquetaDto } from './dto/generar-etiqueta.dto';
import { ActualizarEstadoTrabajoDto } from './dto/actualizar-estado-trabajo.dto';

@Injectable()
export class TrabajosImpresionService {
  constructor(private prisma: PrismaService) {}

  async crear(dto: GenerarEtiquetaDto, creadoPorId: number) {
    const [lote, plantilla] = await Promise.all([
      this.prisma.lote.findUnique({ where: { id: dto.loteId } }),
      this.prisma.plantilla.findUnique({ where: { id: dto.plantillaId } }),
    ]);

    if (!lote) throw new NotFoundException(`Lote con id ${dto.loteId} no encontrado`);
    if (!plantilla) throw new NotFoundException(`Plantilla con id ${dto.plantillaId} no encontrada`);

    const trabajo = await this.prisma.trabajoImpresion.create({
      data: {
        loteId: dto.loteId,
        plantillaId: dto.plantillaId,
        pesoBruto: dto.pesoBruto,
        unidadBruto: dto.unidadBruto,
        cantidadNeta: dto.cantidadNeta,
        unidadNeta: dto.unidadNeta,
        proforma: dto.proforma,
        creadoPorId,
      },
    });

    return { trabajoId: trabajo.id };
  }

  async listarPendientes() {
    const pendientes = await this.prisma.trabajoImpresion.findMany({
      where: { estado: 'PENDIENTE' },
      orderBy: { createdAt: 'asc' },
      include: {
        lote: { include: { producto: true, fabricante: true } },
        plantilla: true,
      },
    });

    return pendientes.map((t) => ({
      id: t.id,
      plantillaArchivo: t.plantilla.archivo,
      producto: t.lote.producto.nombre,
      numeroLote: t.lote.numeroLote,
      fabricante: t.lote.fabricante.nombre,
      fechaFabricacion: t.lote.fechaFabricacion,
      fechaVencimiento: t.lote.fechaVencimiento,
      pesoBruto: t.pesoBruto,
      unidadBruto: t.unidadBruto,
      cantidadNeta: t.cantidadNeta,
      unidadNeta: t.unidadNeta,
      proforma: t.proforma,
      nfpaSalud: t.lote.producto.nfpaSalud,
      nfpaInflamabilidad: t.lote.producto.nfpaInflamabilidad,
      nfpaReactividad: t.lote.producto.nfpaReactividad,
    }));
  }

  async actualizarEstado(id: number, dto: ActualizarEstadoTrabajoDto) {
    const trabajo = await this.prisma.trabajoImpresion.findUnique({ where: { id } });
    if (!trabajo) throw new NotFoundException(`Trabajo ${id} no encontrado`);
    return this.prisma.trabajoImpresion.update({
      where: { id },
      data: { estado: dto.estado, mensajeError: dto.mensajeError ?? null },
    });
  }

  /**
   * Solo lo consulta quien lo creo, o un `esAdmin`. Sin este chequeo cualquier
   * autenticado podia recorrer ids ajenos y leer el estado de trabajos que no
   * son suyos. No le saca nada al flujo real: el frontend hace polling del
   * trabajo que el mismo acaba de encolar.
   *
   * Un trabajo ajeno responde 404, no 403: un 403 confirmaria que ese id
   * existe, que es justo lo que no queremos filtrar. Desde afuera, ajeno e
   * inexistente quedan indistinguibles.
   */
  async obtenerEstado(id: number, usuario: { id: number; esAdmin: boolean }) {
    const trabajo = await this.prisma.trabajoImpresion.findUnique({
      where: { id },
      select: { id: true, estado: true, mensajeError: true, creadoPorId: true },
    });
    if (!trabajo) throw new NotFoundException(`Trabajo ${id} no encontrado`);
    if (!usuario.esAdmin && trabajo.creadoPorId !== usuario.id) {
      throw new NotFoundException(`Trabajo ${id} no encontrado`);
    }

    // Se arma la respuesta campo por campo en vez de devolver `trabajo`:
    // `creadoPorId` se trajo solo para el chequeo de pertenencia y no tiene que
    // salir. La forma queda igual que antes del fix, asi que el frontend no
    // necesita ningun ajuste.
    return { id: trabajo.id, estado: trabajo.estado, mensajeError: trabajo.mensajeError };
  }
}
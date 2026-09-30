import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAusenciaDto } from './dto/create-ausencia.dto';

const INCLUDE_AUSENCIA = {
  usuario: { select: { id: true, nombre: true } },
  registradoPor: { select: { id: true, nombre: true } },
} as const;

@Injectable()
export class AusenciasService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateAusenciaDto, registradoPorId: number) {
    const desde = new Date(dto.desde);
    const hasta = new Date(dto.hasta);
    if (hasta < desde) {
      throw new BadRequestException('La fecha "hasta" no puede ser anterior a "desde"');
    }
    return this.prisma.ausencia.create({
      data: {
        usuarioId: dto.usuarioId,
        desde,
        hasta,
        motivo: dto.motivo?.trim() || undefined,
        registradoPorId,
      },
      include: INCLUDE_AUSENCIA,
    });
  }

  findAll(usuarioId?: number) {
    return this.prisma.ausencia.findMany({
      where: usuarioId ? { usuarioId } : undefined,
      include: INCLUDE_AUSENCIA,
      orderBy: { desde: 'desc' },
    });
  }

  async remove(id: number) {
    const ausencia = await this.prisma.ausencia.findUnique({ where: { id } });
    if (!ausencia) throw new NotFoundException(`Ausencia con id ${id} no encontrada`);
    return this.prisma.ausencia.delete({ where: { id } });
  }

  // Usado por otros módulos (Cotizaciones, a futuro Pedidos) para cruzar fechas de etapa
  // contra ausencias registradas, sin hacer una consulta por registro.
  async obtenerPorUsuarios(usuarioIds: number[]): Promise<Map<number, { desde: Date; hasta: Date; motivo: string | null }[]>> {
    const ids = [...new Set(usuarioIds)];
    if (ids.length === 0) return new Map();
    const ausencias = await this.prisma.ausencia.findMany({
      where: { usuarioId: { in: ids } },
    });
    const mapa = new Map<number, { desde: Date; hasta: Date; motivo: string | null }[]>();
    for (const a of ausencias) {
      const lista = mapa.get(a.usuarioId) ?? [];
      lista.push({ desde: a.desde, hasta: a.hasta, motivo: a.motivo });
      mapa.set(a.usuarioId, lista);
    }
    return mapa;
  }
}

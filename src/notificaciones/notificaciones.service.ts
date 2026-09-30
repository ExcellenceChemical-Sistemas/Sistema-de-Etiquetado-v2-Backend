import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificacionesService {
  constructor(private prisma: PrismaService) {}

  async listarDeUsuario(usuarioId: number, limite = 50) {
    return this.prisma.notificacion.findMany({
      where: { usuarioId },
      orderBy: { createdAt: 'desc' },
      take: limite,
    });
  }

  async contarNoLeidas(usuarioId: number) {
    const cantidad = await this.prisma.notificacion.count({ where: { usuarioId, leidaEn: null } });
    return { cantidad };
  }

  async marcarLeida(id: number, usuarioId: number) {
    const notificacion = await this.prisma.notificacion.findUnique({ where: { id } });
    // Mismo id no existe o es de otro usuario: 404 en ambos casos, no filtra cuáles existen.
    if (!notificacion || notificacion.usuarioId !== usuarioId) {
      throw new NotFoundException(`Notificación con id ${id} no encontrada`);
    }
    if (notificacion.leidaEn) return notificacion;
    return this.prisma.notificacion.update({ where: { id }, data: { leidaEn: new Date() } });
  }

  async marcarTodasLeidas(usuarioId: number) {
    await this.prisma.notificacion.updateMany({
      where: { usuarioId, leidaEn: null },
      data: { leidaEn: new Date() },
    });
    return { ok: true };
  }

  async eliminar(id: number, usuarioId: number) {
    const notificacion = await this.prisma.notificacion.findUnique({ where: { id } });
    // Mismo criterio que marcarLeida: 404 en ambos casos, no filtra cuáles existen.
    if (!notificacion || notificacion.usuarioId !== usuarioId) {
      throw new NotFoundException(`Notificación con id ${id} no encontrada`);
    }
    await this.prisma.notificacion.delete({ where: { id } });
    return { ok: true };
  }
}

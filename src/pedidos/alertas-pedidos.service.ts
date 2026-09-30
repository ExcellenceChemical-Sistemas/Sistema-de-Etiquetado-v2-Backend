import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { horasHabilesEntre } from '../common/fecha/horas-habiles';

const UMBRAL_HORAS_HABILES = 48;
// Cota barata para no traer toda la tabla: a 10h hábiles/día como máximo, 48h hábiles no se
// cumplen en menos de 5 días calendario. Se usa de piso amplio (bien por debajo de eso) y después
// se filtra preciso con horasHabilesEntre().
const DIAS_MINIMOS_CANDIDATO = 4;

@Injectable()
export class AlertasPedidosService {
  private readonly logger = new Logger(AlertasPedidosService.name);

  constructor(private prisma: PrismaService) {}

  @Cron('*/30 * * * *')
  async avisarPedidosVencidos() {
    const ahora = new Date();
    const cotaCalendario = new Date(ahora.getTime() - DIAS_MINIMOS_CANDIDATO * 24 * 3_600_000);

    const candidatos = await this.prisma.pedido.findMany({
      where: {
        entregadoEn: null,
        alerta48hEnviadaEn: null,
        recibidoEn: { lt: cotaCalendario },
      },
      select: {
        id: true,
        numeroProforma: true,
        recibidoEn: true,
        cliente: { select: { nombre: true } },
      },
    });
    if (!candidatos.length) return;

    // Refrigerio de quienes pueden marcar un pedido como entregado (editan PEDIDOS): solo se
    // descuenta la intersección de sus horarios — si están escalonados, siempre hay alguien
    // disponible y no se descuenta nada (ver horasHabilesEntre).
    const editoresPedidos = await this.prisma.usuario.findMany({
      where: {
        activo: true,
        OR: [{ esAdmin: true }, { permisos: { some: { recurso: 'PEDIDOS', puedeEditar: true } } }],
      },
      select: { refrigerioInicioMinutos: true, refrigerioFinMinutos: true },
    });
    const refrigerios = editoresPedidos
      .filter((u) => u.refrigerioInicioMinutos != null && u.refrigerioFinMinutos != null)
      .map((u) => ({ inicioMinutos: u.refrigerioInicioMinutos!, finMinutos: u.refrigerioFinMinutos! }));

    const vencidos = candidatos.filter(
      (p) => horasHabilesEntre(p.recibidoEn, ahora, refrigerios) >= UMBRAL_HORAS_HABILES,
    );
    if (!vencidos.length) return;

    const destinatarios = await this.prisma.usuario.findMany({
      where: {
        activo: true,
        OR: [{ esAdmin: true }, { permisos: { some: { recurso: 'PEDIDOS', puedeVer: true } } }],
      },
      select: { id: true },
    });
    if (!destinatarios.length) return;
    const destinatarioIds = destinatarios.map((u) => u.id);

    for (const pedido of vencidos) {
      await this.prisma.$transaction([
        this.prisma.pedido.update({
          where: { id: pedido.id },
          data: { alerta48hEnviadaEn: ahora },
        }),
        this.prisma.notificacion.createMany({
          data: destinatarioIds.map((usuarioId) => ({
            usuarioId,
            tipo: 'PEDIDO_VENCIDO' as const,
            mensaje: `El pedido ${pedido.numeroProforma} (${pedido.cliente.nombre}) lleva más de 48 horas hábiles sin marcarse como entregado.`,
            pedidoId: pedido.id,
          })),
        }),
      ]);
    }

    this.logger.log(`Alerta de 48h: ${vencidos.length} pedido(s) notificados a ${destinatarioIds.length} usuario(s)`);
  }
}

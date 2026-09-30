import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { horasHabilesEntre, Refrigerio } from '../common/fecha/horas-habiles';

const UMBRAL_HORAS_RECIBIDO = 48;
const UMBRAL_HORAS_SALIO = 24;
// Cotas baratas para no traer toda la tabla: a 10h hábiles/día como máximo, ningún umbral de
// arriba se cumple por debajo de estos días calendario. Piso amplio, después se filtra preciso
// con horasHabilesEntre().
const DIAS_MINIMOS_RECIBIDO = 4;
const DIAS_MINIMOS_SALIO = 2;

@Injectable()
export class AlertasPedidosService {
  private readonly logger = new Logger(AlertasPedidosService.name);

  constructor(private prisma: PrismaService) {}

  @Cron('*/30 * * * *')
  async avisarPedidosVencidos() {
    const ahora = new Date();
    const refrigerios = await this.refrigeriosEditoresPedidos();
    const destinatarioIds = await this.destinatariosPedidos();
    if (!destinatarioIds.length) return;

    await this.avisarSinSalir(ahora, refrigerios, destinatarioIds);
    await this.avisarSalioSinEntregar(ahora, refrigerios, destinatarioIds);
  }

  // Refrigerio de quienes pueden marcar un pedido como entregado (editan PEDIDOS): solo se
  // descuenta la intersección de sus horarios — si están escalonados, siempre hay alguien
  // disponible y no se descuenta nada (ver horasHabilesEntre).
  private async refrigeriosEditoresPedidos(): Promise<Refrigerio[]> {
    const editores = await this.prisma.usuario.findMany({
      where: {
        activo: true,
        OR: [{ esAdmin: true }, { permisos: { some: { recurso: 'PEDIDOS', puedeEditar: true } } }],
      },
      select: { refrigerioInicioMinutos: true, refrigerioFinMinutos: true },
    });
    return editores
      .filter((u) => u.refrigerioInicioMinutos != null && u.refrigerioFinMinutos != null)
      .map((u) => ({ inicioMinutos: u.refrigerioInicioMinutos!, finMinutos: u.refrigerioFinMinutos! }));
  }

  private async destinatariosPedidos(): Promise<number[]> {
    const destinatarios = await this.prisma.usuario.findMany({
      where: {
        activo: true,
        OR: [{ esAdmin: true }, { permisos: { some: { recurso: 'PEDIDOS', puedeVer: true } } }],
      },
      select: { id: true },
    });
    return destinatarios.map((u) => u.id);
  }

  // Pedido que nunca salió y ya pasó el umbral general desde que se recibió.
  private async avisarSinSalir(ahora: Date, refrigerios: Refrigerio[], destinatarioIds: number[]) {
    const cota = new Date(ahora.getTime() - DIAS_MINIMOS_RECIBIDO * 24 * 3_600_000);
    const candidatos = await this.prisma.pedido.findMany({
      where: {
        entregadoEn: null,
        salioEn: null,
        alerta48hEnviadaEn: null,
        recibidoEn: { lt: cota },
      },
      select: { id: true, numeroProforma: true, recibidoEn: true, cliente: { select: { nombre: true } } },
    });
    const vencidos = candidatos.filter(
      (p) => horasHabilesEntre(p.recibidoEn, ahora, refrigerios) >= UMBRAL_HORAS_RECIBIDO,
    );
    if (!vencidos.length) return;

    for (const pedido of vencidos) {
      await this.prisma.$transaction([
        this.prisma.pedido.update({ where: { id: pedido.id }, data: { alerta48hEnviadaEn: ahora } }),
        this.prisma.notificacion.createMany({
          data: destinatarioIds.map((usuarioId) => ({
            usuarioId,
            tipo: 'PEDIDO_VENCIDO' as const,
            mensaje: `El pedido ${pedido.numeroProforma} (${pedido.cliente.nombre}) lleva más de ${UMBRAL_HORAS_RECIBIDO} horas hábiles sin marcarse como entregado.`,
            pedidoId: pedido.id,
          })),
        }),
      ]);
    }
    this.logger.log(`Alerta de ${UMBRAL_HORAS_RECIBIDO}h sin salir: ${vencidos.length} pedido(s) notificados`);
  }

  // Pedido que ya salió pero no se confirmó la entrega — etapa final, umbral más corto.
  private async avisarSalioSinEntregar(ahora: Date, refrigerios: Refrigerio[], destinatarioIds: number[]) {
    const cota = new Date(ahora.getTime() - DIAS_MINIMOS_SALIO * 24 * 3_600_000);
    const candidatos = await this.prisma.pedido.findMany({
      where: {
        entregadoEn: null,
        salioEn: { not: null, lt: cota },
        alertaSalioSinEntregarEnviadaEn: null,
      },
      select: { id: true, numeroProforma: true, salioEn: true, cliente: { select: { nombre: true } } },
    });
    const vencidos = candidatos.filter(
      (p) => horasHabilesEntre(p.salioEn!, ahora, refrigerios) >= UMBRAL_HORAS_SALIO,
    );
    if (!vencidos.length) return;

    for (const pedido of vencidos) {
      await this.prisma.$transaction([
        this.prisma.pedido.update({ where: { id: pedido.id }, data: { alertaSalioSinEntregarEnviadaEn: ahora } }),
        this.prisma.notificacion.createMany({
          data: destinatarioIds.map((usuarioId) => ({
            usuarioId,
            tipo: 'PEDIDO_SALIO_SIN_ENTREGAR' as const,
            mensaje: `El pedido ${pedido.numeroProforma} (${pedido.cliente.nombre}) salió hace más de ${UMBRAL_HORAS_SALIO} horas hábiles y no se marcó como entregado.`,
            pedidoId: pedido.id,
          })),
        }),
      ]);
    }
    this.logger.log(`Alerta de ${UMBRAL_HORAS_SALIO}h sin entregar: ${vencidos.length} pedido(s) notificados`);
  }
}

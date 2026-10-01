import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { CotizacionesService } from './cotizaciones.service';
import { PushService } from '../notificaciones/push.service';
import { horasHabilesEntre, Refrigerio } from '../common/fecha/horas-habiles';

// SLA real: 1h entre aprobación del cliente y aviso a almacén (reloj real, no horas hábiles —
// política previa, sin cambios). Antes lo disparaba un cron de n8n que mandaba un correo; ahora
// es una notificación interna, el correo se revisaba poco.
const HORAS_SLA_AVISO_ALMACEN = 1;

// Cotización sin cotizar (cotizacionEnviadaEn) que tarda mucho desde que llegó el requerimiento
// del cliente. Horas hábiles, no reloj real — igual que las alertas de Pedidos.
const UMBRAL_HORAS_RESPUESTA_LENTA = 24;
const DIAS_MINIMOS_RESPUESTA_LENTA = 2;

@Injectable()
export class AlertasCotizacionesService {
  private readonly logger = new Logger(AlertasCotizacionesService.name);

  constructor(
    private prisma: PrismaService,
    private cotizacionesService: CotizacionesService,
    private push: PushService,
  ) {}

  @Cron('*/15 * * * *')
  async avisarRecordatorioAlmacen() {
    // findPendientesDeRecordatorio ya reserva el envío (recordatorioEnviadoEn) antes de devolver
    // la lista, así que no hace falta otra marca de dedupe acá.
    const pendientes = await this.cotizacionesService.findPendientesDeRecordatorio(HORAS_SLA_AVISO_ALMACEN);
    if (!pendientes.length) return;

    const destinatarioIds = await this.destinatariosCotizaciones();
    if (!destinatarioIds.length) return;

    await this.prisma.notificacion.createMany({
      data: pendientes.flatMap((c) =>
        destinatarioIds.map((usuarioId) => ({
          usuarioId,
          tipo: 'COTIZACION_SIN_AVISO_ALMACEN' as const,
          mensaje: `La cotización de ${c.cliente.nombre}${c.numeroProforma ? ` (${c.numeroProforma})` : ''} está aprobada hace más de ${HORAS_SLA_AVISO_ALMACEN}h sin avisar a almacén.`,
          cotizacionId: c.id,
        })),
      ),
    });

    this.logger.log(
      `Recordatorio de aviso a almacén: ${pendientes.length} cotización(es) notificadas a ${destinatarioIds.length} usuario(s)`,
    );

    for (const c of pendientes) {
      await this.push.enviarA(destinatarioIds, {
        titulo: 'Cotización sin aviso a almacén',
        cuerpo: `${c.cliente.nombre}${c.numeroProforma ? ` (${c.numeroProforma})` : ''} está aprobada hace más de ${HORAS_SLA_AVISO_ALMACEN}h sin avisar a almacén.`,
      });
    }
  }

  @Cron('*/30 * * * *')
  async avisarRespuestaLenta() {
    const ahora = new Date();
    const cota = new Date(ahora.getTime() - DIAS_MINIMOS_RESPUESTA_LENTA * 24 * 3_600_000);

    const candidatas = await this.prisma.cotizacion.findMany({
      where: {
        cotizacionEnviadaEn: null,
        alertaLentaEnviadaEn: null,
        requerimientoEn: { lt: cota },
      },
      select: { id: true, numeroProforma: true, requerimientoEn: true, cliente: { select: { nombre: true } } },
    });
    if (!candidatas.length) return;

    const refrigerios = await this.refrigeriosEditoresCotizaciones();
    const lentas = candidatas.filter(
      (c) => horasHabilesEntre(c.requerimientoEn, ahora, refrigerios) >= UMBRAL_HORAS_RESPUESTA_LENTA,
    );
    if (!lentas.length) return;

    const destinatarioIds = await this.destinatariosCotizaciones();
    if (!destinatarioIds.length) return;

    for (const cotizacion of lentas) {
      await this.prisma.$transaction([
        this.prisma.cotizacion.update({ where: { id: cotizacion.id }, data: { alertaLentaEnviadaEn: ahora } }),
        this.prisma.notificacion.createMany({
          data: destinatarioIds.map((usuarioId) => ({
            usuarioId,
            tipo: 'COTIZACION_RESPUESTA_LENTA' as const,
            mensaje: `La cotización de ${cotizacion.cliente.nombre}${cotizacion.numeroProforma ? ` (${cotizacion.numeroProforma})` : ''} lleva más de ${UMBRAL_HORAS_RESPUESTA_LENTA} horas hábiles sin enviarse al cliente.`,
            cotizacionId: cotizacion.id,
          })),
        }),
      ]);
      await this.push.enviarA(destinatarioIds, {
        titulo: 'Cotización con respuesta lenta',
        cuerpo: `${cotizacion.cliente.nombre}${cotizacion.numeroProforma ? ` (${cotizacion.numeroProforma})` : ''} lleva más de ${UMBRAL_HORAS_RESPUESTA_LENTA}h hábiles sin enviarse al cliente.`,
      });
    }
    this.logger.log(`Alerta de respuesta lenta: ${lentas.length} cotización(es) notificadas`);
  }

  // Destinatarios y refrigerio: quien puede editar Cotizaciones (Joel/Alice, quienes de hecho
  // cotizan y avisan a almacén) + admins. Mismo criterio que AlertasPedidosService con
  // PEDIDOS.puedeEditar/puedeVer.
  private async destinatariosCotizaciones(): Promise<number[]> {
    const usuarios = await this.prisma.usuario.findMany({
      where: {
        activo: true,
        OR: [{ esAdmin: true }, { permisos: { some: { recurso: 'COTIZACIONES', puedeEditar: true } } }],
      },
      select: { id: true },
    });
    return usuarios.map((u) => u.id);
  }

  private async refrigeriosEditoresCotizaciones(): Promise<Refrigerio[]> {
    const usuarios = await this.prisma.usuario.findMany({
      where: {
        activo: true,
        OR: [{ esAdmin: true }, { permisos: { some: { recurso: 'COTIZACIONES', puedeEditar: true } } }],
      },
      select: { refrigerioInicioMinutos: true, refrigerioFinMinutos: true },
    });
    return usuarios
      .filter((u) => u.refrigerioInicioMinutos != null && u.refrigerioFinMinutos != null)
      .map((u) => ({ inicioMinutos: u.refrigerioInicioMinutos!, finMinutos: u.refrigerioFinMinutos! }));
  }
}

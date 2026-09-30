import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { CotizacionesService } from './cotizaciones.service';

// SLA real: 1h entre aprobación del cliente y aviso a almacén. Antes lo disparaba un cron de n8n
// que mandaba un correo; ahora es una notificación interna — el correo se revisaba poco.
const HORAS_SLA_AVISO_ALMACEN = 1;

@Injectable()
export class AlertasCotizacionesService {
  private readonly logger = new Logger(AlertasCotizacionesService.name);

  constructor(
    private prisma: PrismaService,
    private cotizacionesService: CotizacionesService,
  ) {}

  @Cron('*/15 * * * *')
  async avisarRecordatorioAlmacen() {
    // findPendientesDeRecordatorio ya reserva el envío (recordatorioEnviadoEn) antes de devolver
    // la lista, así que no hace falta otra marca de dedupe acá.
    const pendientes = await this.cotizacionesService.findPendientesDeRecordatorio(HORAS_SLA_AVISO_ALMACEN);
    if (!pendientes.length) return;

    // Destinatarios: quien puede editar Cotizaciones (Joel/Alice, quienes de hecho avisan a
    // almacén) + admins. Mismo criterio que AlertasPedidosService con PEDIDOS.puedeEditar.
    const editoresCotizaciones = await this.prisma.usuario.findMany({
      where: {
        activo: true,
        OR: [{ esAdmin: true }, { permisos: { some: { recurso: 'COTIZACIONES', puedeEditar: true } } }],
      },
      select: { id: true },
    });
    if (!editoresCotizaciones.length) return;
    const destinatarioIds = editoresCotizaciones.map((u) => u.id);

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
  }
}

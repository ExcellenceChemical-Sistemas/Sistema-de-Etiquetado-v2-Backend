import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

// Resumen de lo que sigue abierto, no de lo que pasó ese día puntual: cuenta entidades que ya
// dispararon alguna de las 4 alertas puntuales y siguen sin resolverse. Si no hay nada pendiente
// no se manda nada — el objetivo es que un día tranquilo se quede tranquilo (ver CLAUDE.md,
// "notificaciones no deben ser muy tediosas").
@Injectable()
export class ResumenDiarioService {
  private readonly logger = new Logger(ResumenDiarioService.name);

  constructor(private prisma: PrismaService) {}

  @Cron('0 8 * * 1-5')
  async enviarResumenDiario() {
    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);

    // Dedupe simple: un solo resumen por día, sin importar cuántas veces reinicie el proceso.
    const yaEnviado = await this.prisma.notificacion.findFirst({
      where: { tipo: 'RESUMEN_DIARIO', createdAt: { gte: inicioHoy } },
    });
    if (yaEnviado) return;

    const [pedidosVencidos, pedidosSalieronSinEntregar, cotizacionesSinAvisoAlmacen, cotizacionesRespuestaLenta] =
      await Promise.all([
        this.prisma.pedido.count({
          where: { alerta48hEnviadaEn: { not: null }, entregadoEn: null, salioEn: null },
        }),
        this.prisma.pedido.count({
          where: { alertaSalioSinEntregarEnviadaEn: { not: null }, entregadoEn: null },
        }),
        this.prisma.cotizacion.count({
          where: { recordatorioEnviadoEn: { not: null }, avisoAlmacenEn: null },
        }),
        this.prisma.cotizacion.count({
          where: { alertaLentaEnviadaEn: { not: null }, cotizacionEnviadaEn: null },
        }),
      ]);

    const partes: string[] = [];
    if (pedidosVencidos > 0) partes.push(`${pedidosVencidos} pedido(s) vencido(s) sin salir`);
    if (pedidosSalieronSinEntregar > 0) partes.push(`${pedidosSalieronSinEntregar} pedido(s) salieron sin marcarse entregados`);
    if (cotizacionesSinAvisoAlmacen > 0) partes.push(`${cotizacionesSinAvisoAlmacen} cotización(es) sin aviso a almacén`);
    if (cotizacionesRespuestaLenta > 0) partes.push(`${cotizacionesRespuestaLenta} cotización(es) con respuesta lenta`);
    if (!partes.length) return;

    const destinatarioIds = await this.destinatarios();
    if (!destinatarioIds.length) return;

    await this.prisma.notificacion.createMany({
      data: destinatarioIds.map((usuarioId) => ({
        usuarioId,
        tipo: 'RESUMEN_DIARIO' as const,
        mensaje: `Resumen diario: ${partes.join(', ')}.`,
      })),
    });
    this.logger.log(`Resumen diario enviado a ${destinatarioIds.length} usuario(s): ${partes.join(', ')}`);
  }

  // Union de quienes reciben alertas de Pedidos o Cotizaciones + admins, para no dejar afuera a
  // nadie que ya recibe alguna de las alertas puntuales que este resumen agrega.
  private async destinatarios(): Promise<number[]> {
    const usuarios = await this.prisma.usuario.findMany({
      where: {
        activo: true,
        OR: [
          { esAdmin: true },
          { permisos: { some: { recurso: 'PEDIDOS', puedeVer: true } } },
          { permisos: { some: { recurso: 'COTIZACIONES', puedeEditar: true } } },
        ],
      },
      select: { id: true },
    });
    return usuarios.map((u) => u.id);
  }
}

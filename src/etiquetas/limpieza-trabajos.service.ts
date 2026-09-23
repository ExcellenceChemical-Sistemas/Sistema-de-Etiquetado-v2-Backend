import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { qrVigente } from './qr-vigencia';

const RETENCION_DIAS = Number(process.env.RETENCION_TRABAJOS_DIAS ?? 3);

@Injectable()
export class LimpiezaTrabajosService {
  private readonly logger = new Logger(LimpiezaTrabajosService.name);

  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async limpiarTrabajosViejos() {
    const limite = new Date();
    limite.setDate(limite.getDate() - RETENCION_DIAS);

    // Primero se limpian solo los fallidos y los impresos sin token (nunca
    // respaldaron un QR físico).
    const { count: sinToken } = await this.prisma.trabajoImpresion.deleteMany({
      where: {
        OR: [
          { updatedAt: { lt: limite }, estado: 'ERROR' },
          { updatedAt: { lt: limite }, estado: 'IMPRESO', token: null },
        ],
      },
    });

    // Un trabajo IMPRESO con token es el respaldo del QR ya pegado en un envase
    // físico: se conserva hasta que el enlace caduca. Eso ahora depende del
    // vencimiento del lote (+ margen de retención), no de una fecha fija, así
    // que no se puede filtrar directo en la consulta — hay que evaluar cada uno.
    const conToken = await this.prisma.trabajoImpresion.findMany({
      where: { estado: 'IMPRESO', token: { not: null } },
      select: { id: true, createdAt: true, lote: { select: { fechaVencimientoOrden: true } } },
    });
    const vencidosIds = conToken.filter((t) => !qrVigente(t)).map((t) => t.id);
    const { count: vencidos } = vencidosIds.length
      ? await this.prisma.trabajoImpresion.deleteMany({ where: { id: { in: vencidosIds } } })
      : { count: 0 };

    const total = sinToken + vencidos;
    if (total) this.logger.log(`Limpieza: ${total} trabajos eliminados`);
  }
}
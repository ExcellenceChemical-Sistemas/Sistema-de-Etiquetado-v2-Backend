import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { limiteVigenciaQr } from './qr-vigencia';

const RETENCION_DIAS = Number(process.env.RETENCION_TRABAJOS_DIAS ?? 3);

@Injectable()
export class LimpiezaTrabajosService {
  private readonly logger = new Logger(LimpiezaTrabajosService.name);

  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async limpiarTrabajosViejos() {
    const limite = new Date();
    limite.setDate(limite.getDate() - RETENCION_DIAS);

    // Un trabajo IMPRESO con token es el respaldo del QR ya pegado en un envase
    // físico: se conserva hasta que el enlace caduca (QR_VIGENCIA_DIAS, 2 años).
    // Antes se limpian solo los fallidos y los impresos anteriores al QR.
    const resultado = await this.prisma.trabajoImpresion.deleteMany({
      where: {
        OR: [
          { updatedAt: { lt: limite }, estado: 'ERROR' },
          { updatedAt: { lt: limite }, estado: 'IMPRESO', token: null },
          { createdAt: { lt: limiteVigenciaQr() }, token: { not: null } },
        ],
      },
    });

    if (resultado.count) this.logger.log(`Limpieza: ${resultado.count} trabajos eliminados`);
  }
}
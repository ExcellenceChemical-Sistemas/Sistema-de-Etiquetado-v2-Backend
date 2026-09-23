import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * Chequeo de salud para monitoreo (público, sin datos): responde 200 solo si
   * el servidor está arriba Y la base contesta. Un `GET /` que solo devuelve un
   * texto seguiría en verde con la base caída, que es justo lo que interesa
   * detectar. Lo consulta el workflow programado `salud.yml`.
   */
  @Get('salud')
  async salud() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ ok: false, db: false });
    }
    return { ok: true, db: true };
  }
}

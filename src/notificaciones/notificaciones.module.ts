import { Module } from '@nestjs/common';
import { NotificacionesService } from './notificaciones.service';
import { NotificacionesController } from './notificaciones.controller';
import { ResumenDiarioService } from './resumen-diario.service';

@Module({
  controllers: [NotificacionesController],
  providers: [NotificacionesService, ResumenDiarioService],
})
export class NotificacionesModule {}

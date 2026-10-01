import { Module } from '@nestjs/common';
import { NotificacionesService } from './notificaciones.service';
import { NotificacionesController } from './notificaciones.controller';
import { ResumenDiarioService } from './resumen-diario.service';
import { PushService } from './push.service';

@Module({
  controllers: [NotificacionesController],
  providers: [NotificacionesService, ResumenDiarioService, PushService],
  exports: [PushService],
})
export class NotificacionesModule {}

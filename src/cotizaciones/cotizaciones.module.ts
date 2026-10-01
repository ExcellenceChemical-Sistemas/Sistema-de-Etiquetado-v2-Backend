import { Module } from '@nestjs/common';
import { CotizacionesService } from './cotizaciones.service';
import { CotizacionesController } from './cotizaciones.controller';
import { AlertasCotizacionesService } from './alertas-cotizaciones.service';
import { AusenciasModule } from '../ausencias/ausencias.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';

@Module({
  imports: [AusenciasModule, NotificacionesModule],
  controllers: [CotizacionesController],
  providers: [CotizacionesService, AlertasCotizacionesService],
})
export class CotizacionesModule {}

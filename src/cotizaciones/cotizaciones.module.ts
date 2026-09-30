import { Module } from '@nestjs/common';
import { CotizacionesService } from './cotizaciones.service';
import { CotizacionesController } from './cotizaciones.controller';
import { AusenciasModule } from '../ausencias/ausencias.module';

@Module({
  imports: [AusenciasModule],
  controllers: [CotizacionesController],
  providers: [CotizacionesService],
})
export class CotizacionesModule {}

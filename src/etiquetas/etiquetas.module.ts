import { Module } from '@nestjs/common';
import { EtiquetasController } from './etiquetas.controller';
import { EtiquetasPublicasController } from './etiquetas-publicas.controller';
import { TrabajosImpresionService } from './trabajos-impresion.service';
import { EtiquetasPublicasService } from './etiquetas-publicas.service';
import { LimpiezaTrabajosService } from './limpieza-trabajos.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [EtiquetasController, EtiquetasPublicasController],
  providers: [TrabajosImpresionService, EtiquetasPublicasService, LimpiezaTrabajosService],
})
export class EtiquetasModule {}

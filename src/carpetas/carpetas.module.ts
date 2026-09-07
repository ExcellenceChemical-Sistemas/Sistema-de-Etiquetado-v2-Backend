// src/carpetas/carpetas.module.ts
import { Module } from '@nestjs/common';
import { CarpetasController } from './carpetas.controller';
import { CarpetasService } from './carpetas.service';
import { ArchivosController } from './archivos.controller';
import { ArchivosService } from './archivos.service';
import { SupabaseStorageService } from '../storage/supabase-storage.service';
import { AccesoDocumentosService } from './acceso-documentos.service';
import { AccesoCarpetaGuard } from '../common/guards/acceso-carpeta.guard';

@Module({
  controllers: [CarpetasController, ArchivosController],
  providers: [
    CarpetasService,
    ArchivosService,
    SupabaseStorageService,
    AccesoDocumentosService,
    AccesoCarpetaGuard,
  ],
})
export class CarpetasModule {}
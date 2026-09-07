// app.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { FabricantesModule } from './fabricantes/fabricantes.module';
import { ProductosModule } from './productos/productos.module';
import { LotesModule } from './lotes/lotes.module';
import { PlantillasModule } from './plantillas/plantillas.module';
import { EtiquetasModule } from './etiquetas/etiquetas.module';
import { UsuariosModule } from './usuario/usuarios.module';
import { CarpetasModule } from './carpetas/carpetas.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000,   // ventana de 1 minuto
        limit: 100,   // máx. 100 peticiones por IP en esa ventana
      },
    ]),
    ScheduleModule.forRoot(),
    PrismaModule,
    FabricantesModule,
    ProductosModule,
    LotesModule,
    PlantillasModule,
    EtiquetasModule,
    UsuariosModule,
    CarpetasModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
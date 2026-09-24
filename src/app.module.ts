// app.module.ts
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ZodExceptionFilter } from './common/filters/zod-exception.filter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { FabricantesModule } from './fabricantes/fabricantes.module';
import { ProductosModule } from './productos/productos.module';
import { LotesModule } from './lotes/lotes.module';
import { PlantillasModule } from './plantillas/plantillas.module';
import { EtiquetasModule } from './etiquetas/etiquetas.module';
import { UsuariosModule } from './usuario/usuarios.module';
import { CarpetasModule } from './carpetas/carpetas.module';
import { ClientesModule } from './clientes/clientes.module';
import { PedidosModule } from './pedidos/pedidos.module';

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
    ClientesModule,
    PedidosModule,
  ],
  // AppController expone GET /api/salud (monitoreo). Antes no estaba registrado y nunca se servía.
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Un cuerpo que no cumple el esquema Zod responde 400 con el motivo, no 500.
    {
      provide: APP_FILTER,
      useClass: ZodExceptionFilter,
    },
  ],
})
export class AppModule {}
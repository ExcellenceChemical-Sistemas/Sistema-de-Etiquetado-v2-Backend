import { Module } from '@nestjs/common';
import { PedidosService } from './pedidos.service';
import { PedidosController } from './pedidos.controller';
import { PedidosPublicosController } from './pedidos-publicos.controller';
import { PedidosPublicosService } from './pedidos-publicos.service';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';

@Module({
  imports: [NotificacionesModule],
  controllers: [PedidosController, PedidosPublicosController],
  providers: [PedidosService, PedidosPublicosService],
})
export class PedidosModule {}

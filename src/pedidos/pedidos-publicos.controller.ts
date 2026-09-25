import { Controller, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PedidosPublicosService } from './pedidos-publicos.service';

// SIN guards a propósito: es la página que abre el cliente con el enlace que le
// mandó la empresa. La única "credencial" es el token aleatorio del enlace, y por
// eso el límite de peticiones es más bajo que el global (frena adivinar tokens).
@Controller('publico/pedidos')
@Throttle({ default: { limit: 30, ttl: 60000 } })
export class PedidosPublicosController {
  constructor(private readonly publicos: PedidosPublicosService) {}

  @Get(':token')
  obtener(@Param('token') token: string) {
    return this.publicos.obtener(token);
  }
}

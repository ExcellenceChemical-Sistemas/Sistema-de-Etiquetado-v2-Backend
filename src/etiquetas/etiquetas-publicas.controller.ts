import { Controller, Get, Param, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { EtiquetasPublicasService } from './etiquetas-publicas.service';

// SIN guards a propósito: es la página que abre quien escanea el QR de la
// etiqueta. La única "credencial" es el token aleatorio del QR, y por eso el
// límite de peticiones es más bajo que el global (frena adivinar tokens).
@Controller('publico/etiquetas')
@Throttle({ default: { limit: 30, ttl: 60000 } })
export class EtiquetasPublicasController {
  constructor(private readonly publicas: EtiquetasPublicasService) {}

  @Get(':token')
  obtener(@Param('token') token: string) {
    return this.publicas.obtener(token);
  }

  @Get(':token/coa')
  coa(@Param('token') token: string, @Query('descargar') descargar?: string) {
    return this.publicas.obtenerUrlCoa(token, descargar === '1');
  }
}

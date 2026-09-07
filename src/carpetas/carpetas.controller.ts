// src/carpetas/carpetas.controller.ts
import { Controller, Get, Param, ParseIntPipe, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CarpetasService } from './carpetas.service';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { AccesoCarpetaGuard } from '../common/guards/acceso-carpeta.guard';
import { RequiereAccesoCarpeta } from '../common/decorators/requiere-acceso-carpeta.decorator';

@Controller('carpetas')
@UseGuards(SupabaseAuthGuard, AccesoCarpetaGuard)
export class CarpetasController {
  constructor(private readonly carpetasService: CarpetasService) {}

  @Get('raiz')
  listarRaices(@Req() req: Request) {
    // Sin @RequiereAccesoCarpeta: el guard deja pasar, el filtrado de qué
    // raíces se muestran (KPIS / ISO) se hace en el service según acceso real.
    return this.carpetasService.listarRaices((req as any).usuario);
  }

  @Get(':id')
  @RequiereAccesoCarpeta({ accion: 'ver' })
  listarContenido(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.carpetasService.listarContenido(id, (req as any).usuario);
  }

  @Get(':id/ruta')
  @RequiereAccesoCarpeta({ accion: 'ver' })
  obtenerRuta(@Param('id', ParseIntPipe) id: number) {
    return this.carpetasService.obtenerRuta(id);
  }
}
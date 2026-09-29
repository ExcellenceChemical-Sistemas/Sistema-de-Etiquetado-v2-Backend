import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CotizacionesService } from './cotizaciones.service';
import type { EstadoCotizacion } from '../generated/prisma';
import { CreateCotizacionDto } from './dto/create-cotizacion.dto';
import { UpdateCotizacionDto } from './dto/update-cotizacion.dto';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { PermisosGuard } from '../common/guards/permisos.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';

// Referencia liviana de "cotización en camino a almacén" (ver comentario en schema.prisma).
// Gatilla con el mismo recurso PEDIDOS que /clientes y /pedidos: es parte del mismo flujo,
// no amerita un Recurso propio.
@Controller('cotizaciones')
@UseGuards(SupabaseAuthGuard, PermisosGuard)
export class CotizacionesController {
  constructor(private readonly cotizacionesService: CotizacionesService) {}

  @Post()
  @RequierePermiso('PEDIDOS', 'puedeCrear')
  create(@Body() dto: CreateCotizacionDto, @Req() req: Request) {
    const usuario = (req as any).usuario;
    return this.cotizacionesService.create(dto, usuario.id);
  }

  @Get()
  @RequierePermiso('PEDIDOS', 'puedeVer')
  findAll(@Query('estado') estado?: EstadoCotizacion) {
    return this.cotizacionesService.findAll(estado);
  }

  @Get(':id')
  @RequierePermiso('PEDIDOS', 'puedeVer')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.cotizacionesService.findOne(id);
  }

  @Patch(':id')
  @RequierePermiso('PEDIDOS', 'puedeEditar')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCotizacionDto) {
    return this.cotizacionesService.update(id, dto);
  }

  @Post(':id/marcar-enviada')
  @RequierePermiso('PEDIDOS', 'puedeEditar')
  marcarEnviada(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const usuario = (req as any).usuario;
    return this.cotizacionesService.marcarEnviada(id, usuario.id);
  }

  @Delete(':id')
  @RequierePermiso('PEDIDOS', 'puedeEliminar')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.cotizacionesService.remove(id);
  }
}

import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CotizacionesService } from './cotizaciones.service';
import type { EstadoCotizacion } from './cotizaciones.service';
import { CreateCotizacionDto } from './dto/create-cotizacion.dto';
import { UpdateCotizacionDto } from './dto/update-cotizacion.dto';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { PermisosGuard } from '../common/guards/permisos.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';

// Seguimiento del proceso de cotización de Joel (ver comentario en schema.prisma). Tiene su
// propio recurso COTIZACIONES, separado de PEDIDOS: son responsables distintos (Joel cotiza,
// otra persona despacha pedidos), así que necesitan poder tener uno sin el otro.
@Controller('cotizaciones')
@UseGuards(SupabaseAuthGuard, PermisosGuard)
export class CotizacionesController {
  constructor(private readonly cotizacionesService: CotizacionesService) {}

  @Post()
  @RequierePermiso('COTIZACIONES', 'puedeCrear')
  create(@Body() dto: CreateCotizacionDto, @Req() req: Request) {
    const usuario = (req as any).usuario;
    return this.cotizacionesService.create(dto, usuario.id);
  }

  @Get()
  @RequierePermiso('COTIZACIONES', 'puedeVer')
  findAll(@Query('estado') estado?: EstadoCotizacion) {
    return this.cotizacionesService.findAll(estado);
  }

  @Get(':id')
  @RequierePermiso('COTIZACIONES', 'puedeVer')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.cotizacionesService.findOne(id);
  }

  @Patch(':id')
  @RequierePermiso('COTIZACIONES', 'puedeEditar')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCotizacionDto, @Req() req: Request) {
    const usuario = (req as any).usuario;
    return this.cotizacionesService.update(id, dto, usuario.id, !!usuario.esAdmin);
  }

  @Delete(':id')
  @RequierePermiso('COTIZACIONES', 'puedeEliminar')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.cotizacionesService.remove(id);
  }
}

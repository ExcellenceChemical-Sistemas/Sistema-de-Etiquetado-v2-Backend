import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { TrabajosImpresionService } from './trabajos-impresion.service';
import { GenerarEtiquetaDto } from './dto/generar-etiqueta.dto';
import { ActualizarEstadoTrabajoDto } from './dto/actualizar-estado-trabajo.dto';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { PermisosGuard } from '../common/guards/permisos.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { AgentTokenGuard } from '../common/guards/agent-token.guard';

@Controller('etiquetas')
export class EtiquetasController {
  constructor(private readonly trabajos: TrabajosImpresionService) {}

  @Post('generar')
  @UseGuards(SupabaseAuthGuard, PermisosGuard)
  @RequierePermiso('ETIQUETAS', 'puedeCrear')
  async generar(@Body() dto: GenerarEtiquetaDto, @Req() req: Request) {
    const usuario = (req as any).usuario;
    return this.trabajos.crear(dto, usuario.id);
  }

  @Get('historial')
  @UseGuards(SupabaseAuthGuard, PermisosGuard)
  @RequierePermiso('ETIQUETAS', 'puedeVer')
  async historial() {
    return this.trabajos.listarHistorial();
  }

  @Get('trabajos/pendientes')
  @UseGuards(AgentTokenGuard)
  async pendientes() {
    return this.trabajos.listarPendientes();
  }

  @Patch('trabajos/:id/estado')
  @UseGuards(AgentTokenGuard)
  async actualizarEstado(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarEstadoTrabajoDto) {
    return this.trabajos.actualizarEstado(id, dto);
  }

  // Sin @RequierePermiso: consultar el estado del trabajo propio es parte del
  // flujo de quien ya pudo crearlo. La restriccion que importa la aplica el
  // service, que solo devuelve el trabajo al usuario que lo creo.
  @Get('trabajos/:id')
  @UseGuards(SupabaseAuthGuard)
  async estado(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const usuario = (req as any).usuario;
    return this.trabajos.obtenerEstado(id, usuario);
  }
}
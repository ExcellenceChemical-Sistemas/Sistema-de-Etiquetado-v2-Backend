import { Controller, Delete, Get, Param, ParseIntPipe, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { NotificacionesService } from './notificaciones.service';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';

// Sin PermisosGuard a propósito: son notificaciones personales del usuario autenticado, no un
// recurso con permisos por rol (ver SOLO_SESION en cobertura-permisos.spec.ts). El service filtra
// siempre por el id que sale del token, nunca de la ruta.
@Controller('notificaciones')
@UseGuards(SupabaseAuthGuard)
export class NotificacionesController {
  constructor(private readonly notificacionesService: NotificacionesService) {}

  @Get()
  listar(@Req() req: Request) {
    const usuario = (req as any).usuario;
    return this.notificacionesService.listarDeUsuario(usuario.id);
  }

  @Get('no-leidas/cantidad')
  contarNoLeidas(@Req() req: Request) {
    const usuario = (req as any).usuario;
    return this.notificacionesService.contarNoLeidas(usuario.id);
  }

  @Patch('leer-todas')
  marcarTodasLeidas(@Req() req: Request) {
    const usuario = (req as any).usuario;
    return this.notificacionesService.marcarTodasLeidas(usuario.id);
  }

  @Patch(':id/leer')
  marcarLeida(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const usuario = (req as any).usuario;
    return this.notificacionesService.marcarLeida(id, usuario.id);
  }

  @Delete(':id')
  eliminar(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const usuario = (req as any).usuario;
    return this.notificacionesService.eliminar(id, usuario.id);
  }
}

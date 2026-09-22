import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { TrabajosImpresionService } from './trabajos-impresion.service';
import { AgenteEstadoService } from './agente-estado.service';
import { VistaPreviaService } from './vista-previa.service';
import { GenerarEtiquetaDto } from './dto/generar-etiqueta.dto';
import { ActualizarEstadoTrabajoDto } from './dto/actualizar-estado-trabajo.dto';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { PermisosGuard } from '../common/guards/permisos.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { AgentTokenGuard } from '../common/guards/agent-token.guard';

@Controller('etiquetas')
export class EtiquetasController {
  constructor(
    private readonly trabajos: TrabajosImpresionService,
    private readonly agente: AgenteEstadoService,
    private readonly previas: VistaPreviaService,
  ) {}

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

  // --- Estado del agente y de la impresora (alertas) ---

  // El agente avisa cada pocos segundos que está vivo y cómo está la impresora.
  @Post('agente/estado')
  @SkipThrottle()
  @UseGuards(AgentTokenGuard)
  reportarEstadoAgente(@Body() body: { impresora?: unknown }) {
    this.agente.registrar(body?.impresora);
    return { ok: true };
  }

  // Lo consulta el frontend para mostrar las alertas: a quien ve o crea etiquetas.
  @Get('agente/estado')
  @UseGuards(SupabaseAuthGuard)
  async estadoAgente(@Req() req: Request) {
    const usuario = (req as any).usuario;
    const permiso = usuario?.permisos?.find((p: any) => p.recurso === 'ETIQUETAS');
    if (!usuario?.esAdmin && !(permiso?.puedeVer || permiso?.puedeCrear)) {
      throw new ForbiddenException('No tienes permiso para esta acción');
    }
    return this.agente.obtener();
  }

  // --- Vista previa (no imprime ni guarda nada) ---

  @Post('vista-previa')
  @UseGuards(SupabaseAuthGuard, PermisosGuard)
  @RequierePermiso('ETIQUETAS', 'puedeCrear')
  async pedirVistaPrevia(@Body() dto: GenerarEtiquetaDto, @Req() req: Request) {
    const usuario = (req as any).usuario;
    const datos = await this.trabajos.datosVistaPrevia(dto);
    return { id: this.previas.crear(datos, usuario.id) };
  }

  @Get('vista-previa/pendientes')
  @SkipThrottle()
  @UseGuards(AgentTokenGuard)
  vistasPreviasPendientes() {
    return this.previas.pendientesParaAgente();
  }

  @Post('vista-previa/:id/imagen')
  @SkipThrottle()
  @UseGuards(AgentTokenGuard)
  guardarVistaPrevia(@Param('id') id: string, @Body() body: { imagenBase64?: string; error?: string }) {
    if (body?.error) {
      this.previas.guardarError(id, body.error);
      return { ok: true };
    }
    if (!body?.imagenBase64 || typeof body.imagenBase64 !== 'string') {
      throw new BadRequestException('Falta la imagen');
    }
    this.previas.guardarImagen(id, body.imagenBase64);
    return { ok: true };
  }

  @Get('vista-previa/:id')
  @UseGuards(SupabaseAuthGuard)
  obtenerVistaPrevia(@Param('id') id: string, @Req() req: Request) {
    return this.previas.obtener(id, (req as any).usuario);
  }

  // --- Cola de impresión (agente) ---

  @Get('trabajos/pendientes')
  @SkipThrottle()
  @UseGuards(AgentTokenGuard)
  async pendientes() {
    return this.trabajos.listarPendientes();
  }

  @Patch('trabajos/:id/estado')
  @SkipThrottle()
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

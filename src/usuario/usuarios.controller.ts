import { Controller, Post, Get, Patch, Delete, Param, ParseIntPipe, Body, Query, UseGuards, UseInterceptors, UploadedFile, BadRequestException, Req } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsuariosService } from './usuarios.service';
import { crearUsuarioSchema, CrearUsuarioDto } from './dto/usuarios.dto';
import { actualizarPermisosSchema, ActualizarPermisosDto } from './dto/actualizar-permisos.dto';
import { actualizarPerfilSchema, ActualizarPerfilDto } from './dto/actualizar-perfil.dto';
import { actualizarAccesosKpisIsoSchema, ActualizarAccesosKpisIsoDto } from './dto/actualizar-accesos-kpis-iso.dto';
import { actualizarActivoSchema, ActualizarActivoDto } from './dto/actualizar-activo.dto';
import { actualizarRolKpisSchema, ActualizarRolKpisDto } from './dto/actualizar-rol-kpis.dto';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { EsAdminGuard } from '../common/guards/es-admin.guard';
import { EsAdminKpisGuard } from '../common/guards/es-admin-kpis.guard';

// NOTA: los guards ahora se aplican por método, no a nivel de clase.
// Motivo: /me debe ser accesible para cualquier usuario autenticado
// (para que el frontend sepa si es Admin), mientras que el resto de
// los endpoints son exclusivos de Admin.
// IMPORTANTE: cualquier endpoint nuevo que se agregue a este controller
// necesita su propio @UseGuards(...) explícito — ya no hereda nada por
// estar en esta clase.
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get('me')
  @UseGuards(SupabaseAuthGuard)
  async obtenerActual(@Req() req: any) {
    // SupabaseAuthGuard ya deja el usuario (con sus permisos) en request.usuario
    return { success: true, data: req.usuario };
  }

  @Patch('me')
  @UseGuards(SupabaseAuthGuard) // sin EsAdminGuard: cualquiera edita su propio perfil
  async actualizarMiPerfil(@Req() req: any, @Body() body: unknown) {
    const dto: ActualizarPerfilDto = actualizarPerfilSchema.parse(body);
    const usuario = await this.usuariosService.actualizarPerfil(req.usuario.id, dto);
    return { success: true, data: usuario };
  }

  // Foto de perfil propia (multipart, campo `file`). Sin EsAdminGuard: cada quien sube la suya.
  @Post('me/avatar')
  @UseGuards(SupabaseAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  async subirMiAvatar(@Req() req: any, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No se recibió ninguna imagen');
    const resultado = await this.usuariosService.subirAvatar(req.usuario.id, file);
    return { success: true, data: resultado };
  }

  @Post()
  @UseGuards(SupabaseAuthGuard, EsAdminGuard)
  async crear(@Body() body: unknown) {
    const dto: CrearUsuarioDto = crearUsuarioSchema.parse(body);
    const usuario = await this.usuariosService.crear(dto);
    return { success: true, data: usuario };
  }

  @Get()
  @UseGuards(SupabaseAuthGuard, EsAdminGuard)
  async listar() {
    const usuarios = await this.usuariosService.listar();
    return { success: true, data: usuarios };
  }

  // Quién desactivó, reactivó, eliminó o cambió permisos de quién. Solo admin general.
  @Get('auditoria')
  @UseGuards(SupabaseAuthGuard, EsAdminGuard)
  async auditoria(@Query('limite') limite?: string) {
    const registros = await this.usuariosService.listarAuditoria(limite ? Number(limite) || undefined : undefined);
    return { success: true, data: registros };
  }

  // Vista reducida (id, nombre, avatarUrl) para el panel de accesos KPIs/ISO.
  // Accesible también por esAdminKpis; el GET / completo sigue solo para esAdmin.
  @Get('lista-basica')
  @UseGuards(SupabaseAuthGuard, EsAdminKpisGuard)
  async listarBasico() {
    const usuarios = await this.usuariosService.listarBasico();
    return { success: true, data: usuarios };
  }

  @Patch(':id/permisos')
  @UseGuards(SupabaseAuthGuard, EsAdminGuard)
  async actualizarPermisos(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Req() req: any) {
    const dto: ActualizarPermisosDto = actualizarPermisosSchema.parse(body);
    const usuario = await this.usuariosService.actualizarPermisos(id, dto.permisos, req.usuario.id);
    return { success: true, data: usuario };
  }

  // Alternativa a DELETE para quien ya tiene historial (el DELETE responde 409).
  @Patch(':id/activo')
  @UseGuards(SupabaseAuthGuard, EsAdminGuard)
  async actualizarActivo(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: any,
  ) {
    const dto: ActualizarActivoDto = actualizarActivoSchema.parse(body);
    const usuario = await this.usuariosService.actualizarActivo(id, dto.activo, req.usuario.id);
    return { success: true, data: usuario };
  }

  @Delete(':id')
  @UseGuards(SupabaseAuthGuard, EsAdminGuard)
  async eliminar(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    await this.usuariosService.eliminar(id, req.usuario.id);
    return { success: true };
  }

  // Asignar/quitar el rol de Admin de KPIs: exclusivo del Admin general.
  // A propósito NO usa EsAdminKpisGuard — el Admin de KPIs no reparte su propio rol.
  @Patch(':id/rol-kpis')
  @UseGuards(SupabaseAuthGuard, EsAdminGuard)
  async actualizarRolKpis(@Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const dto: ActualizarRolKpisDto = actualizarRolKpisSchema.parse(body);
    const usuario = await this.usuariosService.actualizarRolKpis(id, dto);
    return { success: true, data: usuario };
  }

  // Lectura de accesos de KPIs/ISO para precargar el panel de la Admin de KPIs.
  // Mismo guard que el PATCH de abajo a propósito: quien puede escribir estos
  // accesos es exactamente quien puede leerlos, ni más ni menos.
  @Get(':id/accesos-kpis-iso')
  @UseGuards(SupabaseAuthGuard, EsAdminKpisGuard)
  async obtenerAccesosKpisIso(@Param('id', ParseIntPipe) id: number) {
    const usuario = await this.usuariosService.obtenerAccesosKpisIso(id);
    return { success: true, data: usuario };
  }

  @Patch(':id/accesos-kpis-iso')
  @UseGuards(SupabaseAuthGuard, EsAdminKpisGuard)
  async actualizarAccesosKpisIso(@Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const dto: ActualizarAccesosKpisIsoDto = actualizarAccesosKpisIsoSchema.parse(body);
    const usuario = await this.usuariosService.actualizarAccesosKpisIso(id, dto);
    return { success: true, data: usuario };
  }
}
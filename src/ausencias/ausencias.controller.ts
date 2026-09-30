import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AusenciasService } from './ausencias.service';
import { CreateAusenciaDto } from './dto/create-ausencia.dto';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { EsAdminGuard } from '../common/guards/es-admin.guard';

// Solo el Admin general registra ausencias: es un dato sensible (vacaciones/licencias de
// otros usuarios) que además sirve como evidencia de integridad, así que no queda en manos
// de quien administra permisos de un módulo puntual.
@Controller('ausencias')
@UseGuards(SupabaseAuthGuard, EsAdminGuard)
export class AusenciasController {
  constructor(private readonly ausenciasService: AusenciasService) {}

  @Post()
  create(@Body() dto: CreateAusenciaDto, @Req() req: Request) {
    const usuario = (req as any).usuario;
    return this.ausenciasService.create(dto, usuario.id);
  }

  @Get()
  findAll(@Query('usuarioId') usuarioId?: string) {
    return this.ausenciasService.findAll(usuarioId ? Number(usuarioId) : undefined);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.ausenciasService.remove(id);
  }
}

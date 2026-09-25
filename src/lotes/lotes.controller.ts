import {
  BadRequestException, Body, Controller, Delete, Get, NotFoundException,
  Param, ParseIntPipe, Patch, Post, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { LotesService } from './lotes.service';
import { CreateLoteDto } from './dto/create-lote.dto';
import { UpdateLoteDto } from './dto/update-lote.dto';
import { SupabaseStorageService } from '../storage/supabase-storage.service';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { PermisosGuard } from '../common/guards/permisos.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { exigirFirma } from '../common/firma-archivo';

@Controller('lotes')
@UseGuards(SupabaseAuthGuard, PermisosGuard)
export class LotesController {
  constructor(
    private readonly lotesService: LotesService,
    private readonly storageService: SupabaseStorageService,
  ) {}

  @Post()
  @RequierePermiso('LOTES', 'puedeCrear')
  create(@Body() dto: CreateLoteDto) {
    return this.lotesService.create(dto);
  }

  @Get()
  @RequierePermiso('LOTES', 'puedeVer')
  findAll() {
    return this.lotesService.findAll();
  }

  @Get(':id')
  @RequierePermiso('LOTES', 'puedeVer')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.lotesService.findOne(id);
  }

  @Patch(':id')
  @RequierePermiso('LOTES', 'puedeEditar')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLoteDto) {
    return this.lotesService.update(id, dto);
  }

  @Delete(':id')
  @RequierePermiso('LOTES', 'puedeEliminar')
  async remove(@Param('id', ParseIntPipe) id: number) {
    const lote = await this.lotesService.findOne(id);
    const eliminado = await this.lotesService.remove(id);
    if (lote.coaUrl) await this.storageService.deleteCoa(lote.coaUrl);
    return eliminado;
  }

  // --- COA: se trata como parte del recurso LOTES ---

  @Post(':id/coa')
  @RequierePermiso('LOTES', 'puedeEditar') // subir/reemplazar COA = editar el lote
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadCoa(@Param('id', ParseIntPipe) id: number, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    if (file.mimetype !== 'application/pdf') throw new BadRequestException('Solo se acepta PDF');
    exigirFirma(file);

    const lote = await this.lotesService.findOne(id);
    if (lote.coaUrl) await this.storageService.deleteCoa(lote.coaUrl);

    const path = await this.storageService.uploadCoa(id, file);
    return this.lotesService.setCoaUrl(id, path);
  }

  @Get(':id/coa')
  @RequierePermiso('LOTES', 'puedeVer')
  async getCoaUrl(@Param('id', ParseIntPipe) id: number) {
    const lote = await this.lotesService.findOne(id);
    if (!lote.coaUrl) throw new NotFoundException('Este lote no tiene COA cargado');
    const url = await this.storageService.getSignedUrl(lote.coaUrl);
    return { url };
  }

  @Delete(':id/coa')
  @RequierePermiso('LOTES', 'puedeEliminar')
  async deleteCoa(@Param('id', ParseIntPipe) id: number) {
    const lote = await this.lotesService.findOne(id);
    if (lote.coaUrl) await this.storageService.deleteCoa(lote.coaUrl);
    return this.lotesService.removeCoaUrl(id);
  }
}
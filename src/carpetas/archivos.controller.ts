// src/carpetas/archivos.controller.ts
import {
  Controller, Post, Delete, Get, Param, ParseIntPipe,
  UploadedFile, UseGuards, UseInterceptors, Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { ArchivosService } from './archivos.service';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { AccesoCarpetaGuard } from '../common/guards/acceso-carpeta.guard';
import { RequiereAccesoCarpeta } from '../common/decorators/requiere-acceso-carpeta.decorator';

@Controller()
@UseGuards(SupabaseAuthGuard, AccesoCarpetaGuard)
export class ArchivosController {
  constructor(private readonly archivosService: ArchivosService) {}

  @Post('carpetas/:id/archivos')
  @RequiereAccesoCarpeta({ accion: 'crear' }) // :id acá es carpetaId
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  subir(
    @Param('id', ParseIntPipe) carpetaId: number,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    const usuario = (req as any).usuario;
    return this.archivosService.subir(carpetaId, file, usuario.id);
  }

  @Delete('archivos/:id')
  @RequiereAccesoCarpeta({ accion: 'eliminar', esArchivo: true }) // :id acá es archivoId
  eliminar(@Param('id', ParseIntPipe) id: number) {
    return this.archivosService.eliminar(id);
  }

  @Get('archivos/:id/url')
  // 'descargar' y no 'ver': este endpoint entrega la signed URL, que es la
  // descarga misma. `puedeDescargarArchivo` chequea `puedeVerArchivo` primero,
  // así que exigir 'descargar' implica también 'ver' — no hace falta encadenar
  // dos decorators (y el metadata no lo permitiría: es una sola acción).
  @RequiereAccesoCarpeta({ accion: 'descargar', esArchivo: true }) // :id acá es archivoId
  async obtenerUrl(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const url = await this.archivosService.obtenerUrlDescarga(id);
    // esPdfIso ya lo dejó AccesoCarpetaGuard al resolver el acceso, así que no
    // hace falta volver a consultar. No cumple ninguna función de autorización
    // (el guard ya bloqueó lo que no correspondía): le sirve al frontend para
    // saber que este archivo va por el visor propio de ISO y no por descarga
    // directa. El `=== true` normaliza el undefined para que la forma de la
    // respuesta sea siempre la misma.
    return { url, esPdfIso: (req as any).esPdfIso === true };
  }
}
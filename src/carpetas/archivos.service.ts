// src/carpetas/archivos.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../storage/supabase-storage.service';
import { TipoArchivoDocumento } from '../generated/prisma';

function inferirTipoArchivo(mimetype: string): TipoArchivoDocumento {
  if (mimetype === 'application/pdf') return TipoArchivoDocumento.PDF;
  if (
    mimetype === 'application/msword' ||
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) return TipoArchivoDocumento.WORD;
  if (
    mimetype === 'application/vnd.ms-excel' ||
    mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) return TipoArchivoDocumento.EXCEL;
  if (
    mimetype === 'application/vnd.ms-powerpoint' ||
    mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ) return TipoArchivoDocumento.POWERPOINT;
  throw new BadRequestException(
    'Tipo de archivo no soportado (solo PDF, Word, Excel o PowerPoint)',
  );
}

@Injectable()
export class ArchivosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SupabaseStorageService,
  ) {}

  async subir(carpetaId: number, file: Express.Multer.File, usuarioId: number) {
    const carpeta = await this.prisma.carpeta.findUnique({ where: { id: carpetaId } });
    if (!carpeta) throw new NotFoundException('Carpeta no encontrada');

    const tipo = inferirTipoArchivo(file.mimetype);
    const storagePath = await this.storage.uploadDocumento(carpetaId, carpeta.modulo, file);

    return this.prisma.archivo.create({
      data: {
        carpetaId,
        nombre: file.originalname,
        tipo,
        storagePath,
        subidoPorId: usuarioId,
      },
    });
  }

  async eliminar(archivoId: number) {
    const archivo = await this.prisma.archivo.findUnique({ where: { id: archivoId } });
    if (!archivo) throw new NotFoundException('Archivo no encontrado');

    await this.storage.deleteDocumento(archivo.storagePath);
    await this.prisma.archivo.delete({ where: { id: archivoId } });
  }

  async obtenerUrlDescarga(archivoId: number) {
    const archivo = await this.prisma.archivo.findUnique({ where: { id: archivoId } });
    if (!archivo) throw new NotFoundException('Archivo no encontrado');

    return this.storage.getSignedUrlDocumento(archivo.storagePath);
  }
}
// src/storage/supabase-storage.service.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

@Injectable()
export class SupabaseStorageService {
  private readonly client: SupabaseClient;
  private readonly bucket = 'coas'
  private readonly bucketTrabajos = 'trabajos-impresion';
  private readonly bucketDocumentos = 'documentos-gestion'; // KPIs + ISO, un solo bucket

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error(
        'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en las variables de entorno',
      );
    }

    this.client = createClient(url, key);
  }

  private sanearNombreArchivo(nombreOriginal: string): string {
    const partes = nombreOriginal.split('.');
    const ext = partes.length > 1 ? partes.pop() : '';
    const base = partes.join('.')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita tildes
      .replace(/[^a-zA-Z0-9._-]/g, '-')                  // %, espacios, etc. -> "-"
      .replace(/-+/g, '-')                               // colapsa guiones repetidos
      .replace(/^-|-$/g, '');                            // sin guion al inicio/fin

    return ext ? `${base}.${ext}` : base;
  }

  // ── COA (existente) ──────────────────────────────────────
  async uploadCoa(loteId: number, file: Express.Multer.File): Promise<string> {
    const nombreSaneado = this.sanearNombreArchivo(file.originalname);
    const path = `lote-${loteId}/${Date.now()}-${nombreSaneado}`;

    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(path, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      throw new InternalServerErrorException(`Error subiendo COA: ${error.message}`);
    }
    return path;
  }

  async deleteCoa(path: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).remove([path]);
    if (error) {
      throw new InternalServerErrorException(`Error eliminando COA: ${error.message}`);
    }
  }

  async getSignedUrl(path: string, expiresInSeconds = 300, download?: boolean): Promise<string> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(path, expiresInSeconds, download ? { download: true } : undefined);

    if (error || !data) {
      throw new InternalServerErrorException(`Error generando signed URL: ${error?.message}`);
    }
    return data.signedUrl;
  }

  // ── Ficha de seguridad de producto ───────────────────────
  // Vive en el mismo bucket que los COA, bajo el prefijo
  // "ficha-seguridad/" para no mezclarse con los "lote-{id}/".
  async uploadFichaSeguridad(productoId: number, file: Express.Multer.File): Promise<string> {
    const nombreSaneado = this.sanearNombreArchivo(file.originalname);
    const path = `ficha-seguridad/producto-${productoId}/${Date.now()}-${nombreSaneado}`;

    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(path, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      throw new InternalServerErrorException(`Error subiendo ficha de seguridad: ${error.message}`);
    }
    return path;
  }

  async deleteFichaSeguridad(path: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).remove([path]);
    if (error) {
      throw new InternalServerErrorException(`Error eliminando ficha de seguridad: ${error.message}`);
    }
  }

  // ── Trabajos de impresión (existente) ────────────────────
  async uploadTrabajoImpresion(imagen: Buffer): Promise<string> {
    const path = `${Date.now()}-${randomUUID()}.png`;
    const { error } = await this.client.storage
      .from(this.bucketTrabajos)
      .upload(path, imagen, { contentType: 'image/png', upsert: false });
    if (error) throw new InternalServerErrorException(`Error subiendo trabajo de impresión: ${error.message}`);
    return path;
  }

  async deleteTrabajoImpresion(path: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucketTrabajos).remove([path]);
    if (error) throw new InternalServerErrorException(`Error eliminando trabajo de impresión: ${error.message}`);
  }

  async getSignedUrlTrabajoImpresion(path: string, expiresInSeconds = 600): Promise<string> {
    const { data, error } = await this.client.storage
      .from(this.bucketTrabajos)
      .createSignedUrl(path, expiresInSeconds);
    if (error || !data) throw new InternalServerErrorException(`Error generando signed URL: ${error?.message}`);
    return data.signedUrl;
  }

  // ── Documentos KPIs / ISO (nuevo, Fase 3) ────────────────
  // Path: {modulo}/carpeta-{carpetaId}/{timestamp}-{uuid}-{nombre}
  // El uuid evita colisiones si dos archivos llegan en el mismo milisegundo
  // (con COA/trabajos alcanzaba con Date.now() porque son de un solo uso;
  // acá los documentos son de largo plazo, mejor no arriesgar).
  async uploadDocumento(
    carpetaId: number,
    modulo: 'KPIS' | 'ISO',
    file: Express.Multer.File,
  ): Promise<string> {
    const nombreSaneado = this.sanearNombreArchivo(file.originalname);
    const path = `${modulo.toLowerCase()}/carpeta-${carpetaId}/${Date.now()}-${randomUUID()}-${nombreSaneado}`;

    const { error } = await this.client.storage
      .from(this.bucketDocumentos)
      .upload(path, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      throw new InternalServerErrorException(`Error subiendo documento: ${error.message}`);
    }
    return path;
  }

  async deleteDocumento(path: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucketDocumentos).remove([path]);
    if (error) {
      throw new InternalServerErrorException(`Error eliminando documento: ${error.message}`);
    }
  }

  async getSignedUrlDocumento(path: string, expiresInSeconds = 300): Promise<string> {
    const { data, error } = await this.client.storage
      .from(this.bucketDocumentos)
      .createSignedUrl(path, expiresInSeconds);

    if (error || !data) {
      throw new InternalServerErrorException(`Error generando signed URL: ${error?.message}`);
    }
    return data.signedUrl;
  }

  /**
   * Copia física un documento a otra carpeta (usado por el traslado
   * de documentos ISO al clonar un año nuevo). No usa el mismo objeto:
   * crea uno nuevo e independiente, tal como pide la spec.
   */
  async copiarDocumento(
    pathOrigen: string,
    carpetaDestinoId: number,
    modulo: 'KPIS' | 'ISO',
  ): Promise<string> {
    const nombreOriginal = pathOrigen.split('/').pop() ?? 'archivo';
    const pathDestino = `${modulo.toLowerCase()}/carpeta-${carpetaDestinoId}/${Date.now()}-${randomUUID()}-${nombreOriginal}`;

    const { error } = await this.client.storage
      .from(this.bucketDocumentos)
      .copy(pathOrigen, pathDestino);

    if (error) {
      throw new InternalServerErrorException(`Error copiando documento: ${error.message}`);
    }
    return pathDestino;
  }
}
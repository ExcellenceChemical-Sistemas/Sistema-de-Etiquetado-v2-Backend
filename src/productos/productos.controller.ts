import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProductosService } from './productos.service';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { PermisosGuard } from '../common/guards/permisos.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { SupabaseStorageService } from '../storage/supabase-storage.service';

@Controller('productos')
@UseGuards(SupabaseAuthGuard, PermisosGuard)
export class ProductosController {
  constructor(
    private readonly productosService: ProductosService,
    private readonly storageService: SupabaseStorageService,
  ) {}

  @Post()
  @RequierePermiso('PRODUCTOS', 'puedeCrear')
  create(@Body() dto: CreateProductoDto) {
    return this.productosService.create(dto);
  }

  @Get()
  @RequierePermiso('PRODUCTOS', 'puedeVer')
  findAll() {
    return this.productosService.findAll();
  }

  @Get(':id')
  @RequierePermiso('PRODUCTOS', 'puedeVer')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productosService.findOne(id);
  }

  @Patch(':id')
  @RequierePermiso('PRODUCTOS', 'puedeEditar')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductoDto) {
    return this.productosService.update(id, dto);
  }

  @Delete(':id')
  @RequierePermiso('PRODUCTOS', 'puedeEliminar')
  async remove(@Param('id', ParseIntPipe) id: number) {
    const producto = await this.productosService.findOne(id);
    const eliminado = await this.productosService.remove(id);
    // Recien despues de que la fila se borro (puede fallar por lotes
    // asociados) se limpia el archivo, para no dejarlo huerfano.
    if (producto.fichaSeguridadUrl) {
      await this.storageService
        .deleteFichaSeguridad(producto.fichaSeguridadUrl)
        .catch(() => undefined);
    }
    return eliminado;
  }

  // --- Ficha de seguridad: es parte del recurso PRODUCTOS ---

  @Post(':id/ficha-seguridad')
  @RequierePermiso('PRODUCTOS', 'puedeEditar') // subir/reemplazar ficha = editar el producto
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadFichaSeguridad(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No se recibio ningun archivo');
    if (file.mimetype !== 'application/pdf') throw new BadRequestException('Solo se acepta PDF');

    const producto = await this.productosService.findOne(id);

    const path = await this.storageService.uploadFichaSeguridad(id, file);
    const actualizado = await this.productosService.setFichaSeguridadUrl(id, path);

    // La anterior se borra al final: si algo falla antes, el producto
    // sigue apuntando a un archivo que existe.
    if (producto.fichaSeguridadUrl) {
      await this.storageService
        .deleteFichaSeguridad(producto.fichaSeguridadUrl)
        .catch(() => undefined);
    }
    return actualizado;
  }

  @Get(':id/ficha-seguridad')
  @RequierePermiso('PRODUCTOS', 'puedeVer')
  async getFichaSeguridadUrl(@Param('id', ParseIntPipe) id: number) {
    const producto = await this.productosService.findOne(id);
    if (!producto.fichaSeguridadUrl) {
      throw new NotFoundException('Este producto no tiene ficha de seguridad cargada');
    }
    const url = await this.storageService.getSignedUrl(producto.fichaSeguridadUrl);
    return { url };
  }

  @Delete(':id/ficha-seguridad')
  @RequierePermiso('PRODUCTOS', 'puedeEliminar')
  async deleteFichaSeguridad(@Param('id', ParseIntPipe) id: number) {
    const producto = await this.productosService.findOne(id);
    if (producto.fichaSeguridadUrl) {
      await this.storageService.deleteFichaSeguridad(producto.fichaSeguridadUrl);
    }
    return this.productosService.removeFichaSeguridadUrl(id);
  }
}
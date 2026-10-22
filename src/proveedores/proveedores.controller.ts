import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ProveedoresService } from './proveedores.service';
import { CreateProveedorDto } from './dto/create-proveedor.dto';
import { UpdateProveedorDto } from './dto/update-proveedor.dto';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { PermisosGuard } from '../common/guards/permisos.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';

@Controller('proveedores')
@UseGuards(SupabaseAuthGuard, PermisosGuard)
export class ProveedoresController {
  constructor(private readonly proveedoresService: ProveedoresService) {}

  @Post()
  @RequierePermiso('PROVEEDORES', 'puedeCrear')
  create(@Body() dto: CreateProveedorDto) {
    return this.proveedoresService.create(dto);
  }

  @Get()
  @RequierePermiso('PROVEEDORES', 'puedeVer')
  findAll() {
    return this.proveedoresService.findAll();
  }

  @Get(':id')
  @RequierePermiso('PROVEEDORES', 'puedeVer')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.proveedoresService.findOne(id);
  }

  @Patch(':id')
  @RequierePermiso('PROVEEDORES', 'puedeEditar')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProveedorDto) {
    return this.proveedoresService.update(id, dto);
  }

  @Delete(':id')
  @RequierePermiso('PROVEEDORES', 'puedeEliminar')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.proveedoresService.remove(id);
  }
}
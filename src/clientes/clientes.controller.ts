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
import { ClientesService } from './clientes.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { PermisosGuard } from '../common/guards/permisos.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';

// Los clientes tienen su propia vista de gestión (alta, edición, baja) además
// de alimentar el autocomplete de Pedidos, pero se gatillan con el mismo
// recurso PEDIDOS en vez de crear un Recurso aparte.
@Controller('clientes')
@UseGuards(SupabaseAuthGuard, PermisosGuard)
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Post()
  @RequierePermiso('PEDIDOS', 'puedeCrear')
  create(@Body() dto: CreateClienteDto) {
    return this.clientesService.create(dto);
  }

  @Get()
  @RequierePermiso('PEDIDOS', 'puedeVer')
  findAll() {
    return this.clientesService.findAll();
  }

  @Get(':id')
  @RequierePermiso('PEDIDOS', 'puedeVer')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.clientesService.findOne(id);
  }

  @Patch(':id')
  @RequierePermiso('PEDIDOS', 'puedeEditar')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateClienteDto) {
    return this.clientesService.update(id, dto);
  }

  @Delete(':id')
  @RequierePermiso('PEDIDOS', 'puedeEliminar')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.clientesService.remove(id);
  }
}

import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { PedidosService } from './pedidos.service';
import type { EstadoPedido } from './pedidos.service';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { UpdatePedidoDto } from './dto/update-pedido.dto';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { PermisosGuard } from '../common/guards/permisos.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';

@Controller('pedidos')
@UseGuards(SupabaseAuthGuard, PermisosGuard)
export class PedidosController {
  constructor(private readonly pedidosService: PedidosService) {}

  @Post()
  @RequierePermiso('PEDIDOS', 'puedeCrear')
  create(@Body() dto: CreatePedidoDto, @Req() req: Request) {
    const usuario = (req as any).usuario;
    return this.pedidosService.create(dto, usuario.id);
  }

  @Get()
  @RequierePermiso('PEDIDOS', 'puedeVer')
  findAll(@Query('estado') estado?: EstadoPedido) {
    return this.pedidosService.findAll(estado);
  }

  @Get(':id')
  @RequierePermiso('PEDIDOS', 'puedeVer')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.pedidosService.findOne(id);
  }

  @Patch(':id')
  @RequierePermiso('PEDIDOS', 'puedeEditar')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePedidoDto, @Req() req: Request) {
    const usuario = (req as any).usuario;
    return this.pedidosService.update(id, dto, usuario.id);
  }

  @Delete(':id')
  @RequierePermiso('PEDIDOS', 'puedeEliminar')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.pedidosService.remove(id);
  }
}

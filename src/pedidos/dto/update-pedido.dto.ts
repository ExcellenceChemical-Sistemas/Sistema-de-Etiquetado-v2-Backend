import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { CategoriaObservacionPedido } from '../../generated/prisma';

// Un solo endpoint de edición para todo: marcar una etapa (mandando solo esa
// fecha) y corregir una fecha ya marcada usan el mismo PATCH. El frontend
// precarga la hora actual al marcar, pero el usuario puede cambiarla antes
// de enviar — acá no se distingue "marcar" de "corregir", es la misma acción.
export class UpdatePedidoDto {
  @IsOptional()
  @IsDateString()
  recibidoEn?: string;

  @IsOptional()
  @IsDateString()
  inicioPreparacionEn?: string;

  @IsOptional()
  @IsDateString()
  preparadoEn?: string;

  @IsOptional()
  @IsDateString()
  salioEn?: string;

  @IsOptional()
  @IsDateString()
  entregadoEn?: string;

  @IsOptional()
  @IsEnum(CategoriaObservacionPedido)
  categoriaObservacion?: CategoriaObservacionPedido;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  detalleObservacion?: string;
}

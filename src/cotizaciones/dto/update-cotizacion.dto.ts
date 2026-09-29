import { IsDateString, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

// Un solo endpoint de edición para todo: marcar una etapa (mandando solo esa fecha) y corregir
// una fecha ya marcada usan el mismo PATCH — mismo criterio que UpdatePedidoDto.
export class UpdateCotizacionDto {
  @IsOptional()
  @IsInt()
  clienteId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  numeroProforma?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notas?: string;

  @IsOptional()
  @IsDateString()
  requerimientoEn?: string;

  @IsOptional()
  @IsDateString()
  cotizacionEnviadaEn?: string;

  @IsOptional()
  @IsDateString()
  pedidoAprobadoEn?: string;

  @IsOptional()
  @IsDateString()
  avisoAlmacenEn?: string;
}

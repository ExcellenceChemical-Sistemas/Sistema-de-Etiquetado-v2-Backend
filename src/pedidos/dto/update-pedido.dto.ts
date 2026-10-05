import { IsDateString, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
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

  // Deshace una etapa ya marcada (vuelve esa fecha, y las que dependen de ella, a null) en vez de
  // corregirla — mismo criterio que UpdateCotizacionDto.revertirEtapa, para el caso de un clic
  // accidental ("Marcar salió" en el pedido equivocado). Exclusivo de Admin, no se combina con las
  // fechas de arriba en el mismo PATCH. recibidoEn queda afuera porque nunca es null.
  @IsOptional()
  @IsIn(['inicioPreparacionEn', 'preparadoEn', 'salioEn', 'entregadoEn'])
  revertirEtapa?: 'inicioPreparacionEn' | 'preparadoEn' | 'salioEn' | 'entregadoEn';

  // Motivo del deshacer — no se guarda en ningún lado (Pedido no tiene tabla de historial, a
  // diferencia de Cotizacion), pero se exige igual para que quien lo hace lo piense dos veces.
  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivoCorreccion?: string;
}

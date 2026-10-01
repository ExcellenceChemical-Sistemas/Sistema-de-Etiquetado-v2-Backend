import { IsDateString, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

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

  // A diferencia de las 3 de abajo, requerimientoEn se puede editar libremente: no exige
  // esAdmin ni motivoCorreccion (ver comentario en cotizaciones.service.ts, CAMPOS_PROTEGIDOS).
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

  // Obligatorio cuando se corrige (no cuando se marca por primera vez) una de las 3 fechas
  // protegidas de arriba (cotizacionEnviadaEn/pedidoAprobadoEn/avisoAlmacenEn) — ver
  // ForbiddenException en cotizaciones.service.ts. El valor de la fecha en sí se ignora al marcar
  // por primera vez: el service usa la hora real del servidor. No aplica a requerimientoEn.
  // También es el motivo cuando se manda revertirEtapa (abajo).
  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivoCorreccion?: string;

  // Deshace una etapa ya marcada (vuelve esa fecha, y las que dependen de ella, a null) en vez de
  // corregirla. Exclusivo de Admin + motivoCorreccion obligatorio, igual que una corrección — ver
  // el bloque dedicado en cotizaciones.service.ts. Pensado para el caso de un clic accidental en
  // "Marcar pedido aprobado"/etc., donde corregir la fecha no sirve porque la etapa nunca debió
  // marcarse. No se combina con las fechas de arriba en el mismo PATCH.
  @IsOptional()
  @IsIn(['cotizacionEnviadaEn', 'pedidoAprobadoEn', 'avisoAlmacenEn'])
  revertirEtapa?: 'cotizacionEnviadaEn' | 'pedidoAprobadoEn' | 'avisoAlmacenEn';
}

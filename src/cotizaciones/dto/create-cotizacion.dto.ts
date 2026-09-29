import { IsDateString, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

// Se crea apenas llega el pedido del cliente, antes de que exista proforma (KEYFACIL la genera
// recién cuando Joel cotiza) — por eso numeroProforma no va acá, se completa junto con
// cotizacionEnviadaEn en el PATCH (ver UpdateCotizacionDto).
export class CreateCotizacionDto {
  @IsInt()
  clienteId: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notas?: string;

  // Opcional: si no se manda, el service usa la hora actual del servidor.
  @IsOptional()
  @IsDateString()
  requerimientoEn?: string;
}

import { IsDateString, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

// Se crea apenas llega el pedido del cliente, antes de que exista proforma (KEYFACIL la genera
// recién cuando Joel cotiza) — por eso numeroProforma no va acá, se completa junto con
// cotizacionEnviadaEn en el PATCH (ver UpdateCotizacionDto).
//
// requerimientoEn SÍ se puede mandar acá (a diferencia de cotizacionEnviadaEn/pedidoAprobadoEn/
// avisoAlmacenEn, que siempre usan la hora real del servidor): a pedido explícito, deja de estar
// protegida contra carga manual — se puede editar libremente en create() y en update(), sin
// exigir esAdmin ni motivoCorreccion. Si no se manda, el service usa la hora del servidor (mismo
// comportamiento de antes).
export class CreateCotizacionDto {
  @IsInt()
  clienteId: number;

  @IsOptional()
  @IsDateString()
  requerimientoEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notas?: string;
}

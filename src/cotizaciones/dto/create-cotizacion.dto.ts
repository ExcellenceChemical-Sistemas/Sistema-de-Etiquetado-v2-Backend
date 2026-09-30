import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

// Se crea apenas llega el pedido del cliente, antes de que exista proforma (KEYFACIL la genera
// recién cuando Joel cotiza) — por eso numeroProforma no va acá, se completa junto con
// cotizacionEnviadaEn en el PATCH (ver UpdateCotizacionDto).
//
// requerimientoEn NO se recibe acá: el service la fija siempre con la hora real del servidor al
// crear (mismo motivo que cotizacionEnviadaEn/pedidoAprobadoEn/avisoAlmacenEn — que Joel no pueda
// elegir una fecha más antigua "de memoria" para mejorar su indicador). Corregirla después de
// creada es cosa exclusiva de un Admin, vía PATCH con motivoCorreccion.
export class CreateCotizacionDto {
  @IsInt()
  clienteId: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notas?: string;
}

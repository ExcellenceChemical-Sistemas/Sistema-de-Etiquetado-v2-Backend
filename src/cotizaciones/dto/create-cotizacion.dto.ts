import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCotizacionDto {
  @IsInt()
  clienteId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  numeroProforma: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notas?: string;

  // Opcional: si no se manda, el service usa la hora actual del servidor.
  @IsOptional()
  @IsDateString()
  requerimientoEn?: string;
}

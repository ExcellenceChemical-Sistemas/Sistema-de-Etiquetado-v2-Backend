import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

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
}

import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateLoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  numeroLote: string;

  @IsString()
  @IsNotEmpty()
  fechaFabricacion: string;

  @IsString()
  @IsNotEmpty()
  fechaVencimiento: string;

  // Comentario interno opcional. Mandar "" (o solo espacios) lo borra al editar.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  detalle?: string;

  @IsInt()
  productoId: number;

  @IsInt()
  fabricanteId: number;
}
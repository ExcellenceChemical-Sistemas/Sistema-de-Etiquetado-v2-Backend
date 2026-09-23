import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePedidoDto {
  @IsInt()
  clienteId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  numeroProforma: string;

  // Opcional: si no se manda, el service usa la hora actual del servidor.
  @IsOptional()
  @IsDateString()
  recibidoEn?: string;
}

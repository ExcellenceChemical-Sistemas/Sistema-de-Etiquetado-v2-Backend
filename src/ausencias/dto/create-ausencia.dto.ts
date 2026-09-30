import { IsDateString, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAusenciaDto {
  @IsInt()
  usuarioId: number;

  @IsDateString()
  desde: string;

  @IsDateString()
  hasta: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  motivo?: string;
}

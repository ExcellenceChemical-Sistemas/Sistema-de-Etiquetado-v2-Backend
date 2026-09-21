import { IsIn, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, MaxLength, Min } from 'class-validator';

export class GenerarEtiquetaDto {
  @IsInt()
  @IsPositive()
  loteId: number;

  @IsInt()
  @IsPositive()
  plantillaId: number;

  @IsString()
  @IsNotEmpty()
  pesoBruto: string; // texto tal cual (ej. "1.140"), nunca number

  @IsIn(['KG', 'GR'])
  unidadBruto: 'KG' | 'GR';

  @IsOptional()
  @IsString()
  cantidadNeta?: string; // peso o cantidad neta, según unidadNeta

  @IsIn(['KG', 'GR', 'ML', 'L'])
  unidadNeta: 'KG' | 'GR' | 'ML' | 'L';

  @IsOptional()
  @IsInt()
  @Min(1)
  envaseNumero?: number; // "envase 2 de 5": este es el 2

  @IsOptional()
  @IsInt()
  @Min(1)
  envaseTotal?: number; // "envase 2 de 5": este es el 5

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  proforma: string;
}
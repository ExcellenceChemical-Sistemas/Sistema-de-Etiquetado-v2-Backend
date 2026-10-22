import { IsIn, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, MaxLength, Matches } from 'class-validator';

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

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  proforma: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  proveedorId?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}\/\d{2}\/\d{4}$/, { message: 'fechaIngreso debe tener formato dd/mm/aaaa' })
  fechaIngreso?: string;
}
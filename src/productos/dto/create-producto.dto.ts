import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, Max, MaxLength, Min, IsString } from 'class-validator';

export class CreateProductoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  nfpaSalud?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  nfpaInflamabilidad?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  nfpaReactividad?: number;

  // g/ml; para calcular la tara de líquidos (neto en ML/L).
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(30)
  densidad?: number;

  // Pictogramas GHS/SGA: GHS01 (explosivo) ... GHS09 (medio ambiente).
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(['GHS01', 'GHS02', 'GHS03', 'GHS04', 'GHS05', 'GHS06', 'GHS07', 'GHS08', 'GHS09'], { each: true })
  pictogramasGhs?: string[];

  @IsOptional()
  @IsIn(['PELIGRO', 'ATENCION'])
  palabraAdvertencia?: string;

  // Frases H (indicaciones de peligro) y P (consejos de prudencia), una por elemento.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  frasesH?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  frasesP?: string[];
}

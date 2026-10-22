import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateProveedorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre: string;
}
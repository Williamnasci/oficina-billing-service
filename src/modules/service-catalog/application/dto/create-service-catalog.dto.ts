import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
} from 'class-validator';

export class CreateServiceCatalogDto {
  @ApiProperty({ example: 'Troca de óleo' })
  @IsString()
  name: string;

  @ApiProperty({
    example: 'Troca de óleo do motor',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiProperty({ example: 150.0, minimum: 0, maximum: 99999999.99 })
  @IsNumber()
  @Min(0)
  @Max(99999999.99)
  price: number;

  @ApiProperty({ example: true, default: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

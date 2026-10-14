import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
} from 'class-validator';

export class UpdateServiceCatalogDto {
  @ApiProperty({ example: 'Troca de óleo premium', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    example: 'Troca com filtro incluso',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiProperty({ example: 180.0, minimum: 0, maximum: 99999999.99, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(99999999.99)
  price?: number;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

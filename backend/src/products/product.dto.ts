import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Availability, MediaType, ProductCondition, PublicationStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PageQuery } from '../common/pagination';
import { Trim, TrimOrNull } from '../common/validators';

const Spec = () => applyDecorators(TrimOrNull(), IsOptional(), IsString(), MaxLength(160));

export class ExtraSpecDto {
  @ApiProperty() @Trim() @IsString() @Length(1, 40) label: string;
  @ApiProperty() @Trim() @IsString() @Length(1, 160) value: string;
}

/**
 * Caractéristiques techniques : toutes facultatives. Un champ absent est affiché
 * « non renseigné », jamais présenté comme un fait.
 */
export class SpecsDto {
  @ApiPropertyOptional({ example: '6,1 pouces OLED' }) @Spec() screen?: string | null;
  @ApiPropertyOptional() @Spec() processor?: string | null;
  @ApiPropertyOptional({ example: '3 279 mAh' }) @Spec() battery?: string | null;
  @ApiPropertyOptional({ example: '12 Mpx + 12 Mpx' }) @Spec() rearCamera?: string | null;
  @ApiPropertyOptional() @Spec() frontCamera?: string | null;
  @ApiPropertyOptional({ example: '5G, Wi-Fi 6, Bluetooth 5.3' }) @Spec() connectivity?: string | null;
  @ApiPropertyOptional({ example: 'Double SIM' }) @Spec() sim?: string | null;
  @ApiPropertyOptional({ example: 'iOS 17' }) @Spec() os?: string | null;
  @ApiPropertyOptional() @Spec() dimensions?: string | null;
  @ApiPropertyOptional() @Spec() weight?: string | null;
  @ApiPropertyOptional({ example: '87 %' }) @Spec() batteryHealth?: string | null;

  @ApiPropertyOptional({ type: [ExtraSpecDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ExtraSpecDto)
  extra?: ExtraSpecDto[];
}

export class CreateProductDto {
  @ApiProperty() @IsString() @Length(1, 40) brandId: string;
  @ApiPropertyOptional() @TrimOrNull() @IsOptional() @IsString() @Length(1, 40) categoryId?: string | null;

  @ApiProperty({ example: 'iPhone 13' })
  @Trim()
  @IsString()
  @Length(1, 80, { message: 'Le modèle doit contenir entre 1 et 80 caractères.' })
  model: string;

  @ApiPropertyOptional({ description: 'Titre de l’annonce ; généré automatiquement si absent' })
  @Trim()
  @IsOptional()
  @IsString()
  @Length(3, 120)
  title?: string;

  @ApiPropertyOptional() @TrimOrNull() @IsOptional() @IsString() @MaxLength(3000) description?: string | null;

  @ApiProperty({ enum: ProductCondition })
  @IsEnum(ProductCondition, { message: 'État du téléphone non autorisé.' })
  condition: ProductCondition;

  @ApiProperty({ example: 350000, description: 'Prix en FCFA' })
  @Type(() => Number)
  @IsInt({ message: 'Le prix doit être un nombre entier de FCFA.' })
  @Min(100, { message: 'Le prix doit être d’au moins 100 FCFA.' })
  @Max(50_000_000, { message: 'Prix trop élevé.' })
  price: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  stock?: number;

  @ApiPropertyOptional({ enum: Availability })
  @IsOptional()
  @IsEnum(Availability, { message: 'Disponibilité non autorisée.' })
  availability?: Availability;

  @ApiPropertyOptional({ example: 128 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(4096) storageGb?: number | null;
  @ApiPropertyOptional({ example: 4 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(64) ramGb?: number | null;
  @ApiPropertyOptional() @TrimOrNull() @IsOptional() @IsString() @MaxLength(40) color?: string | null;
  @ApiPropertyOptional({ example: '3 mois boutique' }) @TrimOrNull() @IsOptional() @IsString() @MaxLength(160) warranty?: string | null;
  @ApiPropertyOptional() @TrimOrNull() @IsOptional() @IsString() @MaxLength(300) accessories?: string | null;
  @ApiPropertyOptional({ description: 'Défauts déclarés (rayures, réparations…)' })
  @TrimOrNull()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  defects?: string | null;

  @ApiPropertyOptional({ type: SpecsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SpecsDto)
  specs?: SpecsDto;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class StockDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) @Max(10_000) stock: number;
  @ApiPropertyOptional({ enum: Availability }) @IsOptional() @IsEnum(Availability) availability?: Availability;
}

export class SellerProductsQuery extends PageQuery {
  @IsOptional() @IsEnum(PublicationStatus) status?: PublicationStatus;
  @IsOptional() @IsString() @MaxLength(80) q?: string;
}

export class MediaOrderDto {
  @ApiProperty({ type: [String], description: 'Identifiants des médias dans l’ordre souhaité' })
  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  order: string[];

  @ApiPropertyOptional({ description: 'Identifiant de la photo principale' })
  @IsOptional()
  @IsString()
  primaryId?: string;
}

export class CreateUploadDto {
  @ApiProperty({ enum: MediaType }) @IsEnum(MediaType, { message: 'Type de média inconnu.' }) type: MediaType;
  @ApiProperty({ example: 'image/jpeg' }) @IsString() @MaxLength(60) contentType: string;
  @ApiProperty({ description: 'Taille exacte du fichier en octets' }) @Type(() => Number) @IsInt() @Min(1) @Max(2_000_000_000) size: number;
}

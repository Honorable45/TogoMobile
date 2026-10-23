import { Body, Controller, Delete, Get, HttpCode, Injectable, Module, Param, Patch, Post, BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, ApiTags, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, Length, Max, Min } from 'class-validator';
import { AuditService } from '../common/audit.service';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth.decorators';
import { slugify } from '../common/text';
import { Trim, TrimOrNull } from '../common/validators';
import { listedProductWhere } from '../common/visibility';
import { PrismaService } from '../prisma/prisma.service';

class BrandDto {
  @ApiProperty() @Trim() @IsString() @Length(1, 40) name: string;
  @ApiPropertyOptional() @TrimOrNull() @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) logoUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() featured?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000) sortOrder?: number;
}
class UpdateBrandDto extends PartialType(BrandDto) {}

class CategoryDto {
  @ApiProperty() @Trim() @IsString() @Length(1, 60) name: string;
  @ApiPropertyOptional() @TrimOrNull() @IsOptional() @IsString() parentId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000) sortOrder?: number;
}
class UpdateCategoryDto extends PartialType(CategoryDto) {}

@Injectable()
export class ReferentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async brands(all = false) {
    const brands = await this.prisma.brand.findMany({
      where: all ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: { where: listedProductWhere() } } } },
    });
    return brands.map(({ _count, ...b }) => ({ ...b, productCount: _count.products }));
  }

  categories(all = false) {
    return this.prisma.category.findMany({ where: all ? {} : { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  async createBrand(actor: string, dto: BrandDto) {
    const b = await this.prisma.brand.create({ data: { ...dto, slug: slugify(dto.name) } });
    await this.audit.log(actor, 'brand.create', 'Brand', b.id);
    return b;
  }

  async updateBrand(actor: string, id: string, dto: UpdateBrandDto) {
    const b = await this.prisma.brand.update({ where: { id }, data: { ...dto, ...(dto.name ? { slug: slugify(dto.name) } : {}) } });
    await this.audit.log(actor, 'brand.update', 'Brand', id, { fields: Object.keys(dto) });
    return b;
  }

  async createCategory(actor: string, dto: CategoryDto) {
    const c = await this.prisma.category.create({ data: { ...dto, slug: slugify(dto.name) } });
    await this.audit.log(actor, 'category.create', 'Category', c.id);
    return c;
  }

  async updateCategory(actor: string, id: string, dto: UpdateCategoryDto) {
    if (dto.parentId === id) throw new BadRequestException('Une catégorie ne peut pas être sa propre parente.');
    const c = await this.prisma.category.update({ where: { id }, data: { ...dto, ...(dto.name ? { slug: slugify(dto.name) } : {}) } });
    await this.audit.log(actor, 'category.update', 'Category', id, { fields: Object.keys(dto) });
    return c;
  }

  async deleteCategory(actor: string, id: string) {
    const used = await this.prisma.product.count({ where: { categoryId: id } });
    if (used) throw new BadRequestException('Cette catégorie contient des produits : désactivez-la plutôt que de la supprimer.');
    await this.prisma.category.delete({ where: { id } });
    await this.audit.log(actor, 'category.delete', 'Category', id);
  }
}

@ApiTags('Référentiels')
@Controller()
export class ReferentialsController {
  constructor(private readonly ref: ReferentialsService) {}

  @Public() @Get('brands') brands() { return this.ref.brands(); }
  @Public() @Get('categories') categories() { return this.ref.categories(); }

  @Roles('ADMIN') @Get('admin/brands') allBrands() { return this.ref.brands(true); }
  @Roles('ADMIN') @Post('admin/brands') createBrand(@CurrentUser() u: AuthUser, @Body() dto: BrandDto) { return this.ref.createBrand(u.id, dto); }
  @Roles('ADMIN') @Patch('admin/brands/:id') updateBrand(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateBrandDto) {
    return this.ref.updateBrand(u.id, id, dto);
  }

  @Roles('ADMIN') @Get('admin/categories') allCategories() { return this.ref.categories(true); }
  @Roles('ADMIN') @Post('admin/categories') createCategory(@CurrentUser() u: AuthUser, @Body() dto: CategoryDto) { return this.ref.createCategory(u.id, dto); }
  @Roles('ADMIN') @Patch('admin/categories/:id') updateCategory(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.ref.updateCategory(u.id, id, dto);
  }
  @Roles('ADMIN') @HttpCode(204) @Delete('admin/categories/:id') deleteCategory(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.ref.deleteCategory(u.id, id);
  }
}

@Module({ providers: [ReferentialsService], controllers: [ReferentialsController] })
export class ReferentialsModule {}

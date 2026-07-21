import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Headers,
  Query,
  UsePipes,
  ValidationPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role, SystemType } from '@prisma/client';
import type { Request } from '../common/http-types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { BranchContextGuard } from '../tenancy/branch-context.guard';
import { RequireTenantContext } from '../tenancy/tenant-context.decorator';
import { AgendaPetService } from './agenda-pet.service';
import { AgendaPetQueryDto } from './dto/agenda-pet-query.dto';
import { CreateAgendaPetDto } from './dto/create-agenda-pet.dto';
import { UpdateAgendaPetDto } from './dto/update-agenda-pet.dto';

@Controller('agenda-pet')
@UseGuards(JwtAuthGuard, RolesGuard, BranchContextGuard)
@RequireTenantContext({ requireBranch: true, expectedSystemType: SystemType.petshop })
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class AgendaPetController {
  constructor(private readonly service: AgendaPetService) {}

  @Get()
  async findAll(
    @Req() req: Request,
    @Query() query: AgendaPetQueryDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.service.findAll(req.user, query, selectedBranchId);
  }

  @Get(':id')
  findOne(
    @Req() req: Request,
    @Param('id') id: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.service.findOne(id, req.user, selectedBranchId);
  }

  @Post()
  @Roles(Role.Admin, Role.Vendedor)
  create(
    @Req() req: Request,
    @Body() createDto: CreateAgendaPetDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.service.create(createDto, req.user, selectedBranchId);
  }

  @Patch(':id')
  @Roles(Role.Admin, Role.Vendedor)
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() updateDto: UpdateAgendaPetDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.service.update(id, updateDto, req.user, selectedBranchId);
  }

  @Delete(':id')
  @Roles(Role.Admin)
  remove(
    @Req() req: Request,
    @Param('id') id: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.service.remove(id, req.user, selectedBranchId);
  }
}

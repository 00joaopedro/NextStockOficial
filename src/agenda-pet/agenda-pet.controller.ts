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
  ParseIntPipe,
  DefaultValuePipe,
  UsePipes,
  ValidationPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AgendaPetService } from './agenda-pet.service';
import { CreateAgendaPetDto } from './dto/create-agenda-pet.dto';
import { UpdateAgendaPetDto } from './dto/update-agenda-pet.dto';

@Controller('agenda-pet')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AgendaPetController {
  constructor(private readonly service: AgendaPetService) {}

  @Get()
  async findAll(
    @Req() req: Request,
    @Query('atendente') atendente?: string,
    @Query('dateFilterType') dateFilterType?: 'day' | 'week' | 'month' | 'year',
    @Query('dateValue') dateValue?: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(12), ParseIntPipe) limit = 12,
  ) {
    return this.service.findAll({
      page,
      limit,
      atendente,
      dateFilterType,
      dateValue,
      tenantId: req.user?.tenantId ?? undefined,
      selectedBranchId,
      user: req.user,
    });
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
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }))
  create(
    @Req() req: Request,
    @Body() createDto: CreateAgendaPetDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.service.create(createDto, req.user, selectedBranchId);
  }

  @Patch(':id')
  @Roles(Role.Admin, Role.Vendedor)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }))
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

import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from '../common/http-types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PreviewMutationGuard } from '../system/guards/preview-mutation.guard';
import { BranchContextGuard } from '../tenancy/branch-context.guard';
import { RequireTenantContext } from '../tenancy/tenant-context.decorator';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { EmployeeQueryDto } from './dto/employee-query.dto';
import { ResetEmployeePasswordDto } from './dto/reset-employee-password.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateEmployeeStatusDto } from './dto/update-employee-status.dto';
import { EmployeesService } from './employees.service';

@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard, PreviewMutationGuard, BranchContextGuard)
@RequireTenantContext({ requireBranch: true })
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @Roles(Role.Admin)
  findAll(
    @Req() req: Request,
    @Query() query: EmployeeQueryDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.employeesService.findAll(req.user, query, selectedBranchId, devContextMode);
  }

  @Get(':id')
  @Roles(Role.Admin)
  findOne(
    @Req() req: Request,
    @Param('id') id: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.employeesService.findOne(req.user, id, selectedBranchId, devContextMode);
  }

  @Post()
  @Roles(Role.Admin)
  create(
    @Req() req: Request,
    @Body() body: CreateEmployeeDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.employeesService.create(req.user, body, selectedBranchId, devContextMode);
  }

  @Patch(':id')
  @Roles(Role.Admin)
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdateEmployeeDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.employeesService.update(req.user, id, body, selectedBranchId, devContextMode);
  }

  @Patch(':id/status')
  @Roles(Role.Admin)
  updateStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdateEmployeeStatusDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.employeesService.updateStatus(req.user, id, body, selectedBranchId, devContextMode);
  }

  @Delete(':id')
  @Roles(Role.Admin)
  remove(
    @Req() req: Request,
    @Param('id') id: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.employeesService.remove(req.user, id, selectedBranchId, devContextMode);
  }

  @Post(':id/reset-password')
  @Roles(Role.Admin)
  resetPassword(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: ResetEmployeePasswordDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.employeesService.resetPassword(req.user, id, body, selectedBranchId, devContextMode);
  }
}

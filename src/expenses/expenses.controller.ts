import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PreviewMutationGuard } from '../system/guards/preview-mutation.guard';
import { BranchContextGuard } from '../tenancy/branch-context.guard';
import { RequireTenantContext } from '../tenancy/tenant-context.decorator';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import { UpdateExpenseStatusDto } from './dto/update-expense-status.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpensesService } from './expenses.service';
import { PublicRateLimitGuard, RateLimit } from '../security/public-rate-limit.guard';

@Controller('expenses')
@UseGuards(JwtAuthGuard, RolesGuard, PreviewMutationGuard, BranchContextGuard)
@RequireTenantContext({ requireBranch: true })
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get()
  @Roles(Role.Admin, Role.Vendedor, Role.Comprador)
  findAll(
    @Req() req: Request,
    @Query() query: ExpenseQueryDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.expensesService.findAll(req.user, query, selectedBranchId, devContextMode);
  }

  @Get(':id/files/:fileId/download')
  @Roles(Role.Admin, Role.Vendedor, Role.Comprador)
  downloadFile(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.expensesService.downloadFile(req.user, id, fileId, selectedBranchId, devContextMode);
  }

  @Get(':id')
  @Roles(Role.Admin, Role.Vendedor, Role.Comprador)
  findOne(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.expensesService.findOne(req.user, id, selectedBranchId, devContextMode);
  }

  @Post()
  @Roles(Role.Admin, Role.Comprador)
  create(
    @Req() req: Request,
    @Body() body: CreateExpenseDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.expensesService.create(req.user, body, selectedBranchId, devContextMode);
  }

  @Patch(':id')
  @Roles(Role.Admin, Role.Comprador)
  update(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateExpenseDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.expensesService.update(req.user, id, body, selectedBranchId, devContextMode);
  }

  @Patch(':id/status')
  @Roles(Role.Admin)
  updateStatus(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateExpenseStatusDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.expensesService.updateStatus(req.user, id, body, selectedBranchId, devContextMode);
  }

  @Delete(':id')
  @Roles(Role.Admin)
  remove(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.expensesService.remove(req.user, id, selectedBranchId, devContextMode);
  }

  @Post(':id/files/upload')
  @Roles(Role.Admin, Role.Comprador)
  @UseGuards(PublicRateLimitGuard)
  @RateLimit({ max: 12, windowMs: 60_000 })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: Number(process.env.EXPENSE_FILE_MAX_SIZE_MB || 10) * 1024 * 1024,
        files: 1,
      },
    }),
  )
  uploadFile(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: any,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.expensesService.uploadFile(req.user, id, file, selectedBranchId, devContextMode);
  }

  @Delete(':id/files/:fileId')
  @Roles(Role.Admin, Role.Comprador)
  removeFile(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.expensesService.removeFile(req.user, id, fileId, selectedBranchId, devContextMode);
  }
}

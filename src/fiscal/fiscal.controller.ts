import {
  Body,
  Controller,
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
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PreviewMutationGuard } from '../system/guards/preview-mutation.guard';
import { BranchContextGuard } from '../tenancy/branch-context.guard';
import { RequireTenantContext } from '../tenancy/tenant-context.decorator';
import { CancelFiscalDocumentDto } from './dto/cancel-fiscal-document.dto';
import { CompanyFiscalConfigDto } from './dto/company-fiscal-config.dto';
import { CreateNfe55DocumentDto } from './dto/create-nfe55-document.dto';
import { Nfe55DraftQueryDto } from './dto/nfe55-draft-query.dto';
import { SendFiscalDocumentDto } from './dto/send-fiscal-document.dto';
import { FiscalService } from './fiscal.service';

@Controller('fiscal')
@UseGuards(JwtAuthGuard, RolesGuard, PreviewMutationGuard, BranchContextGuard)
@RequireTenantContext({ requireBranch: true })
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class FiscalController {
  constructor(private readonly fiscalService: FiscalService) {}

  @Get('nfe55/draft')
  @Roles(Role.Admin, Role.Vendedor)
  draft(
    @Req() req: Request,
    @Query() query: Nfe55DraftQueryDto,
    @Headers('x-nextstock-branch-id') branchId?: string,
    @Headers('x-nextstock-dev-context') devContext?: string,
  ) {
    return this.fiscalService.getNfe55Draft(
      req.user,
      query,
      branchId,
      devContext,
    );
  }

  @Get('company-config')
  @Roles(Role.Admin, Role.Vendedor)
  companyConfig(
    @Req() req: Request,
    @Headers('x-nextstock-branch-id') branchId?: string,
    @Headers('x-nextstock-dev-context') devContext?: string,
  ) {
    return this.fiscalService.getCompanyConfig(
      req.user,
      branchId,
      devContext,
    );
  }

  @Patch('company-config')
  @Roles(Role.Admin)
  updateCompanyConfig(
    @Req() req: Request,
    @Body() body: CompanyFiscalConfigDto,
    @Headers('x-nextstock-branch-id') branchId?: string,
    @Headers('x-nextstock-dev-context') devContext?: string,
  ) {
    return this.fiscalService.updateCompanyConfig(
      req.user,
      body,
      branchId,
      devContext,
    );
  }

  @Get('documents/:id/xml')
  @Roles(Role.Admin, Role.Vendedor)
  xml(
    @Req() req: Request,
    @Param('id') id: string,
    @Headers('x-nextstock-branch-id') branchId?: string,
    @Headers('x-nextstock-dev-context') devContext?: string,
  ) {
    return this.fiscalService.getFile(req.user, id, 'xml', branchId, devContext);
  }

  @Get('documents/:id/pdf')
  @Roles(Role.Admin, Role.Vendedor)
  pdf(
    @Req() req: Request,
    @Param('id') id: string,
    @Headers('x-nextstock-branch-id') branchId?: string,
    @Headers('x-nextstock-dev-context') devContext?: string,
  ) {
    return this.fiscalService.getFile(req.user, id, 'pdf', branchId, devContext);
  }

  @Get('documents/:id')
  @Roles(Role.Admin, Role.Vendedor)
  findOne(
    @Req() req: Request,
    @Param('id') id: string,
    @Headers('x-nextstock-branch-id') branchId?: string,
    @Headers('x-nextstock-dev-context') devContext?: string,
  ) {
    return this.fiscalService.getDocument(req.user, id, branchId, devContext);
  }

  @Post('documents')
  @Roles(Role.Admin)
  create(
    @Req() req: Request,
    @Body() body: CreateNfe55DocumentDto,
    @Headers('x-nextstock-branch-id') branchId?: string,
    @Headers('x-nextstock-dev-context') devContext?: string,
  ) {
    return this.fiscalService.createDocument(
      req.user,
      body,
      branchId,
      devContext,
    );
  }

  @Post('documents/:id/send')
  @Roles(Role.Admin)
  send(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: SendFiscalDocumentDto,
    @Headers('x-nextstock-branch-id') branchId?: string,
    @Headers('x-nextstock-dev-context') devContext?: string,
  ) {
    return this.fiscalService.sendDocument(
      req.user,
      id,
      body,
      branchId,
      devContext,
    );
  }

  @Post('documents/:id/status')
  @Roles(Role.Admin, Role.Vendedor)
  status(
    @Req() req: Request,
    @Param('id') id: string,
    @Headers('x-nextstock-branch-id') branchId?: string,
    @Headers('x-nextstock-dev-context') devContext?: string,
  ) {
    return this.fiscalService.queryDocumentStatus(
      req.user,
      id,
      branchId,
      devContext,
    );
  }

  @Post('documents/:id/cancel')
  @Roles(Role.Admin)
  cancel(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: CancelFiscalDocumentDto,
    @Headers('x-nextstock-branch-id') branchId?: string,
    @Headers('x-nextstock-dev-context') devContext?: string,
  ) {
    return this.fiscalService.cancelDocument(
      req.user,
      id,
      body,
      branchId,
      devContext,
    );
  }
}

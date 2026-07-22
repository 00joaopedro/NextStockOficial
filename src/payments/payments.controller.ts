import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from '../common/http-types';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PreviewMutationGuard } from '../system/guards/preview-mutation.guard';
import { BranchContextGuard } from '../tenancy/branch-context.guard';
import { RequireTenantContext } from '../tenancy/tenant-context.decorator';
import {
  CreateConnectionDto,
  CreatePixPaymentDto,
  CreateTerminalDto,
  SetRoutingDto,
} from './dto/payment-admin.dto';
import { PaymentsService } from './payments.service';
@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard, PreviewMutationGuard, BranchContextGuard)
@RequireTenantContext({ requireBranch: true })
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class PaymentsController {
  constructor(private service: PaymentsService) {}
  private branch(v?: string) {
    return v;
  }
  @Get('configuration')
  @Roles(Role.Admin, Role.Vendedor, Role.Comprador)
  configuration(
    @Req() r: Request,
    @Headers('x-nextstock-branch-id') b?: string,
  ) {
    return this.service.configuration(r.user, this.branch(b));
  }
  @Post('connections') @Roles(Role.Admin) connection(
    @Req() r: Request,
    @Body() d: CreateConnectionDto,
    @Headers('x-nextstock-branch-id') b?: string,
  ) {
    return this.service.createConnection(r.user, d, b);
  }
  @Post('connections/:id/validate') @Roles(Role.Admin) validate(
    @Req() r: Request,
    @Param('id') id: string,
    @Headers('x-nextstock-branch-id') b?: string,
  ) {
    return this.service.validateConnection(r.user, id, b);
  }
  @Delete('connections/:id') @Roles(Role.Admin) revoke(
    @Req() r: Request,
    @Param('id') id: string,
    @Headers('x-nextstock-branch-id') b?: string,
  ) {
    return this.service.revokeConnection(r.user, id, b);
  }
  @Post('terminals') @Roles(Role.Admin) terminal(
    @Req() r: Request,
    @Body() d: CreateTerminalDto,
    @Headers('x-nextstock-branch-id') b?: string,
  ) {
    return this.service.createTerminal(r.user, d, b);
  }
  @Delete('terminals/:id') @Roles(Role.Admin) remove(
    @Req() r: Request,
    @Param('id') id: string,
    @Headers('x-nextstock-branch-id') b?: string,
  ) {
    return this.service.removeTerminal(r.user, id, b);
  }
  @Post('routing') @Roles(Role.Admin) routing(
    @Req() r: Request,
    @Body() d: SetRoutingDto,
    @Headers('x-nextstock-branch-id') b?: string,
  ) {
    return this.service.setRouting(r.user, d, b);
  }
  @Post('pix') @Roles(Role.Admin, Role.Vendedor) pix(
    @Req() r: Request,
    @Body() d: CreatePixPaymentDto,
    @Headers('x-nextstock-branch-id') b?: string,
  ) {
    return this.service.createPix(r.user, d, b);
  }
}

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
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FastifyFileInterceptor } from '../common/fastify-file.interceptor';
import type { Request } from 'express';
import { Role, SystemType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { BranchContextGuard } from '../tenancy/branch-context.guard';
import { RequireTenantContext } from '../tenancy/tenant-context.decorator';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';
import { PetsService } from './pets.service';
import {
  PublicRateLimitGuard,
  RateLimit,
} from '../security/public-rate-limit.guard';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard, BranchContextGuard)
@RequireTenantContext({
  requireBranch: true,
  expectedSystemType: SystemType.petshop,
})
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class PetsController {
  constructor(private readonly petsService: PetsService) {}

  @Get('pet-clients/:clientId/pets')
  listByClient(
    @Req() req: Request,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.petsService.listByClient(req.user, clientId, selectedBranchId);
  }

  @Post('pet-clients/:clientId/pets')
  @Roles(Role.Admin, Role.Vendedor)
  create(
    @Req() req: Request,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() body: CreatePetDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.petsService.create(req.user, clientId, body, selectedBranchId);
  }

  @Get('pets/:id')
  findOne(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.petsService.findOne(req.user, id, selectedBranchId);
  }

  @Patch('pets/:id')
  @Roles(Role.Admin, Role.Vendedor)
  update(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdatePetDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.petsService.update(req.user, id, body, selectedBranchId);
  }

  @Delete('pets/:id')
  @Roles(Role.Admin)
  remove(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.petsService.remove(req.user, id, selectedBranchId);
  }

  @Get('pets/:id/photos')
  listPhotos(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.petsService.listPhotos(req.user, id, selectedBranchId);
  }

  @Post('pets/:id/photos')
  @Roles(Role.Admin, Role.Vendedor)
  @UseGuards(PublicRateLimitGuard)
  @RateLimit({ max: 20, windowMs: 60_000 })
  @UseInterceptors(
    FastifyFileInterceptor('file', {
      limits: {
        fileSize: Number(process.env.PET_PHOTO_MAX_SIZE_MB || 5) * 1024 * 1024,
        files: 1,
      },
    }),
  )
  addPhoto(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: any,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.petsService.addPhoto(req.user, id, file, selectedBranchId);
  }

  @Delete('pets/:id/photos/:photoId')
  @Roles(Role.Admin, Role.Vendedor)
  removePhoto(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.petsService.removePhoto(
      req.user,
      id,
      photoId,
      selectedBranchId,
    );
  }

  @Get('pets/:id/appointments')
  listAppointments(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.petsService.listAppointments(req.user, id, selectedBranchId);
  }
}

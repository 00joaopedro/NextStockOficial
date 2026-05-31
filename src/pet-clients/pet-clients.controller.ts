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
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreatePetClientDto } from './dto/create-pet-client.dto';
import { PetClientQueryDto } from './dto/pet-client-query.dto';
import { UpdatePetClientDto } from './dto/update-pet-client.dto';
import { PetClientsService } from './pet-clients.service';

@Controller('pet-clients')
@UseGuards(JwtAuthGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class PetClientsController {
  constructor(private readonly petClientsService: PetClientsService) {}

  @Get()
  findAll(
    @Req() req: Request,
    @Query() query: PetClientQueryDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.petClientsService.findAll(req.user, query, selectedBranchId);
  }

  @Post()
  create(
    @Req() req: Request,
    @Body() body: CreatePetClientDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.petClientsService.create(req.user, body, selectedBranchId);
  }

  @Get(':id')
  findOne(
    @Req() req: Request,
    @Param('id') id: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.petClientsService.findOne(req.user, id, selectedBranchId);
  }

  @Patch(':id')
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdatePetClientDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.petClientsService.update(req.user, id, body, selectedBranchId);
  }

  @Delete(':id')
  remove(
    @Req() req: Request,
    @Param('id') id: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.petClientsService.remove(req.user, id, selectedBranchId);
  }

  @Get(':id/appointments')
  listAppointments(
    @Req() req: Request,
    @Param('id') id: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.petClientsService.listAppointments(req.user, id, selectedBranchId);
  }
}

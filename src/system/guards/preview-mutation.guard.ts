import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { SystemService } from '../system.service';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const API_ROUTE_PREFIX = '/api/';

@Injectable()
export class PreviewMutationGuard implements CanActivate {
  constructor(private readonly systemService: SystemService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method.toUpperCase();
    const path = request.path ?? request.url;

    if (
      path.startsWith(API_ROUTE_PREFIX) &&
      MUTATION_METHODS.has(method) &&
      this.systemService.isPreviewMode()
    ) {
      throw new ForbiddenException(
        'Critical mutations are disabled in preview mode.',
      );
    }

    return true;
  }
}

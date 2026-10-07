import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ServiceCatalogRepository } from '../../domain/repositories/service-catalog.repository.js';
import { ServiceCatalogResponseDto } from '../dto/service-catalog-response.dto.js';

@Injectable()
export class GetServiceCatalogUseCase {
  constructor(
    @Inject(ServiceCatalogRepository)
    private readonly serviceCatalogRepository: ServiceCatalogRepository,
  ) {}

  async execute(id: string): Promise<ServiceCatalogResponseDto> {
    const service = await this.serviceCatalogRepository.findById(id);

    if (!service) {
      throw new NotFoundException('Service not found.');
    }

    return {
      id: service.id,
      name: service.name,
      description: service.description,
      price: service.price,
      isActive: service.isActive,
      createdAt: service.createdAt,
      updatedAt: service.updatedAt,
    };
  }
}

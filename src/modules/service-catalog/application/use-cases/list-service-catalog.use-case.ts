import { Inject, Injectable } from '@nestjs/common';
import { ServiceCatalogRepository } from '../../domain/repositories/service-catalog.repository.js';
import { ServiceCatalogResponseDto } from '../dto/service-catalog-response.dto.js';

@Injectable()
export class ListServiceCatalogUseCase {
  constructor(
    @Inject(ServiceCatalogRepository)
    private readonly serviceCatalogRepository: ServiceCatalogRepository,
  ) {}

  async execute(): Promise<ServiceCatalogResponseDto[]> {
    const services = await this.serviceCatalogRepository.findAll(false);

    return services.map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      price: service.price,
      isActive: service.isActive,
      createdAt: service.createdAt,
      updatedAt: service.updatedAt,
    }));
  }
}

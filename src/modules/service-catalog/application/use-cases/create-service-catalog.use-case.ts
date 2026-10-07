import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CreateServiceCatalogDto } from '../dto/create-service-catalog.dto.js';
import { ServiceCatalog } from '../../domain/entities/service-catalog.entity.js';
import { ServiceCatalogRepository } from '../../domain/repositories/service-catalog.repository.js';

@Injectable()
export class CreateServiceCatalogUseCase {
  constructor(
    @Inject(ServiceCatalogRepository)
    private readonly serviceCatalogRepository: ServiceCatalogRepository,
  ) {}

  async execute(input: CreateServiceCatalogDto): Promise<{ id: string }> {
    const service = new ServiceCatalog({
      id: randomUUID(),
      name: input.name,
      description: input.description ?? null,
      price: input.price,
      isActive: input.isActive ?? true,
    });

    await this.serviceCatalogRepository.create(service);

    return { id: service.id };
  }
}

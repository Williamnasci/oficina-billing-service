import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ServiceCatalogRepository } from '../../domain/repositories/service-catalog.repository.js';
import { UpdateServiceCatalogDto } from '../dto/update-service-catalog.dto.js';

@Injectable()
export class UpdateServiceCatalogUseCase {
  constructor(
    @Inject(ServiceCatalogRepository)
    private readonly serviceCatalogRepository: ServiceCatalogRepository,
  ) {}

  async execute(id: string, input: UpdateServiceCatalogDto): Promise<void> {
    const service = await this.serviceCatalogRepository.findById(id);

    if (!service) {
      throw new NotFoundException('Service not found.');
    }

    service.update({
      name: input.name,
      description: input.description,
      price: input.price,
      isActive: input.isActive,
    });

    await this.serviceCatalogRepository.update(service);
  }
}

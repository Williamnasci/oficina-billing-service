import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ServiceCatalogRepository } from '../../domain/repositories/service-catalog.repository.js';

@Injectable()
export class DeleteServiceCatalogUseCase {
  constructor(
    @Inject(ServiceCatalogRepository)
    private readonly serviceCatalogRepository: ServiceCatalogRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const service = await this.serviceCatalogRepository.findById(id);

    if (!service) {
      throw new NotFoundException('Service not found.');
    }

    service.update({
      isActive: false,
    });

    await this.serviceCatalogRepository.update(service);
  }
}

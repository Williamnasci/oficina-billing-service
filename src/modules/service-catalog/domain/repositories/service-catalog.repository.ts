import { ServiceCatalog } from '../entities/service-catalog.entity.js';

export abstract class ServiceCatalogRepository {
  abstract create(service: ServiceCatalog): Promise<void>;
  abstract findById(id: string): Promise<ServiceCatalog | null>;
  abstract findAll(onlyActive?: boolean): Promise<ServiceCatalog[]>;
  abstract update(service: ServiceCatalog): Promise<void>;
}

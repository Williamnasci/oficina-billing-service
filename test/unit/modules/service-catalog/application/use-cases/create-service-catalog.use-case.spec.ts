import { jest } from '@jest/globals';
import { CreateServiceCatalogUseCase } from '../../../../../../src/modules/service-catalog/application/use-cases/create-service-catalog.use-case.js';
import { ServiceCatalogRepository } from '../../../../../../src/modules/service-catalog/domain/repositories/service-catalog.repository.js';

describe('CreateServiceCatalogUseCase', () => {
  let useCase: CreateServiceCatalogUseCase;
  let repository: jest.Mocked<ServiceCatalogRepository>;

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
    };
    useCase = new CreateServiceCatalogUseCase(repository);
  });

  it('should create service catalog', async () => {
    const result = await useCase.execute({ name: 'Service', price: 100 });
    expect(repository.create).toHaveBeenCalled();
    expect(result.id).toBeDefined();
  });
});

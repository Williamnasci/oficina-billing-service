import { jest } from '@jest/globals';
import { ListServiceCatalogUseCase } from '../../../../../../src/modules/service-catalog/application/use-cases/list-service-catalog.use-case.js';
import { ServiceCatalogRepository } from '../../../../../../src/modules/service-catalog/domain/repositories/service-catalog.repository.js';

describe('ListServiceCatalogUseCase', () => {
  let useCase: ListServiceCatalogUseCase;
  let repository: jest.Mocked<ServiceCatalogRepository>;

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
    };
    useCase = new ListServiceCatalogUseCase(repository);
  });

  it('should list service catalogs', async () => {
    repository.findAll.mockResolvedValue([
      { id: '1', name: 'Service', price: 100 } as any,
    ]);
    const result = await useCase.execute();
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('1');
  });
});

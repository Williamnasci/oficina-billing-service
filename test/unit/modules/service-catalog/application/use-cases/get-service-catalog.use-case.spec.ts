import { jest } from '@jest/globals';
import { GetServiceCatalogUseCase } from '../../../../../../src/modules/service-catalog/application/use-cases/get-service-catalog.use-case.js';
import { ServiceCatalogRepository } from '../../../../../../src/modules/service-catalog/domain/repositories/service-catalog.repository.js';
import { NotFoundException } from '@nestjs/common';

describe('GetServiceCatalogUseCase', () => {
  let useCase: GetServiceCatalogUseCase;
  let repository: jest.Mocked<ServiceCatalogRepository>;

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
    };
    useCase = new GetServiceCatalogUseCase(repository);
  });

  it('should get service catalog', async () => {
    repository.findById.mockResolvedValue({
      id: '1',
      name: 'Service',
      price: 100,
    } as any);
    const result = await useCase.execute('1');
    expect(result.id).toBe('1');
  });

  it('should throw if not found', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(useCase.execute('1')).rejects.toThrow(NotFoundException);
  });
});

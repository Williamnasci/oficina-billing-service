import { jest } from '@jest/globals';
import { UpdateServiceCatalogUseCase } from '../../../../../../src/modules/service-catalog/application/use-cases/update-service-catalog.use-case.js';
import { ServiceCatalogRepository } from '../../../../../../src/modules/service-catalog/domain/repositories/service-catalog.repository.js';
import { NotFoundException } from '@nestjs/common';

describe('UpdateServiceCatalogUseCase', () => {
  let useCase: UpdateServiceCatalogUseCase;
  let repository: jest.Mocked<ServiceCatalogRepository>;
  let entity: any;

  beforeEach(() => {
    entity = { update: jest.fn() };
    repository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn().mockResolvedValue(entity),
      update: jest.fn(),
    };
    useCase = new UpdateServiceCatalogUseCase(repository);
  });

  it('should update service catalog', async () => {
    await useCase.execute('1', { name: 'New Name' });
    expect(entity.update).toHaveBeenCalledWith({ name: 'New Name' });
    expect(repository.update).toHaveBeenCalledWith(entity);
  });

  it('should throw if not found', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(useCase.execute('1', { name: 'New Name' })).rejects.toThrow(
      NotFoundException,
    );
  });
});

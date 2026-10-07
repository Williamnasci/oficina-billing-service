import { jest } from '@jest/globals';
import { DeleteServiceCatalogUseCase } from '../../../../../../src/modules/service-catalog/application/use-cases/delete-service-catalog.use-case.js';
import { ServiceCatalogRepository } from '../../../../../../src/modules/service-catalog/domain/repositories/service-catalog.repository.js';
import { NotFoundException } from '@nestjs/common';

describe('DeleteServiceCatalogUseCase', () => {
  let useCase: DeleteServiceCatalogUseCase;
  let repository: jest.Mocked<ServiceCatalogRepository>;

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
    };
    useCase = new DeleteServiceCatalogUseCase(repository);
  });

  it('should delete service catalog (soft delete)', async () => {
    const mockEntity = { update: jest.fn() };
    repository.findById.mockResolvedValue(mockEntity as any);
    await useCase.execute('1');
    expect(mockEntity.update).toHaveBeenCalledWith({ isActive: false });
    expect(repository.update).toHaveBeenCalledWith(mockEntity);
  });

  it('should throw if not found', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(useCase.execute('1')).rejects.toThrow(NotFoundException);
  });
});

import { ServiceCatalog } from '../../../../../../src/modules/service-catalog/domain/entities/service-catalog.entity.js';
import { DomainException } from '../../../../../../src/shared/domain/errors/domain.exception.js';

describe('ServiceCatalog Entity', () => {
  it('should create valid catalog', () => {
    const catalog = new ServiceCatalog({ id: '1', name: 'Wash', price: 50 });
    expect(catalog.name).toBe('Wash');
  });

  it('should throw on negative price', () => {
    expect(
      () => new ServiceCatalog({ id: '1', name: 'Wash', price: -10 }),
    ).toThrow(DomainException);
  });

  it('should throw on empty name', () => {
    expect(
      () => new ServiceCatalog({ id: '1', name: '   ', price: 10 }),
    ).toThrow(DomainException);
  });

  it('should update catalog', () => {
    const catalog = new ServiceCatalog({ id: '1', name: 'Wash', price: 50 });
    catalog.update({
      name: 'Car Wash',
      description: 'desc',
      price: 60,
      isActive: false,
    });
    expect(catalog.name).toBe('Car Wash');
    expect(catalog.description).toBe('desc');
    expect(catalog.price).toBe(60);
    expect(catalog.isActive).toBe(false);
  });

  it('should throw when updating to negative price', () => {
    const catalog = new ServiceCatalog({ id: '1', name: 'Wash', price: 50 });
    expect(() => catalog.update({ price: -1 })).toThrow(DomainException);
  });

  it('should throw when updating to empty name', () => {
    const catalog = new ServiceCatalog({ id: '1', name: 'Wash', price: 50 });
    expect(() => catalog.update({ name: '  ' })).toThrow(DomainException);
  });
});

import { DomainException } from '../../../../shared/domain/errors/domain.exception.js';

export type ServiceCatalogProps = {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

export class ServiceCatalog {
  public readonly id: string;
  public name: string;
  public description: string | null;
  public price: number;
  public isActive: boolean;
  public readonly createdAt: Date;
  public updatedAt: Date;

  constructor(props: ServiceCatalogProps) {
    if (!props.name?.trim()) {
      throw new DomainException('Service name is required.');
    }

    if (props.price < 0) {
      throw new DomainException('Price cannot be negative.');
    }

    this.id = props.id;
    this.name = props.name.trim();
    this.description = props.description ?? null;
    this.price = props.price;
    this.isActive = props.isActive ?? true;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
  }

  public update(data: {
    name?: string;
    description?: string | null;
    price?: number;
    isActive?: boolean;
  }): void {
    if (data.name !== undefined) {
      if (!data.name.trim()) {
        throw new DomainException('Service name is required.');
      }
      this.name = data.name.trim();
    }

    if (data.description !== undefined) {
      this.description = data.description;
    }

    if (data.price !== undefined) {
      if (data.price < 0) {
        throw new DomainException('Price cannot be negative.');
      }
      this.price = data.price;
    }

    if (data.isActive !== undefined) {
      this.isActive = data.isActive;
    }

    this.updatedAt = new Date();
  }
}

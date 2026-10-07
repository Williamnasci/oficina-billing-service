import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import Decimal from 'decimal.js';
import { ServiceCatalog } from './modules/service-catalog/domain/entities/service-catalog.entity.js';
import { CreateServiceCatalogUseCase } from './modules/service-catalog/application/use-cases/create-service-catalog.use-case.js';
import { GetServiceCatalogUseCase } from './modules/service-catalog/application/use-cases/get-service-catalog.use-case.js';
import { ListServiceCatalogUseCase } from './modules/service-catalog/application/use-cases/list-service-catalog.use-case.js';
import { UpdateServiceCatalogUseCase } from './modules/service-catalog/application/use-cases/update-service-catalog.use-case.js';
import { DeleteServiceCatalogUseCase } from './modules/service-catalog/application/use-cases/delete-service-catalog.use-case.js';
import { CreateServiceCatalogDto } from './modules/service-catalog/application/dto/create-service-catalog.dto.js';
import { UpdateServiceCatalogDto } from './modules/service-catalog/application/dto/update-service-catalog.dto.js';
import { fingerprint } from './infrastructure/contracts.mjs';

/** Preserve the original Decimal(10,2) boundary and PostgreSQL half-up rounding. */
export function priceToCents(price) {
  if (!Number.isFinite(price) || price < 0) throw new Error('Invalid catalog price');
  const cents = new Decimal(price).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).times(100).toNumber();
  if (cents > 9999999999) throw new Error('Catalog price exceeds Decimal(10,2)');
  return cents;
}
function dataOf(service) {
  const unitPriceCents = priceToCents(service.price);
  return { id: service.id, name: service.name, description: service.description, price: unitPriceCents / 100, unitPriceCents, isActive: service.isActive, createdAt: service.createdAt.toISOString(), updatedAt: service.updatedAt.toISOString() };
}
export class CatalogRepository {
  constructor(store) { this.store = store; }
  restore(data) {
    return new ServiceCatalog({ ...data, price: data.price ?? data.unitPriceCents / 100, createdAt: new Date(data.createdAt ?? 0), updatedAt: new Date(data.updatedAt ?? 0) });
  }
  async create(service) {
    const next = dataOf(service);
    await this.store.transact(`catalog:${service.id}`, randomUUID(), fingerprint(next), async existing => {
      if (existing) throw new ConflictException('Service already registered.');
      return { data: next };
    });
  }
  async findById(id) { const data = await this.store.get(`catalog:${id}`); return data ? this.restore(data) : null; }
  async findAll(onlyActive = false) {
    return (await this.store.list()).filter(({ id, data }) => id.startsWith('catalog:') && (!onlyActive || data.isActive)).map(({ data }) => this.restore(data)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  async update(service) {
    const next = dataOf(service);
    await this.store.transact(`catalog:${service.id}`, randomUUID(), fingerprint(next), async existing => {
      if (!existing) throw new NotFoundException('Service not found.');
      return { data: next };
    });
  }
}
function dto(Type, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw Object.assign(new Error('Invalid request'), { status: 400 });
  const result = plainToInstance(Type, body);
  if (validateSync(result, { whitelist: true, forbidNonWhitelisted: true }).length) throw Object.assign(new Error('Invalid request'), { status: 400 });
  return result;
}
export function catalogRoutes(repository) {
  const create = new CreateServiceCatalogUseCase(repository), get = new GetServiceCatalogUseCase(repository), list = new ListServiceCatalogUseCase(repository), update = new UpdateServiceCatalogUseCase(repository), remove = new DeleteServiceCatalogUseCase(repository);
  return [
    { method: 'post', path: '/service-catalog', roles: ['admin'], status: 201, handle: req => create.execute(dto(CreateServiceCatalogDto, req.body)) },
    { method: 'get', path: '/service-catalog', roles: ['admin'], handle: () => list.execute() },
    { method: 'get', path: '/service-catalog/:id', roles: ['admin'], handle: req => get.execute(req.params.id) },
    { method: 'patch', path: '/service-catalog/:id', roles: ['admin'], status: 204, handle: req => update.execute(req.params.id, dto(UpdateServiceCatalogDto, req.body)) },
    { method: 'delete', path: '/service-catalog/:id', roles: ['admin'], status: 204, handle: req => remove.execute(req.params.id) },
  ];
}

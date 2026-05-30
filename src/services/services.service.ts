import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { getPagination } from '../common/utils/pagination.util';

const TTL = 2 * 60 * 1000; // 2 minutes
const LIST_KEY = (q: object) => `services:list:${JSON.stringify(q)}`;
const ONE_KEY  = (id: string) => `services:one:${id}`;

@Injectable()
export class ServicesService {
  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  async findAll(query: PaginationDto & { isActive?: string }) {
    const key = LIST_KEY(query);
    const cached = await this.cache.get(key);
    if (cached) return cached;

    const { page = 1, limit = 10, sortBy, sortOrder = 'desc', isActive } = query;
    const pageNum = +page;
    const limitNum = +limit;
    const skip = (pageNum - 1) * limitNum;

    const orderBy: any = sortBy ? { [sortBy]: sortOrder } : { createdAt: 'desc' };
    const where: any = {};
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const [services, total] = await Promise.all([
      this.prisma.service.findMany({ where, orderBy, skip, take: limitNum }),
      this.prisma.service.count({ where }),
    ]);

    const result = { success: true, data: { services, pagination: getPagination(pageNum, limitNum, total) } };
    await this.cache.set(key, result, TTL);
    return result;
  }

  async findOne(id: string) {
    const key = ONE_KEY(id);
    const cached = await this.cache.get(key);
    if (cached) return cached;

    const service = await this.prisma.service.findUnique({ where: { id } });
    if (!service) throw new NotFoundException('Service not found');

    const result = { success: true, data: service };
    await this.cache.set(key, result, TTL);
    return result;
  }

  async create(dto: CreateServiceDto) {
    const service = await this.prisma.service.create({ data: dto });
    void this.bustList();
    return { success: true, message: 'Service created successfully', data: service };
  }

  async update(id: string, dto: UpdateServiceDto) {
    const existing = await this.prisma.service.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Service not found');

    const service = await this.prisma.service.update({ where: { id }, data: dto });
    await Promise.all([this.bustList(), this.cache.del(ONE_KEY(id))]);
    return { success: true, message: 'Service updated successfully', data: service };
  }

  async remove(id: string) {
    const existing = await this.prisma.service.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Service not found');

    await this.prisma.service.delete({ where: { id } });
    await Promise.all([this.bustList(), this.cache.del(ONE_KEY(id))]);
    return { success: true, message: 'Service deleted successfully' };
  }

  async toggle(id: string) {
    const service = await this.prisma.service.findUnique({ where: { id } });
    if (!service) throw new NotFoundException('Service not found');

    const updated = await this.prisma.service.update({ where: { id }, data: { isActive: !service.isActive } });
    await Promise.all([this.bustList(), this.cache.del(ONE_KEY(id))]);
    return { success: true, message: `Service ${updated.isActive ? 'activated' : 'deactivated'} successfully`, data: updated };
  }

  // Clears list cache by resetting all services:list:* entries via a shared bust key
  private async bustList() {
    const busted = await this.cache.get<number>('services:bust') ?? 0;
    await this.cache.set('services:bust', busted + 1, TTL);
  }
}

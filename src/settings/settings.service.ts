import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { SettingType } from '../database/types';

const TTL = 5 * 60 * 1000; // 5 minutes
const K = {
  hotelInfo: 'settings:hotel-info',
  socialLinks: 'settings:social-links',
  taxes: 'settings:taxes',
};

@Injectable()
export class SettingsService {
  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  async findAll(group?: string) {
    const where: any = {};
    if (group) where.group = group;

    return this.prisma.setting.findMany({
      where,
      orderBy: [{ group: 'asc' }, { key: 'asc' }],
    });
  }

  async findOne(key: string) {
    const setting = await this.prisma.setting.findUnique({ where: { key } });
    if (!setting) throw new NotFoundException(`Setting with key '${key}' not found`);
    return setting;
  }

  async getValue(key: string, defaultValue?: string): Promise<string | null> {
    const setting = await this.prisma.setting.findUnique({ where: { key } });
    return setting?.value ?? defaultValue ?? null;
  }

  async setValue(key: string, value: string, type: SettingType = SettingType.STRING, group: string = 'general', description?: string) {
    const existing = await this.prisma.setting.findUnique({ where: { key } });
    const result = existing
      ? await this.prisma.setting.update({ where: { key }, data: { value, type, group, description } })
      : await this.prisma.setting.create({ data: { key, value, type, group, description } });

    await this.invalidateSettingsCache(key);
    return result;
  }

  async update(key: string, data: { value?: string; type?: SettingType; group?: string; description?: string }) {
    const setting = await this.prisma.setting.findUnique({ where: { key } });
    if (!setting) throw new NotFoundException(`Setting with key '${key}' not found`);

    const result = await this.prisma.setting.update({ where: { key }, data });
    await this.invalidateSettingsCache(key);
    return result;
  }

  async remove(key: string) {
    const setting = await this.prisma.setting.findUnique({ where: { key } });
    if (!setting) throw new NotFoundException(`Setting with key '${key}' not found`);

    await this.prisma.setting.delete({ where: { key } });
    await this.invalidateSettingsCache(key);
    return { message: 'Setting deleted successfully' };
  }

  async getHotelInfo() {
    const cached = await this.cache.get(K.hotelInfo);
    if (cached) return cached;

    const keys = ['hotel_name', 'hotel_address', 'hotel_phone', 'hotel_email', 'check_in_time', 'check_out_time'];
    const settings = await this.prisma.setting.findMany({ where: { key: { in: keys } } });
    const result = settings.reduce((acc, s) => { acc[s.key] = s.value; return acc; }, {} as Record<string, string>);

    await this.cache.set(K.hotelInfo, result, TTL);
    return result;
  }

  private readonly TAX_KEY = 'tax_settings';
  private readonly TAX_DEFAULTS = { vatRate: 0, municipalFee: 0, environmentalTax: 0, isActive: false };

  async getTaxSettings() {
    const cached = await this.cache.get(K.taxes);
    if (cached) return cached;

    const setting = await this.prisma.setting.findUnique({ where: { key: this.TAX_KEY } });
    const stored = setting ? JSON.parse(setting.value) : {};
    const result = {
      id: setting?.id ?? this.TAX_KEY,
      ...this.TAX_DEFAULTS,
      ...stored,
      createdAt: setting?.createdAt ?? new Date().toISOString(),
      updatedAt: setting?.updatedAt ?? new Date().toISOString(),
    };

    await this.cache.set(K.taxes, result, TTL);
    return result;
  }

  async updateTaxSettings(data: { vatRate?: number; municipalFee?: number; environmentalTax?: number; isActive?: boolean }) {
    const current = await this.getTaxSettings();
    const merged = { vatRate: current.vatRate, municipalFee: current.municipalFee, environmentalTax: current.environmentalTax, isActive: current.isActive, ...data };

    const setting = await this.prisma.setting.upsert({
      where: { key: this.TAX_KEY },
      create: { key: this.TAX_KEY, value: JSON.stringify(merged), type: SettingType.JSON, group: 'taxes', description: 'Tax settings' },
      update: { value: JSON.stringify(merged) },
    });

    await this.cache.del(K.taxes);
    return { id: setting.id, ...merged, createdAt: setting.createdAt, updatedAt: setting.updatedAt };
  }

  async getSocialLinks() {
    const cached = await this.cache.get(K.socialLinks);
    if (cached) return cached;

    const keys = ['facebook_url', 'instagram_url', 'twitter_url', 'tripadvisor_url'];
    const settings = await this.prisma.setting.findMany({ where: { key: { in: keys } } });
    const result = settings.reduce((acc, s) => { acc[s.key] = s.value; return acc; }, {} as Record<string, string>);

    await this.cache.set(K.socialLinks, result, TTL);
    return result;
  }

  private async invalidateSettingsCache(key: string) {
    // Clear targeted caches based on which setting changed
    const hotelKeys = ['hotel_name', 'hotel_address', 'hotel_phone', 'hotel_email', 'check_in_time', 'check_out_time'];
    const socialKeys = ['facebook_url', 'instagram_url', 'twitter_url', 'tripadvisor_url'];

    if (hotelKeys.includes(key)) await this.cache.del(K.hotelInfo);
    if (socialKeys.includes(key)) await this.cache.del(K.socialLinks);
    if (key === this.TAX_KEY) await this.cache.del(K.taxes);
  }
}

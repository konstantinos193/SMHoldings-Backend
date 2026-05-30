import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { MediaCategory } from '../database/types';

interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer: Buffer;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private prisma: PrismaService,
    private uploadService: UploadService,
  ) {}

  async upload(file: UploadedFile, category: MediaCategory = MediaCategory.GENERAL, altTextGr?: string, altTextEn?: string) {
    // Upload to Cloudinary
    const url = await this.uploadService.uploadImage(file, category.toLowerCase());

    // Create media record in database
    const media = await this.prisma.media.create({
      data: {
        filename: url.split('/').pop() || '',
        originalName: file.originalname,
        url,
        category,
        altTextGr,
        altTextEn,
        mimeType: file.mimetype,
        size: file.size,
      },
    });

    return media;
  }

  async findAll(category?: MediaCategory) {
    const where: any = {};
    if (category) where.category = category;

    return this.prisma.media.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const media = await this.prisma.media.findUnique({
      where: { id },
    });

    if (!media) {
      throw new NotFoundException(`Media with ID '${id}' not found`);
    }

    return media;
  }

  async update(id: string, data: { altTextGr?: string; altTextEn?: string; category?: MediaCategory }) {
    const media = await this.prisma.media.findUnique({
      where: { id },
    });

    if (!media) {
      throw new NotFoundException(`Media with ID '${id}' not found`);
    }

    return this.prisma.media.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    const media = await this.prisma.media.findUnique({
      where: { id },
    });

    if (!media) {
      throw new NotFoundException(`Media with ID '${id}' not found`);
    }

    // Delete from Cloudinary if possible
    try {
      const publicId = this.extractPublicId(media.url);
      if (publicId) {
        await this.uploadService.deleteImage(publicId);
      }
    } catch (error) {
      // Log but don't fail if Cloudinary deletion fails
      this.logger.warn(`Failed to delete image from Cloudinary: ${error}`);
    }

    await this.prisma.media.delete({
      where: { id },
    });

    return { message: 'Media deleted successfully' };
  }

  private extractPublicId(url: string): string | null {
    // Extract public ID from Cloudinary URL
    const match = url.match(/\/incanto\/[^/]+\/(.+?)\./);
    return match ? `incanto/${match[0].split('/')[2]}/${match[1]}` : null;
  }
}

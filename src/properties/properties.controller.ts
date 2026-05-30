import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PropertiesService } from './properties.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { PropertyQueryDto } from './dto/property-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Properties')
@Controller('properties')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all properties with search and filters' })
  @ApiResponse({ status: 200 })
  findAll(@Query() query: PropertyQueryDto) {
    return this.propertiesService.findAll(query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get single property' })
  @ApiResponse({ status: 200 })
  findOne(@Param('id') id: string) {
    return this.propertiesService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create property' })
  @ApiResponse({ status: 201 })
  create(@Body() createPropertyDto: CreatePropertyDto, @CurrentUser() userId: string) {
    return this.propertiesService.create(createPropertyDto, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update property' })
  @ApiResponse({ status: 200 })
  update(@Param('id') id: string, @Body() updatePropertyDto: UpdatePropertyDto) {
    return this.propertiesService.update(id, updatePropertyDto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete property' })
  @ApiResponse({ status: 200 })
  remove(@Param('id') id: string) {
    return this.propertiesService.remove(id);
  }

  @Public()
  @Get(':id/availability')
  @ApiOperation({ summary: 'Get property availability' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiResponse({ status: 200 })
  getAvailability(@Param('id') id: string, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.propertiesService.getAvailability(id, startDate, endDate);
  }
}


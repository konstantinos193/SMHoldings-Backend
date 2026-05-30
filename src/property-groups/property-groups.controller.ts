import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { PropertyGroupsService } from './property-groups.service';
import { CreatePropertyGroupDto } from './dto/create-property-group.dto';
import { UpdatePropertyGroupDto } from './dto/update-property-group.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserWithRole } from '../common/decorators/current-user-with-role.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('property-groups')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PROPERTY_OWNER', 'ADMIN')
export class PropertyGroupsController {
  constructor(private readonly propertyGroupsService: PropertyGroupsService) {}

  @Post()
  create(
    @Body() createPropertyGroupDto: CreatePropertyGroupDto,
    @CurrentUser() userId: string,
  ) {
    return this.propertyGroupsService.create(createPropertyGroupDto, userId);
  }

  @Get()
  findAll(@CurrentUserWithRole() user: any) {
    return this.propertyGroupsService.findAll(user?.userId ?? user?.id, user?.role);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() userId: string) {
    return this.propertyGroupsService.findOne(id, userId);
  }

  @Get(':id/analytics')
  getAnalytics(@Param('id') id: string, @CurrentUser() userId: string) {
    return this.propertyGroupsService.getGroupAnalytics(id, userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updatePropertyGroupDto: UpdatePropertyGroupDto,
    @CurrentUser() userId: string,
  ) {
    return this.propertyGroupsService.update(id, updatePropertyGroupDto, userId);
  }

  @Post(':id/properties/:propertyId')
  addProperty(
    @Param('id') id: string,
    @Param('propertyId') propertyId: string,
    @CurrentUser() userId: string,
  ) {
    return this.propertyGroupsService.addPropertyToGroup(id, propertyId, userId);
  }

  @Delete(':id/properties/:propertyId')
  removeProperty(
    @Param('id') id: string,
    @Param('propertyId') propertyId: string,
    @CurrentUser() userId: string,
  ) {
    return this.propertyGroupsService.removePropertyFromGroup(
      id,
      propertyId,
      userId,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() userId: string) {
    return this.propertyGroupsService.remove(id, userId);
  }
}


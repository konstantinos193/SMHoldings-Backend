import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { MessageQueryDto, UpdateMessageDto } from './dto/message-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../database/types';

@ApiTags('messages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all messages with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Messages retrieved successfully' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.PROPERTY_OWNER)
  async findAll(@Query() query: MessageQueryDto) {
    return this.messagesService.findAll(query);
  }

  @Get('unread/count')
  @ApiOperation({ summary: 'Get unread messages count' })
  @ApiResponse({ status: 200, description: 'Unread count retrieved successfully' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.PROPERTY_OWNER)
  async getUnreadCount(@Request() req) {
    return this.messagesService.getUnreadCount(req.user.id);
  }

  @Get('booking/:bookingId')
  @ApiOperation({ summary: 'Get all messages for a specific booking' })
  @ApiResponse({ status: 200, description: 'Booking messages retrieved successfully' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.PROPERTY_OWNER)
  async findByBooking(@Param('bookingId') bookingId: string) {
    return this.messagesService.findByBooking(bookingId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific message by ID' })
  @ApiResponse({ status: 200, description: 'Message retrieved successfully' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.PROPERTY_OWNER)
  async findOne(@Param('id') id: string) {
    return this.messagesService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new message' })
  @ApiResponse({ status: 201, description: 'Message created successfully' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.PROPERTY_OWNER, UserRole.USER)
  async create(@Body() createMessageDto: CreateMessageDto) {
    return this.messagesService.create(createMessageDto);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a message as read' })
  @ApiResponse({ status: 200, description: 'Message marked as read successfully' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.PROPERTY_OWNER, UserRole.USER)
  async markAsRead(@Param('id') id: string) {
    return this.messagesService.markAsRead(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a message' })
  @ApiResponse({ status: 200, description: 'Message updated successfully' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.PROPERTY_OWNER)
  async update(@Param('id') id: string, @Body() updateMessageDto: UpdateMessageDto) {
    return this.messagesService.update(id, updateMessageDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a message' })
  @ApiResponse({ status: 200, description: 'Message deleted successfully' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async remove(@Param('id') id: string) {
    return this.messagesService.remove(id);
  }
}

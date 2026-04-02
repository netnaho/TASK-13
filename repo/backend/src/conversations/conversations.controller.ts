import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Request } from 'express';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ConversationFiltersDto } from './dto/conversation-filters.dto';
import { CreateCannedResponseDto } from './dto/canned-response.dto';
import { JwtAuthGuard, JwtPayload } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  findAll(@Query() filters: ConversationFiltersDto, @Req() req: Request) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.conversationsService.findAll(user.sub, user.role, filters);
  }

  @Get('canned-responses')
  getCannedResponses() {
    return this.conversationsService.getCannedResponses();
  }

  @Post()
  create(@Body() dto: CreateConversationDto, @Req() req: Request) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.conversationsService.create(user.sub, dto.listingId);
  }

  @Get(':id')
  getConversation(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.conversationsService.getConversationWithMessages(id, user.sub, user.role);
  }

  @Post(':id/messages')
  sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
    @Req() req: Request,
  ) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.conversationsService.sendMessage(id, user.sub, user.role, dto);
  }

  @Post(':id/archive')
  @UseGuards(RolesGuard)
  @Roles('vendor', 'admin')
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.conversationsService.archive(id, user.sub, user.role);
  }

  @Post(':id/voice')
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: diskStorage({
        destination: './uploads/voice',
        filename: (_req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, uniqueSuffix + extname(file.originalname));
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('audio/')) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only audio files allowed') as any, false);
        }
      },
    }),
  )
  async sendVoiceMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException('Audio file is required');
    const user = (req as Request & { user: JwtPayload }).user;
    const audioUrl = `/uploads/voice/${file.filename}`;
    return this.conversationsService.sendMessage(id, user.sub, user.role, {
      type: 'voice',
      audioUrl,
    } as any);
  }
}

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminCannedResponsesController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post('canned-responses')
  create(@Body() dto: CreateCannedResponseDto, @Req() req: Request) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.conversationsService.createCannedResponse(dto, user.sub);
  }
}

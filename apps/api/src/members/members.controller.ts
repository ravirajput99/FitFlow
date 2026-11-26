import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  memberCreateSchema,
  memberListQuerySchema,
  memberUpdateSchema,
  type MemberCreate,
  type MemberDto,
  type MemberListQuery,
  type MemberUpdate,
  type Paginated,
} from '@fitflow/shared';
import { RequirePermissions } from '../auth/decorators';
import { ApiZodBody, ApiZodQuery, ZodPipe } from '../common/zod';
import { MembersService } from './members.service';

@ApiTags('members')
@ApiBearerAuth()
@Controller('members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.MEMBERS_READ)
  @ApiZodQuery(memberListQuerySchema)
  list(
    @Query(new ZodPipe(memberListQuerySchema)) query: MemberListQuery,
  ): Promise<Paginated<MemberDto>> {
    return this.members.list(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.MEMBERS_READ)
  get(@Param('id') id: string): Promise<MemberDto> {
    return this.members.get(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.MEMBERS_WRITE)
  @ApiZodBody(memberCreateSchema)
  create(@Body(new ZodPipe(memberCreateSchema)) body: MemberCreate): Promise<MemberDto> {
    return this.members.create(body);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.MEMBERS_WRITE)
  @ApiZodBody(memberUpdateSchema)
  update(
    @Param('id') id: string,
    @Body(new ZodPipe(memberUpdateSchema)) body: MemberUpdate,
  ): Promise<MemberDto> {
    return this.members.update(id, body);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.MEMBERS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.members.remove(id);
  }
}

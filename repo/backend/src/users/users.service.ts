import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../database/entities/user.entity';
import { UserSanitizerService } from '../common/sanitization/user-sanitizer.service';
import { UserView } from '../common/sanitization/user-view.model';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly sanitizer: UserSanitizerService,
  ) {}

  async findById(id: string, requesterRole: string): Promise<UserView> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.sanitizer.sanitize(user, requesterRole);
  }
}

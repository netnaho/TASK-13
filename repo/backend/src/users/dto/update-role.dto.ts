import { IsIn } from 'class-validator';
import { UserRole } from '../../database/entities/user.entity';

export class UpdateRoleDto {
  @IsIn(Object.values(UserRole), {
    message: `role must be one of: ${Object.values(UserRole).join(', ')}`,
  })
  role: UserRole;
}

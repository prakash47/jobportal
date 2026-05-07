import type { User, UserRole } from '../../generated/client';
import { prisma } from '../client';

export function getUserById(id: number): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}

export function getUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { email } });
}

export function listUsersByRole(role: UserRole, take = 20): Promise<User[]> {
  return prisma.user.findMany({
    where: { role },
    orderBy: { createdAt: 'desc' },
    take,
  });
}

export type CreateUserInput = {
  email: string;
  passwordHash: string;
  name: string;
  role?: UserRole;
};

export function createUser(input: CreateUserInput): Promise<User> {
  return prisma.user.create({
    data: {
      email: input.email,
      passwordHash: input.passwordHash,
      name: input.name,
      role: input.role ?? 'CANDIDATE',
    },
  });
}

export function updatePasswordHash(id: number, passwordHash: string): Promise<User> {
  return prisma.user.update({
    where: { id },
    data: { passwordHash },
  });
}

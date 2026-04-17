import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './entities/user.entity';
import { Listing, ListingStatus } from './entities/listing.entity';
import { SensitiveWord } from './entities/sensitive-word.entity';
import { CreditScore } from './entities/credit-score.entity';
import { logger } from '../common/logger/winston.logger';
import { EncryptionService } from '../common/encryption/encryption.service';

export async function runSeed(dataSource: DataSource): Promise<void> {
  const userRepo = dataSource.getRepository(User);
  const listingRepo = dataSource.getRepository(Listing);
  const wordRepo = dataSource.getRepository(SensitiveWord);
  const creditRepo = dataSource.getRepository(CreditScore);

  // Instantiated directly (no DI) because seed runs outside the NestJS container.
  const encryption = new EncryptionService();

  const rounds = parseInt(process.env.BCRYPT_ROUNDS ?? '10', 10);

  const seedUsers = [
    {
      username: 'admin',
      email: 'admin@petmarket.local',
      password: 'admin123',
      role: UserRole.ADMIN,
    },
    {
      username: 'vendor',
      email: 'vendor@petmarket.local',
      password: 'vendor123',
      role: UserRole.VENDOR,
    },
    {
      username: 'shopper',
      email: 'shopper@petmarket.local',
      password: 'shopper123',
      role: UserRole.SHOPPER,
    },
    {
      username: 'reviewer1',
      email: 'reviewer1@petmarket.local',
      password: 'reviewer123',
      role: UserRole.OPS_REVIEWER,
    },
    {
      username: 'finance1',
      email: 'finance1@petmarket.local',
      password: 'finance123',
      role: UserRole.FINANCE_ADMIN,
    },
  ];

  const userMap: Record<string, User> = {};

  for (const u of seedUsers) {
    const existing = await userRepo.findOne({ where: { username: u.username } });
    if (!existing) {
      const passwordHash = await bcrypt.hash(u.password, rounds);
      const user = userRepo.create({
        username: u.username,
        email: encryption.encrypt(u.email),
        passwordHash,
        role: u.role,
      });
      const saved = await userRepo.save(user);
      userMap[u.username] = saved;
      logger.info(`Seed: created user ${u.username}`, { context: 'Seed' });
    } else {
      userMap[u.username] = existing;
      logger.info(`Seed: user ${u.username} already exists`, { context: 'Seed' });
    }
  }

  const vendor = userMap['vendor'];
  const listingCount = await listingRepo.count();
  if (listingCount === 0 && vendor) {
    const listings = [
      {
        vendorId: vendor.id,
        title: 'Golden Retriever Puppy',
        description: 'Healthy and playful Golden Retriever puppy, 8 weeks old.',
        breed: 'Golden Retriever',
        age: 2,
        region: 'California',
        priceUsd: 1200,
        rating: 4.8,
        photos: [],
        status: ListingStatus.ACTIVE,
      },
      {
        vendorId: vendor.id,
        title: 'Persian Cat Kitten',
        description: 'Fluffy Persian kitten, vaccinated and dewormed.',
        breed: 'Persian',
        age: 3,
        region: 'New York',
        priceUsd: 800,
        rating: 4.6,
        photos: [],
        status: ListingStatus.ACTIVE,
      },
      {
        vendorId: vendor.id,
        title: 'French Bulldog',
        description: 'AKC registered French Bulldog, champion bloodline.',
        breed: 'French Bulldog',
        age: 4,
        region: 'Texas',
        priceUsd: 3500,
        rating: 4.9,
        photos: [],
        status: ListingStatus.ACTIVE,
      },
      {
        vendorId: vendor.id,
        title: 'Siberian Husky',
        description: 'Beautiful blue-eyed Siberian Husky, loves outdoor activities.',
        breed: 'Siberian Husky',
        age: 6,
        region: 'Alaska',
        priceUsd: 1500,
        rating: 4.7,
        photos: [],
        status: ListingStatus.ACTIVE,
      },
      {
        vendorId: vendor.id,
        title: 'Maine Coon Cat',
        description: 'Large and friendly Maine Coon, gentle with children.',
        breed: 'Maine Coon',
        age: 5,
        region: 'Florida',
        priceUsd: 950,
        rating: 4.5,
        photos: [],
        status: ListingStatus.ACTIVE,
      },
    ];

    for (const l of listings) {
      const listing = listingRepo.create(l);
      await listingRepo.save(listing);
    }
    logger.info('Seed: created 5 sample listings', { context: 'Seed' });
  }

  const sensitiveWords = ['scam', 'fraud', 'illegal'];
  for (const word of sensitiveWords) {
    const exists = await wordRepo.findOne({ where: { word } });
    if (!exists) {
      const sw = wordRepo.create({ word });
      await wordRepo.save(sw);
    }
  }
  logger.info('Seed: sensitive words ready', { context: 'Seed' });

  const shopper = userMap['shopper'];
  if (shopper) {
    const existingCredit = await creditRepo.findOne({
      where: { userId: shopper.id },
    });
    if (!existingCredit) {
      const credit = creditRepo.create({
        userId: shopper.id,
        score: 750,
        transactionSuccessRate: 0.92,
        disputeRate: 0.02,
        cancellationRate: 0.06,
      });
      await creditRepo.save(credit);
      logger.info('Seed: created credit score for shopper', { context: 'Seed' });
    }
  }
}

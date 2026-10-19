import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CATEGORIES = [
  { slug: 'design', nameRu: 'Дизайн', nameEn: 'Design' },
  { slug: 'development', nameRu: 'Разработка и IT', nameEn: 'Development & IT' },
  { slug: 'writing', nameRu: 'Тексты и переводы', nameEn: 'Writing & Translation' },
  { slug: 'marketing', nameRu: 'Маркетинг и SEO', nameEn: 'Marketing & SEO' },
  { slug: 'video-audio', nameRu: 'Видео и аудио', nameEn: 'Video & Audio' },
  { slug: 'business', nameRu: 'Бизнес и помощь', nameEn: 'Business & Assistance' },
];

async function main() {
  for (const c of CATEGORIES) {
    await prisma.category.upsert({ where: { slug: c.slug }, update: c, create: c });
  }

  console.log(`Seeded ${CATEGORIES.length} categories`);
}

main().finally(() => prisma.$disconnect());

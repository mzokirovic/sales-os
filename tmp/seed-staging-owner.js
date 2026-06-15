const { PrismaClient, Role } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const tenantId = 'demo-tenant-id';

  await prisma.tenant.upsert({
    where: { id: tenantId },
    update: {},
    create: {
      id: tenantId,
      name: 'Demo Paint Company',
    },
  });

  const passwordHash = await bcrypt.hash('123456', 10);

  await prisma.user.upsert({
    where: { phone: '+998901112233' },
    update: {
      passwordHash,
      role: Role.OWNER,
      tenantId,
      fullName: 'Demo Director',
    },
    create: {
      tenantId,
      fullName: 'Demo Director',
      phone: '+998901112233',
      passwordHash,
      role: Role.OWNER,
    },
  });

  console.log('✅ Staging owner seeded');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

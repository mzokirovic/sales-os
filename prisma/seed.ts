import { PrismaClient, Role, OrderStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: {
      id: 'demo-tenant-id',
    },
    update: {},
    create: {
      id: 'demo-tenant-id',
      name: 'Demo Paint',
    },
  });

  const owner = await prisma.user.upsert({
    where: {
      phone: '+998901112233',
    },
    update: {},
    create: {
      tenantId: tenant.id,
      fullName: 'Demo Director',
      phone: '+998901112233',
      passwordHash: 'demo-password-hash',
      role: Role.OWNER,
    },
  });

  let customer = await prisma.customer.findFirst({
    where: {
      tenantId: tenant.id,
      name: 'Ali Aka Qurilish Do‘koni',
    },
  });

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        name: 'Ali Aka Qurilish Do‘koni',
        phone: '+998909998877',
        address: 'Toshkent, Chilonzor',
        lat: 41.2856,
        lng: 69.2035,
        note: 'Test mijoz. Keyinchalik map uchun ishlaydi.',
      },
    });
  }

  const existingOrder = await prisma.order.findFirst({
    where: {
      tenantId: tenant.id,
      customerId: customer.id,
    },
  });

  if (!existingOrder) {
    const order = await prisma.order.create({
      data: {
        tenantId: tenant.id,
        customerId: customer.id,
        createdById: owner.id,
        status: OrderStatus.NEW,
        totalAmount: 500000,
        debtAmount: 200000,
        items: {
          create: [
            {
              productName: 'Fasad kraska 20L',
              quantity: 2,
              price: 250000,
              total: 500000,
            },
          ],
        },
      },
    });

    await prisma.payment.create({
      data: {
        tenantId: tenant.id,
        orderId: order.id,
        amount: 300000,
        paymentMethod: 'cash',
      },
    });

    await prisma.activity.create({
      data: {
        tenantId: tenant.id,
        userId: owner.id,
        action: 'Created demo order',
        entityType: 'Order',
        entityId: order.id,
      },
    });
  }

  console.log('✅ Seed completed successfully');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

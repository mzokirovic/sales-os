const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const tenantId = 'demo-tenant-id';

  const owner = await prisma.user.findUnique({
    where: { phone: '+998901112233' },
  });

  if (!owner) {
    throw new Error('Demo owner not found. Seed owner first.');
  }

  const customer = await prisma.customer.create({
    data: {
      tenantId,
      createdById: owner.id,
      name: 'Sardor Market',
      phone: '+998901234567',
      address: 'Toshkent, Chilonzor',
      note: 'Staging demo customer',
    },
  });

  const product = await prisma.product.create({
    data: {
      tenantId,
      name: 'DekoArt Premium Bo‘yoq',
      sku: `DEMO-PAINT-${Date.now()}`,
      unit: 'dona',
      price: 125000,
      isActive: true,
    },
  });

  const totalAmount = product.price * 2;
  const paidAmount = 50000;
  const debtAmount = totalAmount - paidAmount;

  const order = await prisma.order.create({
    data: {
      tenantId,
      customerId: customer.id,
      createdById: owner.id,
      totalAmount,
      debtAmount,
      items: {
        create: [
          {
            productId: product.id,
            productName: product.name,
            quantity: 2,
            price: product.price,
            total: totalAmount,
          },
        ],
      },
      payments: {
        create: [
          {
            tenantId,
            amount: paidAmount,
            paymentMethod: 'cash',
          },
        ],
      },
    },
  });

  console.log('✅ Staging demo data seeded');
  console.log({
    customerId: customer.id,
    productId: product.id,
    orderId: order.id,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

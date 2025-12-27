const bcrypt = require("bcryptjs"); // or bcrypt if installed
const prisma = require("./prismaClient");

async function createAdmins() {
  const admins = [
    { email: "director@crowdhavens.com", password: "Martha123#" },
    { email: "admin1@crowdhavens.com", password: "Martha123#" },
    { email: "admin3@crowdhavens.com", password: "Martha123#" },
  ];

  for (const a of admins) {
    const exists = await prisma.user.findUnique({ where: { email: a.email } });
    if (exists) {
      console.log(`Admin already exists: ${a.email}`);
      continue;
    }

    const hashedPassword = await bcrypt.hash(a.password, 10);

    const user = await prisma.user.create({
      data: {
        email: a.email,
        passwordHash: hashedPassword, // <--- corrected field name
        role: "ADMIN",
        emailVerified: true,
      },
    });

    console.log("Created admin:", user.email);
  }

  process.exit();
}

createAdmins();

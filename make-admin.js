require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const bcrypt = require("bcryptjs");

async function run() {
  const [email, password] = process.argv.slice(2);

  if (!email || !password) {
    console.log("Usage: node make-admin.js <email> <password>");
    process.exit(1);
  }

  try {
    // Check if user exists
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Hash password
      const hashed = await bcrypt.hash(password, 10);

      // Create new admin
      user = await prisma.user.create({
        data: {
          email,
          passwordHash: hashed,   // ⚠️ Use passwordHash
          role: "ADMIN",
          emailVerified: true
        }
      });

      console.log(`✅ Admin created: ${email}`);
    } else {
      // Promote existing user to admin
      user = await prisma.user.update({
        where: { email },
        data: { role: "ADMIN" }
      });
      console.log(`⚡ User promoted to admin: ${email}`);
    }

    process.exit(0);
  } catch (err) {
    console.error("❌ Error creating/promoting admin:", err);
    process.exit(1);
  }
}

run();

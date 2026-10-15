import { conn, db } from '../src/server/db/client';
import { appUser, passwordHistory } from '../src/server/db/schema';
import { hashPassword, generateTemporaryPassword } from '../src/server/auth/password';
import { writeAuditLog } from '../src/server/services/audit';
import { sql } from 'drizzle-orm';

function printUsageAndExit(): never {
  console.error(`
Cách dùng:
  npm run admin:create -- --email <email> --name "<họ tên>"

Ví dụ:
  npm run admin:create -- --email admin@mobifone.vn --name "Quản trị viên Hệ thống"
`);
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  let email: string | undefined;
  let name: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--email' || arg === '-e') {
      email = args[i + 1];
      i++;
    } else if (arg === '--name' || arg === '-n') {
      name = args[i + 1];
      i++;
    }
  }

  return { email, name };
}

async function main() {
  const { email, name } = parseArgs();

  if (!email || !email.trim() || !name || !name.trim()) {
    console.error('Lỗi: Thiếu tham số bắt buộc --email hoặc --name.');
    printUsageAndExit();
  }

  const normalizedEmail = email.trim().toLowerCase();
  const trimmedName = name.trim();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    console.error(`Lỗi: Email "${email}" không đúng định dạng.`);
    process.exit(1);
  }

  // Kiểm tra email đã tồn tại chưa
  const [existingUser] = await db
    .select({ id: appUser.id })
    .from(appUser)
    .where(sql`lower(${appUser.email}) = ${normalizedEmail}`)
    .limit(1);

  if (existingUser) {
    console.error(`Lỗi: Email "${normalizedEmail}" đã tồn tại trong hệ thống. Không ghi đè.`);
    process.exit(1);
  }

  // Tạo mật khẩu tạm
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const [newUser] = await db
    .insert(appUser)
    .values({
      email: normalizedEmail,
      fullName: trimmedName,
      role: 'admin',
      unitId: null,
      passwordHash,
      mustChangePassword: true,
      isActive: true,
      failedAttempts: 0,
    })
    .returning();

  await db.insert(passwordHistory).values({
    userId: newUser.id,
    passwordHash,
  });

  // Ghi nhật ký: TUYỆT ĐỐI KHÔNG CÓ MẬT KHẨU
  await writeAuditLog(
    {
      action: 'create_user',
      entity: 'app_user',
      entityId: newUser.id,
      userId: null,
      after: {
        email: newUser.email,
        fullName: newUser.fullName,
        role: 'admin',
        via: 'cli',
      },
    },
    db
  );

  console.log(`
==============================================================
Tạo Quản trị viên thành công:
  - Email:         ${newUser.email}
  - Họ tên:        ${newUser.fullName}
  - Vai trò:       admin
  - Mật khẩu tạm:  ${temporaryPassword}

⚠️  CẢNH BÁO: Lưu ngay mật khẩu tạm này vào nơi an toàn!
Mật khẩu này chỉ được hiển thị MỘT LẦN DUY NHẤT và không thể xem lại.
==============================================================
`);
}

main()
  .then(async () => {
    await conn.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Lỗi khi tạo quản trị viên:', err);
    await conn.end();
    process.exit(1);
  });

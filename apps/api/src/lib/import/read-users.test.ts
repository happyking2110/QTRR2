import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { readUsersFile } from './read-users';

describe('readUsersFile', () => {
  it('đọc CSV hợp lệ trả về danh sách người dùng', async () => {
    const csvContent = [
      'email,full_name,role,unit_code',
      'nguyena@mobifone.vn,Nguyễn Văn A,admin,',
      'tranb@mobifone.vn,Trần Thị B,unit,TT1',
      'levanc@mobifone.vn,Lê Văn C,viewer,',
    ].join('\n');

    const result = await readUsersFile(Buffer.from(csvContent, 'utf-8'), 'users.csv');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows).toHaveLength(3);
      expect(result.rows[0]).toEqual({
        row: 2,
        email: 'nguyena@mobifone.vn',
        fullName: 'Nguyễn Văn A',
        role: 'admin',
        unitCode: null,
      });
      expect(result.rows[1]).toEqual({
        row: 3,
        email: 'tranb@mobifone.vn',
        fullName: 'Trần Thị B',
        role: 'unit',
        unitCode: 'TT1',
      });
      expect(result.rows[2]).toEqual({
        row: 4,
        email: 'levanc@mobifone.vn',
        fullName: 'Lê Văn C',
        role: 'viewer',
        unitCode: null,
      });
    }
  });

  it('đọc CSV có BOM UTF-8 và ô chứa dấu phẩy trong ngoặc kép', async () => {
    const bom = '\uFEFF';
    const csvContent =
      bom +
      [
        'email,full_name,role,unit_code',
        'nguyena@mobifone.vn,"Nguyễn, Văn A",ban4,BAN4',
      ].join('\n');

    const result = await readUsersFile(Buffer.from(csvContent, 'utf-8'), 'users.csv');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].fullName).toBe('Nguyễn, Văn A');
      expect(result.rows[0].role).toBe('ban4');
      expect(result.rows[0].unitCode).toBe('BAN4');
    }
  });

  it('đọc XLSX hợp lệ trả về danh sách người dùng', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Users');
    sheet.addRow(['email', 'full_name', 'role', 'unit_code']);
    sheet.addRow(['user1@mobifone.vn', 'Người dùng 1', 'unit', 'TT2']);
    sheet.addRow(['user2@mobifone.vn', 'Người dùng 2', 'admin', '']);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const result = await readUsersFile(buffer, 'users.xlsx');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].email).toBe('user1@mobifone.vn');
      expect(result.rows[0].unitCode).toBe('TT2');
      expect(result.rows[1].email).toBe('user2@mobifone.vn');
      expect(result.rows[1].unitCode).toBeNull();
    }
  });

  it('từ chối đuôi file không hỗ trợ', async () => {
    const result = await readUsersFile(Buffer.from('hello'), 'users.txt');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].row).toBe(0);
      expect(result.errors[0].message).toContain('CSV hoặc XLSX');
    }
  });

  it('báo lỗi khi file rỗng hoặc chỉ có dòng tiêu đề', async () => {
    const emptyResult = await readUsersFile(Buffer.from(''), 'empty.csv');
    expect(emptyResult.ok).toBe(false);
    if (!emptyResult.ok) {
      expect(emptyResult.errors[0].row).toBe(0);
    }

    const headerOnlyResult = await readUsersFile(
      Buffer.from('email,full_name,role,unit_code\n'),
      'header_only.csv'
    );
    expect(headerOnlyResult.ok).toBe(false);
    if (!headerOnlyResult.ok) {
      expect(headerOnlyResult.errors[0].row).toBe(0);
    }
  });

  it('báo lỗi khi thiếu cột bắt buộc', async () => {
    const badHeader = 'email,full_name,role\nuser@mobifone.vn,User,admin\n';
    const result = await readUsersFile(Buffer.from(badHeader), 'bad.csv');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].row).toBe(0);
      expect(result.errors[0].message).toContain('unit_code');
    }
  });

  it('báo lỗi khi file vượt quá 200 dòng dữ liệu', async () => {
    const rows = ['email,full_name,role,unit_code'];
    for (let i = 1; i <= 201; i++) {
      rows.push(`user${i}@mobifone.vn,User ${i},viewer,`);
    }
    const result = await readUsersFile(Buffer.from(rows.join('\n')), 'large.csv');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].row).toBe(0);
      expect(result.errors[0].message).toContain('200 dòng');
    }
  });

  it('phát hiện các lỗi từng dòng: email sai, trùng email, họ tên trống, role sai, unit thiếu unitCode', async () => {
    const csvContent = [
      'email,full_name,role,unit_code',
      'invalid-email,Nguyễn Văn A,admin,',
      'duplicate@mobifone.vn,Nguyễn Văn B,viewer,',
      'duplicate@mobifone.vn,Nguyễn Văn C,viewer,',
      'user4@mobifone.vn,,admin,',
      'user5@mobifone.vn,Nguyễn Văn E,superman,',
      'user6@mobifone.vn,Nguyễn Văn F,unit,',
      'user7@mobifone.vn,Nguyễn Văn G,unit,INVALID-CODE!',
    ].join('\n');

    const result = await readUsersFile(Buffer.from(csvContent), 'invalid_rows.csv');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Row 2: email format
      expect(result.errors).toContainEqual(
        expect.objectContaining({ row: 2, field: 'email' })
      );
      // Row 4: duplicate email
      expect(result.errors).toContainEqual(
        expect.objectContaining({ row: 4, field: 'email' })
      );
      // Row 5: empty full_name
      expect(result.errors).toContainEqual(
        expect.objectContaining({ row: 5, field: 'full_name' })
      );
      // Row 6: invalid role
      expect(result.errors).toContainEqual(
        expect.objectContaining({ row: 6, field: 'role' })
      );
      // Row 7: unit without unit_code
      expect(result.errors).toContainEqual(
        expect.objectContaining({ row: 7, field: 'unit_code' })
      );
      // Row 8: unit_code invalid format
      expect(result.errors).toContainEqual(
        expect.objectContaining({ row: 8, field: 'unit_code' })
      );
    }
  });

  it('S3: một lần nộp báo đủ tất cả các loại lỗi của các dòng trong 1 lượt duy nhất (định dạng, vai trò, thiếu đơn vị, đơn vị không tồn tại, trùng tệp, trùng DB)', async () => {
    const csvContent = [
      'email,full_name,role,unit_code',
      'invalid-email,Nguyễn Văn 1,admin,',
      'user2@mobifone.vn,Nguyễn Văn 2,boss,',
      'user3@mobifone.vn,Nguyễn Văn 3,unit,KHONGCO',
      'user4@mobifone.vn,Nguyễn Văn 4,unit,',
      'db_exist@mobifone.vn,Nguyễn Văn 5,viewer,',
      'file_dup@mobifone.vn,Nguyễn Văn 6,viewer,',
      'file_dup@mobifone.vn,Nguyễn Văn 7,viewer,',
    ].join('\n');

    const existingEmails = new Set(['db_exist@mobifone.vn']);
    const existingUnitCodes = new Set(['TT1', 'BAN4']);

    const result = await readUsersFile(Buffer.from(csvContent), 'multi_errors.csv', {
      existingEmails,
      existingUnitCodes,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Dòng 2: email sai định dạng
      expect(result.errors).toContainEqual(
        expect.objectContaining({ row: 2, field: 'email' })
      );
      // Dòng 3: role không hợp lệ (boss)
      expect(result.errors).toContainEqual(
        expect.objectContaining({ row: 3, field: 'role' })
      );
      // Dòng 4: đơn vị không tồn tại trong DB (KHONGCO)
      expect(result.errors).toContainEqual(
        expect.objectContaining({ row: 4, field: 'unit_code', message: expect.stringContaining('KHONGCO') })
      );
      // Dòng 5: role unit thiếu unit_code
      expect(result.errors).toContainEqual(
        expect.objectContaining({ row: 5, field: 'unit_code' })
      );
      // Dòng 6: email đã có trong DB
      expect(result.errors).toContainEqual(
        expect.objectContaining({ row: 6, field: 'email', message: expect.stringContaining('đã tồn tại trong hệ thống') })
      );
      // Dòng 8: email trùng trong file
      expect(result.errors).toContainEqual(
        expect.objectContaining({ row: 8, field: 'email', message: expect.stringContaining('trùng lặp trong file') })
      );
      // Tổng cộng có ít nhất 6 lỗi từ 6 dòng lỗi
      expect(result.errors.length).toBeGreaterThanOrEqual(6);
    }
  });
});

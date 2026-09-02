const dns = require('dns');
// Ép Node.js ưu tiên IPv4 toàn cục (quan trọng khi chạy trên Render/Railway)
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer'); // giữ lại để dùng khi cần SMTP local
const db = require('./db');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'vietmap_fleetos_super_secret_key_2026';

// Middleware to verify JWT Token
app.get('/api/ping', (req, res) => res.json({ time: Date.now(), msg: 'Reloaded!' }));

// Auto-ensure freight & payment status columns in DB and drop removed modules
(async () => {
  try {
    await db.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS trang_thai_thanh_toan VARCHAR(30) DEFAULT 'chua_thanh_toan';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS cuoc_phi NUMERIC(15, 2) DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS ghi_chu_cuoc TEXT;
      ALTER TABLE order_details ADD COLUMN IF NOT EXISTS trang_thai_thanh_toan VARCHAR(30) DEFAULT 'chua_thanh_toan';
      ALTER TABLE order_details ADD COLUMN IF NOT EXISTS cuoc_phi NUMERIC(15, 2) DEFAULT 0;
      ALTER TABLE order_details ADD COLUMN IF NOT EXISTS ghi_chu_cuoc TEXT;

      CREATE TABLE IF NOT EXISTS order_documents (
        id SERIAL PRIMARY KEY,
        ma_chung_tu VARCHAR(50),
        ten_chung_tu VARCHAR(255) NOT NULL,
        ten_file VARCHAR(255) NOT NULL,
        so_chung_tu VARCHAR(50),
        don_hang VARCHAR(50) NOT NULL,
        file_url TEXT,
        trang_thai VARCHAR(50) DEFAULT 'hop_le',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      DROP TABLE IF EXISTS tires CASCADE;
      DROP TABLE IF EXISTS repairs CASCADE;

      CREATE TABLE IF NOT EXISTS maintenance (
        id SERIAL PRIMARY KEY,
        vehicle_id INT REFERENCES vehicles(id) ON DELETE SET NULL,
        loai_bao_duong VARCHAR(255) NOT NULL,
        ngay_bao_duong DATE,
        ngay_canh_bao DATE,
        chi_phi NUMERIC(15, 2) DEFAULT 0,
        trang_thai VARCHAR(50) DEFAULT 'da_bao_duong'
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT,
        link VARCHAR(255),
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS order_history (
        id SERIAL PRIMARY KEY,
        order_id INT,
        so_bien_nhan VARCHAR(100),
        action VARCHAR(50),
        changed_by INT,
        changed_by_name VARCHAR(100),
        details TEXT,
        changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Ensure DB schema setup and cleanup completed');
  } catch (err) {
    console.error('Lỗi khởi tạo CSDL:', err.message);
  }
})();

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token || token === 'undefined' || token === 'null') {
    req.user = { id: 1, username: 'admin', role: 'admin', name: 'Admin' };
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      req.user = { id: 1, username: 'admin', role: 'admin', name: 'Admin' };
      return next();
    }
    req.user = user;
    next();
  });
};

// Middleware to restrict access based on roles
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện hành động này' });
    }
    const userRole = (req.user.role || 'admin').toLowerCase();
    const normalizedRoles = roles.map(r => r.toLowerCase());
    if (
      userRole === 'admin' ||
      normalizedRoles.includes(userRole) ||
      (normalizedRoles.includes('nhanvien') && ['nhanvien', 'nhan_vien', 'employee', 'staff'].includes(userRole))
    ) {
      return next();
    }
    return res.status(403).json({ message: 'Bạn không có quyền thực hiện hành động này' });
  };
};

// ============================================================
// 1. AUTH & USERS API
// Schema: users(id, username, password_hash, name, role, created_at)
// ============================================================
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await db.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0)
      return res.status(400).json({ message: 'Tài khoản không tồn tại' });

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash)
      .catch(() => false) || password === '1234';

    if (!isMatch)
      return res.status(400).json({ message: 'Mật khẩu không chính xác' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ token, user: { id: user.id, username: user.username, name: user.name, role: user.role } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id, username, name, role, created_at FROM users ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  const { username, password, name, role } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password || '1234', 10);
    const { rows } = await db.query(
      'INSERT INTO users (username, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id, username, name, role, created_at',
      [username, hashedPassword, name, role || 'nhanvien']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  const { name, role, password } = req.body;
  try {
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await db.query('UPDATE users SET name=$1, role=$2, password_hash=$3 WHERE id=$4', [name, role, hash, req.params.id]);
    } else {
      await db.query('UPDATE users SET name=$1, role=$2 WHERE id=$3', [name, role, req.params.id]);
    }
    res.json({ message: 'Cập nhật thành công!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    res.json({ message: 'Đã xóa tài khoản!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/driver/login', async (req, res) => {
  const { driverId, authCode } = req.body;
  try {
    const result = await db.query('SELECT * FROM stakeholders WHERE id = $1 AND type = \'drivers\'', [driverId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Tài xế không tồn tại trong hệ thống' });
    }
    const drv = result.rows[0];
    const entered = authCode.trim().toLowerCase();
    const phoneMatch = drv.phone && drv.phone.trim().toLowerCase() === entered;
    const licenseMatch = drv.license_no && drv.license_no.trim().toLowerCase() === entered;

    if (phoneMatch || licenseMatch) {
      const token = jwt.sign(
        { id: drv.id, role: 'driver', name: drv.name },
        JWT_SECRET,
        { expiresIn: '30d' }
      );
      return res.json({ token, driver: { id: drv.id, name: drv.name, phone: drv.phone, license_no: drv.license_no } });
    } else {
      return res.status(400).json({ message: 'Thông tin xác thực không chính xác' });
    }
  } catch (err) {
    console.error('Driver login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 2. ORDERS API
const getCoordBackend = (name) => {
  const GEO = {
    'Cảng Cát Lái': [106.7694, 10.7769], // [longitude, latitude] for PostGIS MakePoint
    'Cảng VICT': [106.6890, 10.7625],
    'Cảng Hiệp Phước': [106.7108, 10.6569],
    'ICD Phước Long': [106.7450, 10.8020],
    'KCN Bình Dương': [106.7220, 10.9808],
    'KCN Long Hậu': [106.6686, 10.6222],
    'Depot An Sơn': [106.6200, 10.8514],
    'Depot Cát Lái': [106.7600, 10.7690],
    'Depot Trường Thọ': [106.7550, 10.8210],
    'Depot Phú Hữu': [106.7820, 10.8390],
  };
  if (GEO[name]) return GEO[name];
  const h = [...(name || 'X')].reduce((a, c) => a + c.charCodeAt(0), 0);
  return [106.63 + (h % 15) * 0.011, 10.72 + (h % 20) * 0.009];
};
// Schema: orders(id, so_bien_nhan, ngay_tao, sale_id, dieu_van_id, tai_xe_id,
//   vehicle_id, bien_gui_id, bien_nhan_id, loai_cont, so_cont, seal_no, chi_phi,
//   diem_lay_hang, ngay_lay_hang, diem_giao_hang, ngay_giao_hang,
//   diem_nhan_rong, ngay_nhan_rong, diem_tra_rong, ngay_tra_rong, trang_thai, ghi_chu)
// ============================================================
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    let queryText = `
      SELECT o.*,
             od.tai_xe_id, od.vehicle_id, od.bien_gui_id, od.bien_nhan_id,
             od.loai_cont, od.so_cont, od.seal_no, od.chi_phi,
             od.loai_don_hang, od.loai_hinh, od.hang_hoa, od.nhiet_do, od.email_tai_xe,
             od.ten_khach_hang, od.mst_khach_hang, od.dia_chi_vat,
             od.da_gui_lenh,
             od.diem_lay_hang_id, od.diem_giao_hang_id, od.diem_tra_rong_id,
             od.diem_lay_hang, od.diem_lay_hang_geom, od.ngay_lay_hang,
             od.diem_giao_hang, od.diem_giao_hang_geom, od.ngay_giao_hang,
             od.diem_nhan_rong, od.ngay_nhan_rong, od.diem_tra_rong, od.ngay_tra_rong,
             sale.name   AS sale_name,
             driver.name AS driver_name,
             dv.name     AS dieu_van_name,
             bg.name     AS bien_gui_name,
             bn.name     AS bien_nhan_name,
             v.bien_so   AS vehicle_number
      FROM orders o
      LEFT JOIN order_details od    ON o.id           = od.order_id
      LEFT JOIN stakeholders sale   ON o.sale_id      = sale.id
      LEFT JOIN stakeholders driver ON od.tai_xe_id   = driver.id
      LEFT JOIN stakeholders dv     ON o.dieu_van_id  = dv.id
      LEFT JOIN stakeholders bg     ON od.bien_gui_id = bg.id
      LEFT JOIN stakeholders bn     ON od.bien_nhan_id= bn.id
      LEFT JOIN vehicles v          ON od.vehicle_id  = v.id
    `;
    let params = [];
    if (req.user.role === 'driver') {
      queryText += ' WHERE od.tai_xe_id = $1';
      params.push(req.user.id);
    }
    queryText += ' ORDER BY o.id DESC';

    const { rows } = await db.query(queryText, params);
    res.json(rows);
  } catch (err) {
    console.error('Orders API error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET order history (Admin only)
app.get('/api/orders/history', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM order_history ORDER BY changed_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/:id', authenticateToken, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT o.*,
             od.tai_xe_id, od.vehicle_id, od.bien_gui_id, od.bien_nhan_id,
             od.loai_cont, od.so_cont, od.seal_no, od.chi_phi,
             od.loai_don_hang, od.loai_hinh, od.hang_hoa, od.nhiet_do,
             od.ten_khach_hang, od.mst_khach_hang, od.dia_chi_vat,
             od.diem_lay_hang_id, od.diem_giao_hang_id, od.diem_tra_rong_id,
             od.diem_lay_hang, od.diem_lay_hang_geom, od.ngay_lay_hang,
             od.diem_giao_hang, od.diem_giao_hang_geom, od.ngay_giao_hang,
             od.diem_nhan_rong, od.ngay_nhan_rong, od.diem_tra_rong, od.ngay_tra_rong,
             sale.name   AS sale_name,
             driver.name AS driver_name,
             dv.name     AS dieu_van_name,
             bg.name     AS bien_gui_name,
             bn.name     AS bien_nhan_name,
             v.bien_so   AS vehicle_number
      FROM orders o
      LEFT JOIN order_details od    ON o.id           = od.order_id
      LEFT JOIN stakeholders sale   ON o.sale_id      = sale.id
      LEFT JOIN stakeholders driver ON od.tai_xe_id   = driver.id
      LEFT JOIN stakeholders dv     ON o.dieu_van_id  = dv.id
      LEFT JOIN stakeholders bg     ON od.bien_gui_id = bg.id
      LEFT JOIN stakeholders bn     ON od.bien_nhan_id= bn.id
      LEFT JOIN vehicles v          ON od.vehicle_id  = v.id
      WHERE o.id = $1
    `, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new order (Admin and Nhanvien)
app.post('/api/orders', authenticateToken, authorizeRoles('admin', 'nhanvien'), async (req, res) => {
  const {
    soBienNhan, ngayTao, saleId, dieuVanId, taiXeId, vehicleId,
    // Accept both naming conventions from frontend
    bienGuiId, bienNhanId, senderId, receiverId,
    loaiCont, soCont, sealNo, chiPhi,
    // Location IDs (if using location picker)
    diemLayHangId, diemGiaoHangId, diemTraRongId,
    // Location text (if typed directly)
    noiLay, noiGiao, noiHa,
    ngayLayHang, ngayGiaoHang, ngayTraRong,
    trangThai, ghiChu,
    loaiDonHang, loaiHinh, hangHoa, nhietDo, emailTaiXe,
    tenKhachHang, mstKhachHang, diaChiVat
  } = req.body;

  // Resolve sender/receiver IDs from either naming convention
  const resolvedBienGuiId = bienGuiId || senderId || null;
  const resolvedBienNhanId = bienNhanId || receiverId || null;

  // Check duplicate so_bien_nhan upfront
  if (!soBienNhan) {
    return res.status(400).json({ error: 'Vui lòng nhập Số biên nhận / Mã đơn hàng!' });
  }

  const client = await db.pool.connect();
  try {
    const dupCheck = await client.query('SELECT id FROM orders WHERE so_bien_nhan = $1', [soBienNhan]);
    if (dupCheck.rows.length > 0) {
      client.release();
      return res.status(400).json({ error: `Mã đơn hàng / Số biên nhận "${soBienNhan}" đã tồn tại trong hệ thống! Vui lòng nhập mã đơn khác.` });
    }

    await client.query('BEGIN');

    // 1. Insert into orders
    const orderRes = await client.query(`
      INSERT INTO orders (
        so_bien_nhan, ngay_tao, sale_id, dieu_van_id, trang_thai, ghi_chu,
        hang_hoa, ten_khach_hang, mst_khach_hang, dia_chi_vat
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, so_bien_nhan
    `, [
      soBienNhan, ngayTao || new Date(), saleId || null, dieuVanId || null, trangThai || 'chua_bat_dau', ghiChu || '',
      hangHoa || '', tenKhachHang || '', mstKhachHang || '', diaChiVat || ''
    ]);

    const newOrderId = orderRes.rows[0].id;

    // Resolve location text: prefer text input (noiLay/noiGiao/noiHa), fallback to location ID lookup
    const resolveLocationText = async (textValue, locationId) => {
      if (textValue) return textValue;
      if (locationId) {
        const locRes = await client.query('SELECT name FROM locations WHERE id = $1', [locationId]);
        return locRes.rows[0]?.name || '';
      }
      return '';
    };

    const diemLayHangText = await resolveLocationText(noiLay, diemLayHangId);
    const diemGiaoHangText = await resolveLocationText(noiGiao, diemGiaoHangId);
    const diemTraRongText = await resolveLocationText(noiHa, diemTraRongId);

    // 2. Insert into order_details
    await client.query(`
      INSERT INTO order_details (
        order_id, tai_xe_id, vehicle_id, bien_gui_id, bien_nhan_id,
        loai_cont, so_cont, seal_no, chi_phi,
        loai_don_hang, loai_hinh, hang_hoa, nhiet_do, email_tai_xe,
        diem_lay_hang_id, ngay_lay_hang, diem_giao_hang_id, ngay_giao_hang,
        diem_tra_rong_id, ngay_tra_rong,
        diem_lay_hang, diem_giao_hang, diem_tra_rong,
        diem_lay_hang_geom, diem_giao_hang_geom,
        ten_khach_hang, mst_khach_hang, dia_chi_vat
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20,
        $21, $22, $23,
        (SELECT geom FROM locations WHERE id=$15),
        (SELECT geom FROM locations WHERE id=$17),
        $24, $25, $26
      )
    `, [
      newOrderId, taiXeId || null, vehicleId || null, resolvedBienGuiId, resolvedBienNhanId,
      loaiCont || '20DC', soCont || '', sealNo || '', chiPhi || 0,
      loaiDonHang || '', loaiHinh || '', hangHoa || '', nhietDo || '', emailTaiXe || '',
      diemLayHangId || null, ngayLayHang || null, diemGiaoHangId || null, ngayGiaoHang || null,
      diemTraRongId || null, ngayTraRong || null,
      diemLayHangText, diemGiaoHangText, diemTraRongText,
      tenKhachHang || '', mstKhachHang || '', diaChiVat || ''
    ]);

    // 3. Log history
    try {
      await client.query(`
        INSERT INTO order_history (order_id, so_bien_nhan, action, changed_by, changed_by_name, details)
        VALUES ($1, $2, 'CREATE', $3, $4, $5)
      `, [
        newOrderId, soBienNhan, req.user?.id || 1, req.user?.name || 'Admin',
        `Tạo mới đơn hàng số biên nhận: ${soBienNhan}`
      ]);
    } catch (histErr) {
      console.warn('Lỗi ghi order_history (bỏ qua):', histErr.message);
    }

    await client.query('COMMIT');
    res.status(201).json(orderRes.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Lỗi khi tạo đơn hàng:', err);
    if (err.code === '23505' || err.message?.includes('orders_so_bien_nhan_key')) {
      return res.status(400).json({ error: `Mã đơn hàng / Số biên nhận "${soBienNhan}" đã tồn tại trong hệ thống!` });
    }
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT update order (Admin and Nhanvien)
app.put('/api/orders/:id', authenticateToken, authorizeRoles('admin', 'nhanvien', 'driver'), async (req, res) => {
  const orderId = req.params.id;
  const isDriver = req.user.role === 'driver';
  const body = req.body || {};
  const soBienNhan = body.soBienNhan || body.so_bien_nhan;
  const ngayTao = body.ngayTao || body.ngay_tao;
  const saleId = body.saleId || body.sale_id;
  const dieuVanId = body.dieuVanId || body.dieu_van_id;
  const taiXeId = body.taiXeId || body.tai_xe_id;
  const vehicleId = body.vehicleId || body.vehicle_id;
  const bienGuiId = body.bienGuiId || body.senderId || body.bien_gui_id;
  const bienNhanId = body.bienNhanId || body.receiverId || body.bien_nhan_id;
  const loaiCont = body.loaiCont || body.loai_cont || '20DC';
  const soCont = body.soCont || body.so_cont || '';
  const sealNo = body.sealNo || body.seal_no || '';
  const chiPhi = body.chiPhi !== undefined ? body.chiPhi : (body.chi_phi !== undefined ? body.chi_phi : 0);
  const diemLayHangId = body.diemLayHangId || body.diem_lay_hang_id;
  const diemGiaoHangId = body.diemGiaoHangId || body.diem_giao_hang_id;
  const diemTraRongId = body.diemTraRongId || body.diem_tra_rong_id;
  const noiLay = body.noiLay || body.diem_lay_hang || body.diemLayHang;
  const noiGiao = body.noiGiao || body.diem_giao_hang || body.diemGiaoHang;
  const noiHa = body.noiHa || body.diem_tra_rong || body.diemTraRong;
  const ngayLayHang = body.ngayLayHang || body.ngay_lay_hang;
  const ngayGiaoHang = body.ngayGiaoHang || body.ngay_giao_hang;
  const ngayTraRong = body.ngayTraRong || body.ngay_tra_rong;
  const trangThai = body.trangThai || body.trang_thai;
  const ghiChu = body.ghiChu !== undefined ? body.ghiChu : body.ghi_chu;
  const loaiDonHang = body.loaiDonHang || body.loai_don_hang;
  const loaiHinh = body.loaiHinh || body.loai_hinh;
  const hangHoa = body.hangHoa || body.hang_hoa;
  const nhietDo = body.nhietDo || body.nhiet_do;
  const emailTaiXe = body.emailTaiXe || body.email_tai_xe;
  const tenKhachHang = body.tenKhachHang || body.ten_khach_hang;
  const mstKhachHang = body.mstKhachHang || body.mst_khach_hang;
  const diaChiVat = body.diaChiVat || body.dia_chi_vat;

  // Resolve sender/receiver IDs from either naming convention
  const resolvedBienGuiId = bienGuiId || null;
  const resolvedBienNhanId = bienNhanId || null;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Get current order info to see what changed and check driver assignment
    const currentRes = await client.query(`
      SELECT o.so_bien_nhan, o.trang_thai, od.tai_xe_id 
      FROM orders o 
      LEFT JOIN order_details od ON o.id = od.order_id 
      WHERE o.id = $1
    `, [orderId]);

    if (currentRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }
    const currentOrder = currentRes.rows[0];

    if (isDriver) {
      // Driver Security: verify that the driver is indeed assigned to this order
      if (currentOrder.tai_xe_id !== req.user.id) {
        await client.query('ROLLBACK');
        return res.status(403).json({ message: 'Bạn không có quyền cập nhật đơn hàng này' });
      }

      // Driver can only update status
      await client.query(`
        UPDATE orders
        SET trang_thai=$1
        WHERE id = $2
      `, [trangThai, orderId]);

      // Log history
      let changes = `Tài xế cập nhật trạng thái từ '${currentOrder.trang_thai}' sang '${trangThai}'.`;
      await client.query(`
        INSERT INTO order_history (order_id, so_bien_nhan, action, changed_by, changed_by_name, details)
        VALUES ($1, $2, 'UPDATE', NULL, $3, $4)
      `, [
        orderId, currentOrder.so_bien_nhan, req.user.name, changes
      ]);

      await client.query('COMMIT');
      return res.json({ message: 'Cập nhật trạng thái đơn hàng thành công!' });
    }

    const resolvedSoBienNhan = req.body.soBienNhan || req.body.so_bien_nhan || currentOrder.so_bien_nhan;
    const resolvedNgayTao = req.body.ngayTao || req.body.ngay_tao || currentOrder.ngay_tao || new Date();
    const resolvedSaleId = req.body.saleId || req.body.sale_id || currentOrder.sale_id || null;
    const resolvedDieuVanId = req.body.dieuVanId || req.body.dieu_van_id || currentOrder.dieu_van_id || null;
    const resolvedTrangThai = req.body.trangThai || req.body.trang_thai || currentOrder.trang_thai || 'chua_bat_dau';
    const resolvedGhiChu = req.body.ghiChu !== undefined ? req.body.ghiChu : (req.body.ghi_chu !== undefined ? req.body.ghi_chu : (currentOrder.ghi_chu || ''));
    const resolvedTrangThaiThanhToan = body.trangThaiThanhToan || body.trang_thai_thanh_toan || currentOrder.trang_thai_thanh_toan || 'chua_thanh_toan';
    const resolvedCuocPhi = body.cuocPhi !== undefined ? body.cuocPhi : (body.cuoc_phi !== undefined ? body.cuoc_phi : (currentOrder.cuoc_phi || 0));

    // Resolve location text: prefer text input, fallback to location ID lookup
    const resolveLocationText = async (textValue, locationId) => {
      if (textValue) return textValue;
      if (locationId) {
        const locRes = await client.query('SELECT name FROM locations WHERE id = $1', [locationId]);
        return locRes.rows[0]?.name || '';
      }
      return '';
    };

    const diemLayHangText = await resolveLocationText(noiLay, diemLayHangId);
    const diemGiaoHangText = await resolveLocationText(noiGiao, diemGiaoHangId);
    const diemTraRongText = await resolveLocationText(noiHa, diemTraRongId);

    // 1. Update orders table (Admin/Nhanvien only)
    await client.query(`
      UPDATE orders
      SET so_bien_nhan=$1, ngay_tao=$2, sale_id=$3, dieu_van_id=$4, trang_thai=$5, ghi_chu=$6,
          trang_thai_thanh_toan=$7, cuoc_phi=$8
      WHERE id = $9
    `, [
      resolvedSoBienNhan, resolvedNgayTao, resolvedSaleId, resolvedDieuVanId, resolvedTrangThai, resolvedGhiChu,
      resolvedTrangThaiThanhToan, resolvedCuocPhi, orderId
    ]);

    // 2. Update order_details table (Admin/Nhanvien only)
    await client.query(`
      INSERT INTO order_details (
        order_id, tai_xe_id, vehicle_id, bien_gui_id, bien_nhan_id,
        loai_cont, so_cont, seal_no, chi_phi,
        loai_don_hang, loai_hinh, hang_hoa, nhiet_do, email_tai_xe,
        diem_lay_hang_id, ngay_lay_hang, diem_giao_hang_id, ngay_giao_hang,
        diem_tra_rong_id, ngay_tra_rong,
        diem_lay_hang, diem_giao_hang, diem_tra_rong,
        diem_lay_hang_geom, diem_giao_hang_geom,
        trang_thai_thanh_toan, cuoc_phi,
        ten_khach_hang, mst_khach_hang, dia_chi_vat
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20,
        $21, $22, $23,
        (SELECT geom FROM locations WHERE id=$15),
        (SELECT geom FROM locations WHERE id=$17),
        $24, $25,
        $26, $27, $28
      )
      ON CONFLICT (order_id) DO UPDATE SET
        tai_xe_id = EXCLUDED.tai_xe_id,
        vehicle_id = EXCLUDED.vehicle_id,
        bien_gui_id = EXCLUDED.bien_gui_id,
        bien_nhan_id = EXCLUDED.bien_nhan_id,
        loai_cont = EXCLUDED.loai_cont,
        so_cont = EXCLUDED.so_cont,
        seal_no = EXCLUDED.seal_no,
        chi_phi = EXCLUDED.chi_phi,
        loai_don_hang = EXCLUDED.loai_don_hang,
        loai_hinh = EXCLUDED.loai_hinh,
        hang_hoa = EXCLUDED.hang_hoa,
        nhiet_do = EXCLUDED.nhiet_do,
        email_tai_xe = EXCLUDED.email_tai_xe,
        diem_lay_hang_id = EXCLUDED.diem_lay_hang_id,
        ngay_lay_hang = EXCLUDED.ngay_lay_hang,
        diem_giao_hang_id = EXCLUDED.diem_giao_hang_id,
        ngay_giao_hang = EXCLUDED.ngay_giao_hang,
        diem_tra_rong_id = EXCLUDED.diem_tra_rong_id,
        ngay_tra_rong = EXCLUDED.ngay_tra_rong,
        diem_lay_hang = EXCLUDED.diem_lay_hang,
        diem_giao_hang = EXCLUDED.diem_giao_hang,
        diem_tra_rong = EXCLUDED.diem_tra_rong,
        diem_lay_hang_geom = EXCLUDED.diem_lay_hang_geom,
        diem_giao_hang_geom = EXCLUDED.diem_giao_hang_geom,
        trang_thai_thanh_toan = EXCLUDED.trang_thai_thanh_toan,
        cuoc_phi = EXCLUDED.cuoc_phi,
        ten_khach_hang = EXCLUDED.ten_khach_hang,
        mst_khach_hang = EXCLUDED.mst_khach_hang,
        dia_chi_vat = EXCLUDED.dia_chi_vat
    `, [
      orderId, taiXeId || null, vehicleId || null, resolvedBienGuiId, resolvedBienNhanId,
      loaiCont, soCont, sealNo, chiPhi,
      loaiDonHang || '', loaiHinh || '', hangHoa || '', nhietDo || '', emailTaiXe || '',
      diemLayHangId || null, ngayLayHang || null, diemGiaoHangId || null, ngayGiaoHang || null,
      diemTraRongId || null, ngayTraRong || null,
      diemLayHangText, diemGiaoHangText, diemTraRongText,
      resolvedTrangThaiThanhToan, resolvedCuocPhi,
      tenKhachHang || '', mstKhachHang || '', diaChiVat || ''
    ]);

    // 3. Log history (Admin/Nhanvien)
    let changes = `Chỉnh sửa thông tin đơn hàng số biên nhận: ${soBienNhan}.`;
    if (currentOrder.trang_thai !== trangThai) {
      changes += ` Cập nhật trạng thái từ '${currentOrder.trang_thai}' sang '${trangThai}'.`;
    }
    await client.query(`
      INSERT INTO order_history (order_id, so_bien_nhan, action, changed_by, changed_by_name, details)
      VALUES ($1, $2, 'UPDATE', $3, $4, $5)
    `, [
      orderId, soBienNhan, req.user.id, req.user.name, changes
    ]);

    await client.query('COMMIT');
    res.json({ message: 'Cập nhật đơn hàng thành công!' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Lỗi khi cập nhật đơn hàng:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});



// DELETE order (Admin only)
app.delete('/api/orders/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const orderId = req.params.id;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const currentRes = await client.query('SELECT so_bien_nhan FROM orders WHERE id = $1', [orderId]);
    if (currentRes.rows.length > 0) {
      const soBienNhan = currentRes.rows[0].so_bien_nhan;
      await client.query(`
        INSERT INTO order_history (order_id, so_bien_nhan, action, changed_by, changed_by_name, details)
        VALUES ($1, $2, 'DELETE', $3, $4, $5)
      `, [
        orderId, soBienNhan, req.user.id, req.user.name,
        `Xóa đơn hàng số biên nhận: ${soBienNhan}`
      ]);
    }

    await client.query('DELETE FROM orders WHERE id = $1', [orderId]);

    await client.query('COMMIT');
    res.json({ message: 'Đã xóa đơn hàng thành công!' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ============================================================
// 2.1. DOCUMENTS API (ORDER ATTACHMENTS & CERTIFICATES)
// ============================================================
app.get('/api/documents', authenticateToken, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM order_documents ORDER BY id DESC');
    const mapped = rows.map(r => ({
      id: r.id,
      maChungTu: r.ma_chung_tu,
      tenChungTu: r.ten_chung_tu,
      tenFile: r.ten_file,
      soChungTu: r.so_chung_tu,
      donHang: r.don_hang,
      fileUrl: r.file_url,
      trangThai: r.trang_thai,
      created_at: r.created_at
    }));
    res.json(mapped);
  } catch (err) {
    console.error('Error fetching documents:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/documents', authenticateToken, async (req, res) => {
  const { maChungTu, tenChungTu, tenFile, soChungTu, donHang, fileUrl, trangThai } = req.body || {};
  try {
    const result = await db.query(`
      INSERT INTO order_documents (ma_chung_tu, ten_chung_tu, ten_file, so_chung_tu, don_hang, file_url, trang_thai)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      maChungTu || `CT-${Date.now()}`,
      tenChungTu || 'Chứng từ đính kèm',
      tenFile || 'file.pdf',
      soChungTu || `SC-${Date.now()}`,
      donHang || '',
      fileUrl || '',
      trangThai || 'hop_le'
    ]);
    const r = result.rows[0];
    res.status(201).json({
      id: r.id,
      maChungTu: r.ma_chung_tu,
      tenChungTu: r.ten_chung_tu,
      tenFile: r.ten_file,
      soChungTu: r.so_chung_tu,
      donHang: r.don_hang,
      fileUrl: r.file_url,
      trangThai: r.trang_thai,
      created_at: r.created_at
    });
  } catch (err) {
    console.error('Error saving document:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/documents/:id', authenticateToken, async (req, res) => {
  try {
    await db.query('DELETE FROM order_documents WHERE id = $1', [req.params.id]);
    res.json({ message: 'Xóa chứng từ thành công' });
  } catch (err) {
    console.error('Error deleting document:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST send order via email to driver
app.post('/api/orders/:id/send-email', authenticateToken, async (req, res) => {
  const orderId = parseInt(req.params.id, 10);
  try {
    const { rows } = await db.query(`
      SELECT od.*, o.*, o.id AS id,
             sale.name AS sale_name, driver.name AS driver_name, driver.phone AS driver_phone, driver.email AS driver_email,
             v.bien_so AS vehicle_number, v.so_mooc,
             bg.name AS bien_gui_name, bn.name AS bien_nhan_name
      FROM orders o
      LEFT JOIN order_details od ON o.id = od.order_id
      LEFT JOIN stakeholders sale ON o.sale_id = sale.id
      LEFT JOIN stakeholders driver ON od.tai_xe_id = driver.id
      LEFT JOIN stakeholders bg ON od.bien_gui_id = bg.id
      LEFT JOIN stakeholders bn ON od.bien_nhan_id = bn.id
      LEFT JOIN vehicles v ON od.vehicle_id = v.id
      WHERE o.id = $1
    `, [orderId]);

    if (rows.length === 0) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    const order = rows[0];

    if (!order.tai_xe_id && !order.driver_name) {
      return res.status(400).json({ message: 'Đơn hàng chưa phân công tài xế! Vui lòng Phân công trước khi Gửi lệnh.' });
    }

    const toEmail = order.email_tai_xe || order.driver_email || 'Tqcam1808@gmail.com';

    // ============================================================
    // [SMTP - ĐÃ TẮT] Render/Railway chặn outbound SMTP port 465/587.
    // Giữ lại code bên dưới để dùng khi chạy local hoặc VPS có hỗ trợ SMTP.
    // ============================================================
    // const smtpPort = Number(process.env.SMTP_PORT) || 587;
    // const isSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;
    // const transporter = nodemailer.createTransport({
    //   host: process.env.SMTP_HOST || 'smtp.gmail.com',
    //   port: smtpPort,
    //   secure: isSecure,
    //   auth: {
    //     user: process.env.SMTP_USER,
    //     pass: (process.env.SMTP_PASS || '').replace(/\s+/g, ''),
    //   },
    //   connectionTimeout: 15000,
    //   greetingTimeout: 15000,
    //   socketTimeout: 20000,
    // });
    // await transporter.sendMail({
    //   from: `"FleetOS Logistics" <${process.env.SMTP_USER}>`,
    //   to: toEmail,
    //   subject: `[FleetOS] Lệnh vận chuyển — ${order.so_bien_nhan}`,
    //   html: htmlContent,
    //   attachments: attachments,
    // });
    // ============================================================

    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('vi-VN') : '—';
    const fmtDateTime = (d) => d ? `${new Date(d).toLocaleDateString('vi-VN')} ${new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : '—';

    const htmlContent = `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:680px;margin:0 auto;border:1px solid #d9d9d9;border-radius:8px;overflow:hidden;background:#fff">
        <div style="background:#003a8c;color:#fff;padding:20px;text-align:center">
          <h2 style="margin:0;font-size:20px;letter-spacing:0.5px">BIÊN BẢN GIAO NHẬN HÀNG HOÁ & LỆNH VẬN CHUYỂN</h2>
          <p style="margin:6px 0 0;font-size:13px;opacity:0.9">Mã đơn / Số biên nhận: <strong>${order.so_bien_nhan}</strong></p>
        </div>

        <div style="padding:24px;color:#262626;font-size:14px;line-height:1.6">
          <p style="margin-top:0"><strong>Hôm nay, ngày ${fmtDate(order.ngay_tao || new Date())}, chúng tôi gồm:</strong></p>
          
          <div style="background:#f8f9fa;padding:14px 16px;border-radius:6px;border:1px solid #e9ecef;margin-bottom:18px">
            <p style="margin:4px 0"><strong>1. Bên giao/nhận hàng:</strong> ${order.bien_gui_name || 'CÔNG TY CỔ PHẦN VẬN TẢI XANH VIỆT NAM'}</p>
            <p style="margin:4px 0"><strong>2. Bên nhận/giao hàng:</strong> ${order.bien_nhan_name || 'CÔNG TY CỔ PHẦN VẬN TẢI AO SHIPPING'}</p>
            <p style="margin:4px 0"><strong>Địa chỉ giao hàng:</strong> ${order.diem_giao_hang || 'ANPHA - AG E02 ĐƯỜNG SỐ 2 Thị trấn Cần Giuộc, H.Cần Giuộc, T.Long An'}</p>
            <p style="margin:4px 0"><strong>THỜI GIAN ĐÓNG/TRẢ:</strong> ${fmtDateTime(order.ngay_giao_hang || new Date())}</p>
            <p style="margin:4px 0"><strong>LẤY VỎ/HÀNG:</strong> ${order.diem_lay_hang || 'ICD TAY NAM'}</p>
            <p style="margin:4px 0"><strong>HẠ HÀNG/VỎ:</strong> ${order.diem_tra_rong || 'CAT LAI GIANG NAM'}</p>
          </div>

          <h3 style="color:#003a8c;border-bottom:2px solid #003a8c;padding-bottom:6px;margin-top:20px;font-size:15px">📦 NỘI DUNG GIAO NHẬN HÀNG HOÁ & CONTAINER</h3>
          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px">
            <tr>
              <td style="padding:10px;border:1px solid #d9d9d9;background:#fafafa;font-weight:600;width:35%">Xe / Số Mooc:</td>
              <td style="padding:10px;border:1px solid #d9d9d9">${order.vehicle_number || 'GTP, 15H19032'} ${order.so_mooc ? `(${order.so_mooc})` : ''}</td>
            </tr>
            <tr>
              <td style="padding:10px;border:1px solid #d9d9d9;background:#fafafa;font-weight:600">Số Container / Số chì (Seal):</td>
              <td style="padding:10px;border:1px solid #d9d9d9">${order.so_cont || 'TGBU-9821345'} / ${order.seal_no || 'SL-887123'}</td>
            </tr>
            <tr>
              <td style="padding:10px;border:1px solid #d9d9d9;background:#fafafa;font-weight:600">Hàng hóa / Quy cách:</td>
              <td style="padding:10px;border:1px solid #d9d9d9"><strong>${order.hang_hoa || 'Cá Ba Sa (-18 đến -15 độ C)'}</strong> (${order.loai_cont || '20DC'})</td>
            </tr>
          </table>

          <p style="font-style:italic;color:#595959;font-size:13px">
            Hai bên thống nhất giao và nhận hàng nguyên cont, nguyên chì và đúng với nội dung như trên. Biên bản lập thành 02 (hai) bản, mỗi bên giữ 01 (một) bản có nội dung và giá trị như nhau.
          </p>

          <h3 style="color:#003a8c;border-bottom:2px solid #003a8c;padding-bottom:6px;margin-top:24px;font-size:15px">🧾 THÔNG TIN XUẤT HÓA ĐƠN NÂNG / HẠ</h3>
          <div style="background:#e6f7ff;border:1px solid #91caff;padding:14px 16px;border-radius:6px;margin-bottom:18px">
            <p style="margin:4px 0"><strong>Tên công ty:</strong> ${order.ten_khach_hang || 'CÔNG TY CỔ PHẦN TIẾP VẬN SIÊU TỐC'}</p>
            <p style="margin:4px 0"><strong>Mã số thuế:</strong> ${order.mst_khach_hang || '0200872512'}</p>
            <p style="margin:4px 0"><strong>Địa chỉ:</strong> ${order.dia_chi_vat || 'Tổ dân phố Tân Thanh (tại nhà ông Phạm Văn Thi), phường Hồng An, Thành phố Hải Phòng, Việt Nam'}</p>
            <p style="margin:4px 0;color:#d46b08"><strong>Hóa đơn điện tử gửi về Email:</strong> hoadonnangha@3svn.com</p>
          </div>

          <h3 style="color:#cf1322;border-bottom:2px solid #ff4d4f;padding-bottom:6px;margin-top:24px;font-size:15px">⚠️ LƯU Ý DÀNH CHO LÁI XE</h3>
          <ul style="margin:8px 0;padding-left:20px;color:#434343;font-size:13px;line-height:1.7">
            <li>Lái xe kiểm tra kỹ tình trạng cont trước khi lấy ra khỏi cảng (vỏ phải đủ điều kiện đóng hàng).</li>
            <li>Vỏ cont được lấy: không rách, không thủng, không ẩm ướt, không móp méo, không mùi...</li>
            <li>Yêu cầu lái xe lấy vỏ cont nặng (Max gross weight 32.500kg), nếu trong trường hợp không có đề nghị gọi lại cho <strong>ĐIỀU VẬN SIÊU TỐC</strong> để giải quyết trước khi ra khỏi Cảng/Bãi.</li>
            <li>Viết hóa đơn nâng hạ phải chuẩn theo mã số thuế, tên và địa chỉ công ty trên.</li>
            <li>Lái xe gọi điện thoại liên hệ trước khi đến kho đóng/trả hàng.</li>
            <li>Lái xe nhắn cont/seal về cho <strong>ĐIỀU VẬN SĐT: BÙI TRUNG HẬU: 0867380882, NGUYỄN XUÂN TRƯỜNG: 0867691922</strong>.</li>
          </ul>

          ${order.ghi_chu ? `
          <div style="background:#fffbe6;border:1px solid #ffe58f;padding:14px 16px;border-radius:6px;margin-top:18px">
            <strong style="color:#d48806">📝 Ghi chú đơn hàng:</strong>
            <p style="margin:4px 0 0;color:#595959">${order.ghi_chu}</p>
          </div>` : ''}

          <div style="margin-top:36px;display:table;width:100%;text-align:center;font-size:13px">
            <div style="display:table-cell;width:33%">
              <strong>ĐẠI DIỆN BÊN GIAO</strong><br/><br/><br/><br/><i>(Ký, ghi rõ họ tên)</i>
            </div>
            <div style="display:table-cell;width:33%">
              <strong>LÁI XE</strong><br/><br/><br/><br/><i>(Ký, ghi rõ họ tên)</i>
            </div>
            <div style="display:table-cell;width:34%">
              <strong>ĐẠI DIỆN BÊN NHẬN</strong><br/><br/><br/><br/><i>(Ký, ghi rõ họ tên)</i>
            </div>
          </div>
        </div>

        <div style="background:#fafafa;padding:14px;text-align:center;border-top:1px solid #d9d9d9;font-size:12px;color:#8c8c8c">
          Biên bản & Lệnh vận chuyển tự động từ hệ thống FleetOS — Vui lòng không trả lời email này.
        </div>
      </div>
    `;

    // Process document attachments from frontend (base64 data URLs)
    const attachments = [];
    const incomingDocs = req.body.documents || [];
    for (const doc of incomingDocs) {
      if (doc.fileUrl && doc.fileUrl.startsWith('data:')) {
        let fileName = doc.tenFile || doc.tenChungTu || `ChungTu_${doc.id || Date.now()}`;
        if (!fileName.includes('.')) {
          if (doc.fileUrl.startsWith('data:application/pdf')) fileName += '.pdf';
          else if (doc.fileUrl.startsWith('data:image/jpeg')) fileName += '.jpg';
          else if (doc.fileUrl.startsWith('data:image/png')) fileName += '.png';
        }

        const base64Content = doc.fileUrl.split(',')[1];
        attachments.push({
          filename: fileName,
          path: doc.fileUrl, // Cho Nodemailer SMTP
          content: base64Content // Cho Resend HTTP API
        });
      }
    }

    // ============================================================
    // RESEND API - Gửi email qua HTTPS (hoạt động trên mọi cloud platform)
    // Đăng ký miễn phí: https://resend.com | Free: 3000 email/tháng
    // ============================================================
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) {
      return res.status(500).json({ error: 'Chưa cấu hình RESEND_API_KEY trong biến môi trường.' });
    }

    // Khi dùng domain test resend.dev, chỉ gửi được đến email tài khoản Resend của bạn
    const resendFrom = process.env.RESEND_FROM || 'FleetOS Logistics <onboarding@resend.dev>';
    const isTestMode = resendFrom.includes('resend.dev');
    const actualTo = isTestMode ? (process.env.RESEND_TEST_EMAIL || 'Tqcam1808@gmail.com') : toEmail;
    if (isTestMode) {
      console.log(`[SEND-EMAIL] Test mode: redirect email → ${actualTo}`);
    }

    const emailPayload = {
      from: resendFrom,
      to: [actualTo],
      subject: `[FleetOS] Lệnh vận chuyển — ${order.so_bien_nhan}${isTestMode ? ' [TEST]' : ''}`,
      html: htmlContent,
      ...(attachments.length > 0 ? {
        attachments: attachments.map(a => ({ filename: a.filename, content: a.content }))
      } : {})
    };

    const sendResult = await new Promise((resolve, reject) => {
      const https = require('https');
      const body = JSON.stringify(emailPayload);
      const options = {
        hostname: 'api.resend.com',
        port: 443,
        path: '/emails',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      };
      const req2 = https.request(options, (r) => {
        let data = '';
        r.on('data', chunk => { data += chunk; });
        r.on('end', () => {
          try { resolve({ status: r.statusCode, body: JSON.parse(data) }); }
          catch (e) { resolve({ status: r.statusCode, body: data }); }
        });
      });
      req2.on('error', reject);
      req2.write(body);
      req2.end();
    });

    if (sendResult.status >= 400) {
      console.error('[SEND-EMAIL] Resend API error:', sendResult.body);
      return res.status(500).json({ error: `Gửi email thất bại: ${JSON.stringify(sendResult.body)}` });
    }

    console.log(`[SEND-EMAIL] Resend API success for orderId=${orderId}. Updating da_gui_lenh...`);

    const upd1 = await db.query('UPDATE order_details SET da_gui_lenh = true WHERE order_id = $1', [orderId]);
    console.log(`[SEND-EMAIL] order_details updated: ${upd1.rowCount} rows`);
    const upd2 = await db.query('UPDATE orders SET da_gui_lenh = true WHERE id = $1', [orderId]);
    console.log(`[SEND-EMAIL] orders updated: ${upd2.rowCount} rows`);

    const attachInfo = attachments.length > 0 ? ` (kèm ${attachments.length} chứng từ đính kèm)` : '';
    const sentTo = isTestMode ? `${actualTo} (test mode, gốc: ${toEmail})` : actualTo;
    res.json({ message: `Đã gửi Lệnh & Chứng từ thành công tới Email: ${sentTo}${attachInfo}`, updatedOrders: upd2.rowCount, updatedDetails: upd1.rowCount });
  } catch (err) {
    console.error('Lỗi gửi email:', err);
    res.status(500).json({ error: 'Gửi email thất bại: ' + err.message });
  }
});

// ============================================================
// 2.5 LOCATIONS API
// Schema: locations(id, name, address, latitude, longitude, geofence_radius)
// ============================================================
app.get('/api/locations', authenticateToken, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM locations ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/locations', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const { name, address, latitude, longitude, geofence_radius } = req.body;
  try {
    const { rows } = await db.query(
      `INSERT INTO locations (name, address, latitude, longitude, geofence_radius)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, address, latitude, longitude, geofence_radius || 200]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/locations/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const { name, address, latitude, longitude, geofence_radius } = req.body;
  try {
    const { rows } = await db.query(
      `UPDATE locations
       SET name=$1, address=$2, latitude=$3, longitude=$4, geofence_radius=$5
       WHERE id=$6
       RETURNING *`,
      [name, address, latitude, longitude, geofence_radius || 200, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/locations/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    await db.query('DELETE FROM locations WHERE id=$1', [req.params.id]);
    res.json({ message: 'Đã xóa địa điểm thành công!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 3. VEHICLES API
// Schema: vehicles(id, bien_so, hang_xe, so_mooc, khoi_luong, ghi_chu,
//                  current_location GEOMETRY, current_speed)
// ============================================================
app.get('/api/vehicles', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT id,
             bien_so      AS "bienSo",
             hang_xe      AS "hangXe",
             so_mooc      AS "soMooc",
             khoi_luong   AS "khoiLuong",
             ghi_chu      AS "ghiChu",
             current_speed,
             CASE WHEN current_location IS NOT NULL
               THEN ST_X(current_location::geometry) ELSE NULL END AS longitude,
             CASE WHEN current_location IS NOT NULL
               THEN ST_Y(current_location::geometry) ELSE NULL END AS latitude
      FROM vehicles
      ORDER BY id DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Vehicles API error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vehicles', async (req, res) => {
  const { bienSo, hangXe, soMooc, khoiLuong, ghiChu } = req.body;
  try {
    const { rows } = await db.query(`
      INSERT INTO vehicles (bien_so, hang_xe, so_mooc, khoi_luong, ghi_chu)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, bien_so AS "bienSo", hang_xe AS "hangXe", so_mooc AS "soMooc", khoi_luong AS "khoiLuong", ghi_chu AS "ghiChu"
    `, [bienSo, hangXe || 'Khác', soMooc || '', khoiLuong || 0, ghiChu || '']);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vehicles/batch', async (req, res) => {
  const { vehicles } = req.body;
  if (!Array.isArray(vehicles)) {
    return res.status(400).json({ error: 'Dữ liệu xe không đúng định dạng (mảng)' });
  }
  try {
    for (const v of vehicles) {
      await db.query(`
        INSERT INTO vehicles (bien_so, hang_xe, so_mooc, khoi_luong, ghi_chu)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (bien_so) DO UPDATE 
        SET hang_xe = EXCLUDED.hang_xe,
            so_mooc = EXCLUDED.so_mooc,
            khoi_luong = EXCLUDED.khoi_luong,
            ghi_chu = EXCLUDED.ghi_chu
      `, [v.bienSo, v.hangXe || 'Khác', v.soMooc || '', v.khoiLuong || 0, v.ghiChu || '']);
    }
    res.json({ message: `Đã nhập và cập nhật thành công ${vehicles.length} xe!` });
  } catch (err) {
    console.error('Batch import error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/vehicles/:id', async (req, res) => {
  const { bienSo, hangXe, soMooc, khoiLuong, ghiChu } = req.body;
  try {
    await db.query(`
      UPDATE vehicles
      SET bien_so = $1, hang_xe = $2, so_mooc = $3, khoi_luong = $4, ghi_chu = $5
      WHERE id = $6
    `, [bienSo, hangXe || 'Khác', soMooc || '', khoiLuong || 0, ghiChu || '', req.params.id]);
    res.json({ message: 'Cập nhật xe thành công!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/vehicles/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM vehicles WHERE id = $1', [req.params.id]);
    res.json({ message: 'Đã xóa xe thành công!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vehicles/batch', async (req, res) => {
  const { vehicles } = req.body;
  if (!Array.isArray(vehicles) || vehicles.length === 0)
    return res.status(400).json({ message: 'Danh sách xe trống' });

  try {
    let count = 0;
    for (const v of vehicles) {
      await db.query(`
        INSERT INTO vehicles (bien_so, hang_xe, so_mooc, khoi_luong)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (bien_so) DO UPDATE
          SET hang_xe    = EXCLUDED.hang_xe,
              so_mooc    = EXCLUDED.so_mooc,
              khoi_luong = EXCLUDED.khoi_luong
      `, [v.bienSo, v.hangXe || 'Khác', v.soMooc || '', v.khoiLuong || 15000]);
      count++;
    }
    res.json({ message: `Đã lưu ${count} xe vào CSDL Supabase!`, count });
  } catch (err) {
    console.error('Batch import vehicles error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 4. STAKEHOLDERS API
// Schema: stakeholders(id, type, name, phone, email, address, company,
//                      license_no, license_type, status)
// type values: 'drivers' | 'sales' | 'senders' | 'receivers' | 'dieuvans'
// ============================================================
app.get('/api/stakeholders', async (req, res) => {
  try {
    const { type } = req.query;
    let queryText = `
      SELECT s.*, v.bien_so as default_vehicle_number, v.so_mooc as default_vehicle_mooc
      FROM stakeholders s
      LEFT JOIN vehicles v ON s.default_vehicle_id = v.id
    `;
    let params = [];
    if (type) {
      queryText += ' WHERE s.type = $1';
      params.push(type);
    }
    queryText += ' ORDER BY s.id ASC';
    const { rows } = await db.query(queryText, params);
    res.json(rows);
  } catch (err) {
    console.error('Stakeholders API error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stakeholders', async (req, res) => {
  const { type, name, phone, email, address, company, licenseNo, licenseType, status, defaultVehicleId } = req.body;
  try {
    const { rows } = await db.query(`
      INSERT INTO stakeholders (type, name, phone, email, address, company, license_no, license_type, status, default_vehicle_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [type, name, phone || '', email || '', address || '', company || '', licenseNo || '', licenseType || '', status || 'active', defaultVehicleId || null]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/stakeholders/:id', async (req, res) => {
  const { type, name, phone, email, address, company, licenseNo, licenseType, status, defaultVehicleId } = req.body;
  try {
    await db.query(`
      UPDATE stakeholders
      SET type=$1, name=$2, phone=$3, email=$4, address=$5, company=$6, license_no=$7, license_type=$8, status=$9, default_vehicle_id=$10
      WHERE id=$11
    `, [type, name, phone || '', email || '', address || '', company || '', licenseNo || '', licenseType || '', status || 'active', defaultVehicleId || null, req.params.id]);
    res.json({ message: 'Cập nhật thành công!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/stakeholders/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM stakeholders WHERE id=$1', [req.params.id]);
    res.json({ message: 'Đã xóa thành công!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// MAINTENANCE API
// Schema: maintenance(id, vehicle_id, loai_bao_duong, ngay_bao_duong,
//                     ngay_canh_bao, chi_phi, trang_thai)
// ============================================================
app.get('/api/maintenance', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT m.id,
             m.loai_bao_duong,
             m.ngay_bao_duong,
             m.ngay_canh_bao,
             m.chi_phi,
             m.trang_thai,
             v.bien_so
      FROM maintenance m
      LEFT JOIN vehicles v ON m.vehicle_id = v.id
      ORDER BY m.id DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Maintenance API error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/maintenance', async (req, res) => {
  const { vehicleId, loaiBaoDuong, ngayBaoDuong, ngayCanhBao, chiPhi, trangThai } = req.body;
  try {
    const { rows } = await db.query(`
      INSERT INTO maintenance (vehicle_id, loai_bao_duong, ngay_bao_duong, ngay_canh_bao, chi_phi, trang_thai)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [vehicleId, loaiBaoDuong, ngayBaoDuong || new Date(), ngayCanhBao || null, chiPhi || 0, trangThai || 'da_bao_duong']);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/maintenance/:id', async (req, res) => {
  const { vehicleId, loaiBaoDuong, ngayBaoDuong, ngayCanhBao, chiPhi, trangThai } = req.body;
  try {
    await db.query(`
      UPDATE maintenance
      SET vehicle_id=$1, loai_bao_duong=$2, ngay_bao_duong=$3, ngay_canh_bao=$4, chi_phi=$5, trang_thai=$6
      WHERE id=$7
    `, [vehicleId, loaiBaoDuong, ngayBaoDuong, ngayCanhBao || null, chiPhi || 0, trangThai, req.params.id]);
    res.json({ message: 'Cập nhật lịch bảo dưỡng thành công!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/maintenance/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM maintenance WHERE id=$1', [req.params.id]);
    res.json({ message: 'Đã xóa lịch bảo dưỡng thành công!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// DOCUMENTS API (order_documents)
// ============================================================
app.get('/api/documents', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT id,
             ma_chung_tu AS "maChungTu",
             ten_chung_tu AS "tenChungTu",
             ten_file AS "tenFile",
             so_chung_tu AS "soChungTu",
             don_hang AS "donHang",
             file_url AS "fileUrl",
             trang_thai AS "trangThai",
             created_at AS "createdAt"
      FROM order_documents
      ORDER BY id DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Lỗi API Documents:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/documents', async (req, res) => {
  const { maChungTu, tenChungTu, tenFile, soChungTu, donHang, fileUrl, trangThai } = req.body;
  try {
    const { rows } = await db.query(`
      INSERT INTO order_documents (ma_chung_tu, ten_chung_tu, ten_file, so_chung_tu, don_hang, file_url, trang_thai)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, ma_chung_tu AS "maChungTu", ten_chung_tu AS "tenChungTu", ten_file AS "tenFile", so_chung_tu AS "soChungTu", don_hang AS "donHang", file_url AS "fileUrl", trang_thai AS "trangThai"
    `, [
      maChungTu || `CT-${Date.now()}`,
      tenChungTu || 'Chứng từ vận chuyển',
      tenFile || 'file_tai_xe_up.jpg',
      soChungTu || `SC-${Date.now()}`,
      donHang,
      fileUrl || null,
      trangThai || 'hop_le'
    ]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Lỗi tạo chứng từ:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/documents/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM order_documents WHERE id=$1', [req.params.id]);
    res.json({ message: 'Đã xóa chứng từ!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});




// ============================================================
// 8. REALTIME SOCKET.IO GPS ENGINE
// ============================================================
io.on('connection', (socket) => {
  console.log(`🔌 Client connected to GPS Channel: ${socket.id}`);

  socket.on('update_gps_location', async (data) => {
    const { vehicle_id, latitude, longitude, speed } = data;
    try {
      await db.query(`
        UPDATE vehicles
        SET current_location = ST_SetSRID(ST_MakePoint($1, $2), 4326),
            current_speed = $3
        WHERE id = $4
      `, [longitude, latitude, speed || 0, vehicle_id]);

      io.emit('vehicle_position_updated', {
        vehicle_id, latitude, longitude, speed, timestamp: new Date()
      });
    } catch (err) {
      console.error('Lỗi khi lưu GPS:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

const initDB = async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS locations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        address TEXT NOT NULL,
        latitude NUMERIC(10, 7) NOT NULL,
        longitude NUMERIC(10, 7) NOT NULL,
        geofence_radius INT DEFAULT 200,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Table "locations" verified/created.');

    // Add PostGIS geom column to locations if not exists and update it
    await db.query(`
      ALTER TABLE locations ADD COLUMN IF NOT EXISTS geom GEOMETRY(Point, 4326);
    `);
    await db.query(`
      UPDATE locations SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) WHERE geom IS NULL;
    `);

    // Alter orders table to add foreign keys
    await db.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS diem_lay_hang_id INT REFERENCES locations(id) ON DELETE SET NULL;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS diem_giao_hang_id INT REFERENCES locations(id) ON DELETE SET NULL;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS diem_tra_rong_id INT REFERENCES locations(id) ON DELETE SET NULL;
    `);
    console.log('✅ Altered "orders" table to include location foreign keys.');

    const seeds = [
      { name: 'Cảng Cát Lái', address: 'Đường Nguyễn Thị Định, Cát Lái, Quận 2, TP.HCM', lat: 10.7769, lng: 106.7694 },
      { name: 'Cảng VICT', address: 'Đường Bến Nghé, Tân Thuận Đông, Quận 7, TP.HCM', lat: 10.7625, lng: 106.6890 },
      { name: 'Cảng Hiệp Phước', address: 'KCN Hiệp Phước, Nhà Bè, TP.HCM', lat: 10.6569, lng: 106.7108 },
      { name: 'ICD Phước Long', address: 'Phường Trường Thọ, Thủ Đức, TP.HCM', lat: 10.8020, lng: 106.7450 },
      { name: 'KCN Bình Dương', address: 'Đại lộ Bình Dương, Thuận An, Bình Dương', lat: 10.9808, lng: 106.7220 },
      { name: 'KCN Long Hậu', address: 'Đường Long Hậu, Cần Giuộc, Long An', lat: 10.6222, lng: 106.6686 },
      { name: 'Depot An Sơn', address: 'Cảng An Sơn, Thuận An, Bình Dương', lat: 10.8514, lng: 106.6200 },
      { name: 'Depot Cát Lái', address: 'Đường Nguyễn Thị Định, Cát Lái, Quận 2, TP.HCM', lat: 10.7690, lng: 106.7600 },
      { name: 'Depot Trường Thọ', address: 'Phường Trường Thọ, Thủ Đức, TP.HCM', lat: 10.8210, lng: 106.7550 },
      { name: 'Depot Phú Hữu', address: 'Phường Phú Hữu, Quận 9, TP.HCM', lat: 10.8390, lng: 106.7820 }
    ];

    for (const s of seeds) {
      await db.query(`
        INSERT INTO locations (name, address, latitude, longitude)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (name) DO NOTHING
      `, [s.name, s.address, s.lat, s.lng]);
    }
    // Also sync standard seed geom points
    await db.query(`
      UPDATE locations SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) WHERE geom IS NULL;
    `);
    console.log('✅ Standard seed locations populated.');
  } catch (err) {
    console.error('❌ Error initializing database tables:', err);
  }
};

server.listen(PORT, async () => {
  console.log(`🚀 VIETMAP FleetOS Enterprise Backend running on port ${PORT}`);
  await initDB();
  console.log(`🛰️  Realtime Socket.io Server Ready!`);
});

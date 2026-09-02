-- ========================================================
-- VIETMAP FleetOS - Enterprise PostgreSQL Schema (PostGIS & Seed Data)
-- Tương thích Supabase / AWS RDS / Self-hosted Postgres
-- ========================================================

-- 1. KÍCH HOẠT PHÂN VÙNG VÀ TỎA ĐỘ ĐỊA LÝ POSTGIS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 2. BẢNG NGUỜI DÙNG (USERS)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'nhanvien')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. BẢNG PHƯƠNG TIỆN (VEHICLES)
CREATE TABLE IF NOT EXISTS vehicles (
    id SERIAL PRIMARY KEY,
    bien_so VARCHAR(20) UNIQUE NOT NULL,
    hang_xe VARCHAR(50) NOT NULL,
    so_mooc VARCHAR(30),
    khoi_luong NUMERIC(10, 2) DEFAULT 0,
    ghi_chu TEXT,
    current_location GEOMETRY(Point, 4326), -- Tọa độ GPS hiện tại (PostGIS)
    current_speed NUMERIC(5, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. BẢNG CÁC BÊN LIÊN QUAN (STAKEHOLDERS)
CREATE TABLE IF NOT EXISTS stakeholders (
    id SERIAL PRIMARY KEY,
    type VARCHAR(30) NOT NULL CHECK (type IN ('drivers', 'sales', 'senders', 'receivers', 'dieuvans')),
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(100),
    address TEXT,
    company VARCHAR(150),
    license_no VARCHAR(30),
    license_type VARCHAR(10),
    status VARCHAR(20) DEFAULT 'active',
    default_vehicle_id INT REFERENCES vehicles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. BẢNG QUẢN LÝ LỐP XE (TIRES)
CREATE TABLE IF NOT EXISTS tires (
    id SERIAL PRIMARY KEY,
    ma_lop VARCHAR(50) UNIQUE NOT NULL,
    vehicle_id INT REFERENCES vehicles(id) ON DELETE SET NULL,
    vi_tri VARCHAR(50) NOT NULL DEFAULT 'Bánh trước trái',
    hang_lop VARCHAR(50) NOT NULL DEFAULT 'Bridgestone',

    ngay_lap DATE,
    ngay_thao DATE,
    ghi_chu TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5.5. BẢNG DANH MỤC TRẠM / ĐỊA ĐIỂM (LOCATIONS)
CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    address TEXT NOT NULL,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    geom GEOMETRY(Point, 4326),
    geofence_radius INT DEFAULT 200,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. BẢNG ĐƠN HÀNG (ORDERS)
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    so_bien_nhan VARCHAR(50) UNIQUE NOT NULL,
    ngay_tao DATE DEFAULT CURRENT_DATE,
    sale_id INT REFERENCES stakeholders(id) ON DELETE SET NULL,
    dieu_van_id INT REFERENCES stakeholders(id) ON DELETE SET NULL,
    trang_thai VARCHAR(30) DEFAULT 'chua_bat_dau' CHECK (trang_thai IN ('chua_bat_dau', 'dang_thuc_hien', 'hoan_thanh', 'tre_chuyen')),
    ghi_chu TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6.1. BẢNG CHI TIẾT ĐƠN HÀNG (ORDER_DETAILS)
CREATE TABLE IF NOT EXISTS order_details (
    id SERIAL PRIMARY KEY,
    order_id INT UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    tai_xe_id INT REFERENCES stakeholders(id) ON DELETE SET NULL,
    vehicle_id INT REFERENCES vehicles(id) ON DELETE SET NULL,
    bien_gui_id INT REFERENCES stakeholders(id) ON DELETE SET NULL,
    bien_nhan_id INT REFERENCES stakeholders(id) ON DELETE SET NULL,
    loai_cont VARCHAR(10) NOT NULL,
    so_cont VARCHAR(30),
    seal_no VARCHAR(30),
    chi_phi NUMERIC(15, 2) DEFAULT 0,
    
    loai_don_hang VARCHAR(50),
    loai_hinh VARCHAR(50),
    hang_hoa VARCHAR(150),
    nhiet_do VARCHAR(50),
    email_tai_xe VARCHAR(150),
    
    -- Khóa ngoại liên kết địa điểm (Master Data)
    diem_lay_hang_id INT REFERENCES locations(id) ON DELETE SET NULL,
    diem_giao_hang_id INT REFERENCES locations(id) ON DELETE SET NULL,
    diem_tra_rong_id INT REFERENCES locations(id) ON DELETE SET NULL,
    
    -- Snapshot sao lưu lịch sử tại thời điểm lập đơn
    diem_lay_hang VARCHAR(255) NOT NULL,
    diem_lay_hang_geom GEOMETRY(Point, 4326),
    ngay_lay_hang DATE,
    diem_giao_hang VARCHAR(255) NOT NULL,
    diem_giao_hang_geom GEOMETRY(Point, 4326),
    ngay_giao_hang DATE,
    diem_nhan_rong VARCHAR(255),
    ngay_nhan_rong DATE,
    diem_tra_rong VARCHAR(255),
    ngay_tra_rong DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6.2. BẢNG LỊCH SỬ ĐƠN HÀNG (ORDER_HISTORY)
CREATE TABLE IF NOT EXISTS order_history (
    id SERIAL PRIMARY KEY,
    order_id INT,
    so_bien_nhan VARCHAR(50),
    action VARCHAR(20) NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE'
    changed_by INT REFERENCES users(id) ON DELETE SET NULL,
    changed_by_name VARCHAR(100),
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    details TEXT
);

-- 7. BẢNG BẢO DƯỠNG (MAINTENANCE)
CREATE TABLE IF NOT EXISTS maintenance (
    id SERIAL PRIMARY KEY,
    vehicle_id INT REFERENCES vehicles(id) ON DELETE CASCADE,
    loai_bao_duong VARCHAR(255) NOT NULL,
    ngay_bao_duong DATE NOT NULL,
    ngay_canh_bao DATE,
    chi_phi NUMERIC(15, 2) DEFAULT 0,
    trang_thai VARCHAR(30) DEFAULT 'cho_xuly' CHECK (trang_thai IN ('da_bao_duong', 'sap_den_han', 'qua_han')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. BẢNG SỬA CHỮA (REPAIRS)
CREATE TABLE IF NOT EXISTS repairs (
    id SERIAL PRIMARY KEY,
    vehicle_id INT REFERENCES vehicles(id) ON DELETE CASCADE,
    loai_sua_chua VARCHAR(255) NOT NULL,
    ngay_sua_chua DATE NOT NULL,
    chi_phi NUMERIC(15, 2) DEFAULT 0,
    trang_thai VARCHAR(30) DEFAULT 'dang_sua' CHECK (trang_thai IN ('cho_sua', 'dang_sua', 'hoan_thanh')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. BẢNG REALTIME TELEMETRY LOGS (HÀNH TRÌNH GPS TỐC ĐỘ XE)
CREATE TABLE IF NOT EXISTS vehicle_telemetry (
    id BIGSERIAL PRIMARY KEY,
    vehicle_id INT REFERENCES vehicles(id) ON DELETE CASCADE,
    location GEOMETRY(Point, 4326) NOT NULL,
    speed NUMERIC(5, 2) DEFAULT 0,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ========================================================
-- SEED DATA THỰC TẾ (CHUẨN VẬN TẢI CONTAINER VIETMAP)
-- Mật khẩu mặc định các user: admin123
-- ========================================================

-- 1. SEED USERS
INSERT INTO users (username, password_hash, name, role) VALUES 
('admin', '$2b$10$c1oP.q22Qo1905E5xWnOseX7H16Kvg63QpU3J7a5Q1zO2K3L4M5N6', 'Nguyễn Văn Admin', 'admin'),
('nhanvien', '$2b$10$c1oP.q22Qo1905E5xWnOseX7H16Kvg63QpU3J7a5Q1zO2K3L4M5N6', 'Trần Thị Nhân Viên', 'nhanvien')
ON CONFLICT (username) DO NOTHING;

-- 2. SEED STAKEHOLDERS (TÀI XẾ, SALES, ĐIỀU VẬN, BÊN GIAO, BÊN NHẬN)
INSERT INTO stakeholders (id, type, name, phone, email, address, license_no, license_type) VALUES 
-- Tài xế
(1, 'drivers', 'Lê Văn Tài', '0901234567', 'tai.le@vietmap.vn', 'Q9, TP.HCM', 'GX-123456', 'FC'),
(2, 'drivers', 'Phạm Văn Xe', '0912345678', 'xe.pham@vietmap.vn', 'Thuận An, Bình Dương', 'GX-234567', 'FC'),
(3, 'drivers', 'Nguyễn Văn Lái', '0923456789', 'lai.nguyen@vietmap.vn', 'Q2, TP.HCM', 'GX-345678', 'E'),

-- Điều vận
(4, 'dieuvans', 'Điều Vận A', '0901111111', 'dva@vietmap.vn', 'Văn phòng điều vận HCM', NULL, NULL),
(5, 'dieuvans', 'Điều Vận B', '0902222222', 'dvb@vietmap.vn', 'Văn phòng điều vận Bình Dương', NULL, NULL),

-- Bên giao
(6, 'senders', 'Công ty TNHH ABC', '02812345678', 'contact@abc.com', '123 Nguyễn Trãi, Q1, HCM', NULL, NULL),
(7, 'senders', 'Công ty CP XYZ', '02887654321', 'info@xyz.com', '456 Lê Văn Sỹ, Q3, HCM', NULL, NULL),

-- Bên nhận
(8, 'receivers', 'Kho Cát Lái', '02811111111', 'kho@catlai.vn', 'Cảng Cát Lái, Q2, HCM', NULL, NULL),
(9, 'receivers', 'KCN Bình Dương', '02722222222', 'kcn@binhduong.vn', 'KCN Sóng Thần, Bình Dương', NULL, NULL),

-- Sales
(10, 'sales', 'Nguyễn Sale 1', '0901100000', 'sale1@vietmap.vn', 'P.Kinh Doanh HCM', NULL, NULL),
(11, 'sales', 'Trần Sale 2', '0912200000', 'sale2@vietmap.vn', 'P.Kinh Doanh Bình Dương', NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Reset sequence cho bảng stakeholders
SELECT setval('stakeholders_id_seq', (SELECT MAX(id) FROM stakeholders));

-- 3. SEED VEHICLES (ĐẦU KÈO CONTAINER & POSTGIS COORDINATES)
INSERT INTO vehicles (id, bien_so, hang_xe, so_mooc, khoi_luong, ghi_chu, current_location, current_speed) VALUES 
(1, '51C-12345', 'Hyundai', 'MM-001', 18000, 'Xe đầu kéo', ST_SetSRID(ST_MakePoint(106.7694, 10.7769), 4326), 45.0),
(2, '51C-67890', 'Isuzu', 'MM-002', 15000, 'Xe thùng', ST_SetSRID(ST_MakePoint(106.6890, 10.7625), 4326), 50.0),
(3, '51D-11111', 'Hino', 'MM-003', 20000, 'Xe đầu kéo Mỹ', ST_SetSRID(ST_MakePoint(106.7450, 10.8020), 4326), 0.0)
ON CONFLICT (id) DO NOTHING;

-- Reset sequence cho bảng vehicles
SELECT setval('vehicles_id_seq', (SELECT MAX(id) FROM vehicles));

-- 4. SEED ORDERS (ĐƠN HÀNG VẬN TẢI CONTAINER)
INSERT INTO orders (
    id, so_bien_nhan, ngay_tao, sale_id, dieu_van_id, trang_thai, ghi_chu
) VALUES 
(1, 'BN-2024-001', '2024-01-15', 10, 4, 'hoan_thanh', 'Giao hàng đúng hẹn'),
(2, 'BN-2024-002', '2024-01-16', 11, 5, 'dang_thuc_hien', 'Hàng đông lạnh nhiệt độ -18C'),
(3, 'BN-2024-003', '2024-01-18', 10, 4, 'tre_chuyen', 'Trễ chuyến do kẹt cảng')
ON CONFLICT (id) DO NOTHING;

SELECT setval('orders_id_seq', (SELECT MAX(id) FROM orders));

INSERT INTO order_details (
    order_id, tai_xe_id, vehicle_id, bien_gui_id, bien_nhan_id, loai_cont, so_cont, seal_no, chi_phi, 
    diem_lay_hang, ngay_lay_hang, diem_giao_hang, ngay_giao_hang, 
    diem_nhan_rong, ngay_nhan_rong, diem_tra_rong, ngay_tra_rong
) VALUES 
(1, 1, 1, 6, 8, '20DC', 'MSCU1234567', 'SL001', 5500000, 'Cảng Cát Lái', '2024-01-15', 'KCN Bình Dương', '2024-01-16', 'Depot An Sơn', '2024-01-14', 'Depot Cát Lái', '2024-01-17'),
(2, 2, 2, 7, 9, '40HC', 'TGHU9876543', 'SL002', 7200000, 'ICD Phước Long', '2024-01-16', 'Cảng VICT', '2024-01-17', 'Depot Trường Thọ', '2024-01-15', 'Depot Phú Hữu', '2024-01-18'),
(3, 3, 3, 6, 9, '40DC', 'APZU5555555', 'SL003', 6800000, 'Cảng Hiệp Phước', '2024-01-17', 'KCN Long Hậu', '2024-01-18', 'Depot Cát Lái', '2024-01-16', 'Depot An Sơn', '2024-01-19')
ON CONFLICT (order_id) DO NOTHING;

-- 5. SEED TIRES (QUẢN LÝ LỐP)
INSERT INTO tires (ma_lop, vehicle_id, ngay_lap, ngay_thao, vi_tri, hang_lop) VALUES 
('LOP-20240001', 1, '2024-01-01', NULL, 'Bánh trước trái', 'Bridgestone'),
('LOP-20240002', 2, '2024-01-05', '2024-06-05', 'Bánh sau phải', 'Michelin'),
('LOP-20240003', 1, '2024-03-01', NULL, 'Bánh sau trái', 'Dunlop')
ON CONFLICT (ma_lop) DO NOTHING;

-- 6. SEED MAINTENANCE (BẢO DƯỠNG XE)
INSERT INTO maintenance (vehicle_id, loai_bao_duong, ngay_bao_duong, ngay_canh_bao, chi_phi, trang_thai) VALUES 
(1, 'Thay dầu định kỳ', '2024-01-10', '2024-07-10', 2500000, 'da_bao_duong'),
(2, 'Kiểm tra hệ thống phanh', '2024-08-20', '2024-09-20', 1800000, 'sap_den_han'),
(3, 'Thay lốc máy xe', '2023-11-01', '2024-05-01', 12000000, 'qua_han');

-- 7. SEED REPAIRS (SỬA CHỮA XE)
INSERT INTO repairs (vehicle_id, loai_sua_chua, ngay_sua_chua, chi_phi, trang_thai) VALUES 
(1, 'Sửa hệ thống động cơ', '2024-01-20', 15000000, 'hoan_thanh'),
(2, 'Thay bộ hộp số tự động', '2024-02-05', 8500000, 'dang_sua'),
(3, 'Sửa chập hệ thống điện', '2024-01-28', 3200000, 'hoan_thanh');

-- INDEX TỐI ƯU HÓA TRUY VẤN SPATIAL KHOẢNG CÁCH POSTGIS
CREATE INDEX IF NOT EXISTS idx_vehicles_location ON vehicles USING GIST(current_location);
CREATE INDEX IF NOT EXISTS idx_telemetry_location ON vehicle_telemetry USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_orders_so_bien_nhan ON orders(so_bien_nhan);

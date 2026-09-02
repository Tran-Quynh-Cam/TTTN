# 🚀 VIETMAP FleetOS - Enterprise Realtime Backend Engine

Hệ thống Backend chuyên dụng cho **Quản lý Vận tải & Định vị GPS FleetOS**, được thiết kế theo tiêu chuẩn Enterprise:
- **Framework**: Node.js (Express.js)
- **Database Engine**: PostgreSQL + **PostGIS Extension** (Quản lý dữ liệu không gian / Tọa độ GPS)
- **Realtime Telemetry**: **Socket.io** (Truyền tải vị trí GPS xe thời gian thực)
- **Authentication**: JWT (JSON Web Token) + `bcryptjs` password hashing

---

## 🏗️ 1. Kiến trúc hệ thống & Công nghệ

```
   [ 🚛 App Tài xế / Thiết bị GPS ]
                 │ (Socket.io - update_gps_location)
                 ▼
   [ 🚀 VietMap Node.js Backend Server ] ──── (JWT Auth) ───► [ 📱 React Frontend ]
                 │                                                ▲
                 │ (pg connection string)                          │ (Socket.io)
                 ▼                                                │
   [ 🐘 Cloud PostgreSQL + PostGIS Extension (Supabase / AWS RDS) ] ──┘
```

---

## 🛠️ 2. Hướng dẫn cấu hình CSDL Supabase (PostgreSQL + PostGIS)

1. Đăng nhập [Supabase Dashboard](https://supabase.com) và tạo một Project mới.
2. Vào tab **SQL Editor** trên giao diện Supabase.
3. Mở file `schema.sql` trong dự án này, sao chép toàn bộ nội dung dán vào SQL Editor và nhấn **RUN**.
   *(File SQL sẽ tự động kích hoạt Extension `postgis`, tạo bảng chuẩn hóa và dữ liệu mẫu)*.
4. Mở **Project Settings** ➔ **Database** ➔ chọn tab **URI** trong phần Connection String để lấy chuỗi kết nối.

---

## ⚙️ 3. Cấu hình file Môi trường (.env)

Tạo file `.env` tại thư mục `vietmap-backend`:

```env
PORT=5000
DATABASE_URL=postgresql://postgres.xxx:your_password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
JWT_SECRET=vietmap_fleetos_super_secret_key_2026
```

---

## ⚡ 4. Khởi chạy Server

```bash
# Môi trường Development (tự động reload code):
npm run dev

# Môi trường Production:
npm start
```

---

## 🛰️ 5. Hướng dẫn tích hợp Realtime GPS (Socket.io) cho Client/Frontend

### Gửi vị trí GPS từ Thiết bị / Tài xế:
```javascript
import { io } from "socket.io-client";
const socket = io("http://localhost:5000");

// Gửi tọa độ định kỳ
socket.emit("update_gps_location", {
  vehicle_id: 1,
  latitude: 10.7769,
  longitude: 106.7694,
  speed: 45.5 // km/h
});
```

### Nhận vị trí GPS tức thì trên Bản đồ Admin:
```javascript
socket.on("vehicle_position_updated", (data) => {
  console.log("Xe vừa cập nhật vị trí:", data);
  // data: { vehicle_id, latitude, longitude, speed, timestamp }
  // Update marker xe trên bản đồ Leaflet
});
```

---

## 📌 Danh sách RESTful APIs chính

| Method | Endpoint | Mô tả |
|---|---|---|
| **POST** | `/api/auth/login` | Đăng nhập hệ thống (Mật khẩu mặc định: `admin123`) |
| **GET** | `/api/orders` | Danh sách đơn hàng |
| **POST** | `/api/orders` | Tạo đơn hàng mới |
| **GET** | `/api/vehicles` | Danh sách xe (PostGIS trả về Latitude / Longitude) |
| **GET** | `/api/stakeholders` | Danh sách đối tác, tài xế, sale |

const { io } = require('socket.io-client');
const db = require('./db');
const readline = require('readline');

// Tọa độ các điểm mẫu cố định khớp với Frontend
const GEO = {
  'Cảng Cát Lái':     [10.7769, 106.7694],
  'Cảng VICT':        [10.7625, 106.6890],
  'Cảng Hiệp Phước':  [10.6569, 106.7108],
  'ICD Phước Long':   [10.8020, 106.7450],
  'KCN Bình Dương':   [10.9808, 106.7220],
  'KCN Long Hậu':     [10.6222, 106.6686],
  'Depot An Sơn':     [10.8514, 106.6200],
  'Depot Cát Lái':    [10.7690, 106.7600],
  'Depot Trường Thọ': [10.8210, 106.7550],
  'Depot Phú Hữu':    [10.8390, 106.7820],
};

const getCoord = (name) => {
  if (GEO[name]) return GEO[name];
  const h = [...(name || 'X')].reduce((a, c) => a + c.charCodeAt(0), 0);
  return [10.72 + (h % 20) * 0.009, 106.63 + (h % 15) * 0.011];
};

// Hàm phụ để tạo dấu nhắc nhập liệu từ bàn phím
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

// Lấy tuyến đường thực tế từ OSRM API
async function fetchOSRMRoute(coords) {
  if (coords.length < 2) return [];
  const waypoints = coords.map(c => `${c[1]},${c[0]}`).join(';');
  const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=full&geometries=geojson`;
  
  try {
    const res = await fetch(osrmUrl);
    const data = await res.json();
    if (data.code === 'Ok' && data.routes?.[0]) {
      const geojson = data.routes[0].geometry;
      return geojson.coordinates.map(c => [c[1], c[0]]); // Trả về [lat, lon]
    }
  } catch (err) {
    console.error('⚠️ Lỗi gọi OSRM API, chuyển sang dùng tọa độ chim bay:', err.message);
  }
  return coords; // Fallback
}

// Chạy hàm chính
async function main() {
  console.clear();
  console.log('================================================================');
  console.log('🛰️   VIETMAP FLEETOS - HỆ THỐNG GIẢ LẬP ĐỊNH VỊ GPS REAL-TIME   ');
  console.log('================================================================\n');

  let orders = [];
  let selectedOrder = null;

  // Bước 1: Kết nối DB và lấy danh sách đơn hàng gần đây
  try {
    console.log('🐘 Đang tải danh sách đơn hàng từ cơ sở dữ liệu Postgres...');
    const result = await db.query(`
      SELECT o.id, o.so_bien_nhan, o.diem_lay_hang, o.diem_giao_hang, o.diem_tra_rong, o.diem_nhan_rong, o.vehicle_id, v.bien_so
      FROM orders o
      LEFT JOIN vehicles v ON o.vehicle_id = v.id
      ORDER BY o.id DESC
      LIMIT 10
    `);
    orders = result.rows;
  } catch (err) {
    console.log('⚠️ Không thể kết nối cơ sở dữ liệu. Sử dụng kịch bản giả lập Offline.');
  }

  // Bước 2: Cho người dùng chọn đơn hàng
  if (orders.length > 0) {
    console.log('\n--- DANH SÁCH ĐƠN HÀNG HOẠT ĐỘNG ---');
    orders.forEach((o, index) => {
      console.log(`[${index + 1}] Biên nhận: ${o.so_bien_nhan} | Xe: ${o.bien_so || 'Chưa gán'} | Lộ trình: ${o.diem_lay_hang} -> ${o.diem_giao_hang}`);
    });
    console.log('[0] Nhập thông tin thủ công (Offline Demo)');

    const choice = await askQuestion('\n👉 Nhập số thứ tự đơn hàng muốn giả lập (Mặc định: 1): ');
    const idx = parseInt(choice || '1', 10);
    
    if (idx === 0) {
      selectedOrder = null;
    } else if (idx > 0 && idx <= orders.length) {
      selectedOrder = orders[idx - 1];
    } else {
      console.log('❌ Lựa chọn không hợp lệ, mặc định chọn đơn hàng đầu tiên.');
      selectedOrder = orders[0];
    }
  }

  // Bước 3: Chuẩn bị tọa độ các điểm dừng
  let stops = [];
  let orderNo = 'DEMO-OFFLINE';
  let vehicleId = 1;
  let vehiclePlate = '51C-123.45';

  if (selectedOrder) {
    orderNo = selectedOrder.so_bien_nhan;
    vehicleId = selectedOrder.vehicle_id || 1;
    vehiclePlate = selectedOrder.bien_so || 'Xe Container';
    
    if (selectedOrder.diem_lay_hang) stops.push(selectedOrder.diem_lay_hang);
    if (selectedOrder.diem_giao_hang) stops.push(selectedOrder.diem_giao_hang);
    
    const r = selectedOrder.diem_tra_rong || selectedOrder.diem_nhan_rong;
    if (r) stops.push(r);
  } else {
    // Kịch bản mặc định nếu không có DB hoặc chọn Offline
    stops = ['Cảng Cát Lái', 'KCN Bình Dương', 'Depot Cát Lái'];
  }

  console.log(`\n📍 Lộ trình các điểm dừng: ${stops.join(' ➡️ ')}`);
  console.log('⏳ Đang lấy dữ liệu bản đồ từ dự án đường bộ OSRM...');
  
  const rawCoords = stops.map(s => getCoord(s));
  const routePoints = await fetchOSRMRoute(rawCoords);

  if (routePoints.length === 0) {
    console.log('❌ Không thể dựng tuyến đường di chuyển. Thoát.');
    return;
  }

  console.log(`✅ Đã dựng thành công tuyến đường bộ gồm ${routePoints.length} điểm tọa độ.`);

  // Bước 4: Khởi tạo kết nối Socket.io phát GPS
  console.log('\n🔌 Đang kết nối tới server Socket.io (http://localhost:5000)...');
  const socket = io('http://localhost:5000');

  socket.on('connect', () => {
    console.log('📡 Đã kết nối thành công! Bắt đầu phát tín hiệu vị trí...');
    console.log(`🚛 Xe: ${vehiclePlate} (ID: ${vehicleId}) đang di chuyển trên đơn hàng ${orderNo}...\n`);
    
    let index = 0;
    
    const timer = setInterval(() => {
      if (index >= routePoints.length) {
        console.log('\n🏁 Xe đã hoàn thành toàn bộ lộ trình!');
        if (selectedOrder) {
          console.log(`💾 Đang cập nhật trạng thái đơn hàng ${orderNo} thành 'hoan_thanh' trong database...`);
          db.query('UPDATE orders SET trang_thai = $1 WHERE id = $2', ['hoan_thanh', selectedOrder.id])
            .then(() => {
              console.log('✅ Đã cập nhật trạng thái đơn hàng thành Hoàn thành!');
              clearInterval(timer);
              socket.disconnect();
              process.exit(0);
            })
            .catch(err => {
              console.error('❌ Lỗi cập nhật trạng thái đơn hàng:', err.message);
              clearInterval(timer);
              socket.disconnect();
              process.exit(0);
            });
        } else {
          clearInterval(timer);
          socket.disconnect();
          process.exit(0);
        }
        return;
      }

      const currentLatLng = routePoints[index];
      
      // Tính toán tốc độ thực tế
      let speed = 40 + Math.floor(Math.random() * 20); // Tốc độ chạy 40-60 km/h
      if (index === 0 || index === routePoints.length - 1) {
        speed = 0; // Điểm bắt đầu và đích chạy chậm/dừng
      } else if (index < 5 || index > routePoints.length - 6) {
        speed = 20; // Chạy chậm ở gần điểm dừng
      }

      // Phát dữ liệu GPS lên Socket
      socket.emit('update_gps_location', {
        vehicle_id: vehicleId,
        latitude: currentLatLng[0],
        longitude: currentLatLng[1],
        speed: speed
      });

      // Hiển thị thanh tiến trình trực quan trên Terminal
      const pct = Math.round((index / (routePoints.length - 1)) * 100);
      const barLength = 30;
      const progress = Math.round((pct / 100) * barLength);
      const bar = '█'.repeat(progress) + '░'.repeat(barLength - progress);

      process.stdout.write(`\r[${bar}] ${pct}% | Tọa độ: ${currentLatLng[0].toFixed(5)}, ${currentLatLng[1].toFixed(5)} | Tốc độ: ${speed} km/h`);
      
      index++;
    }, 2500); // 2.5 giây bắn GPS 1 lần cho thực tế
  });

  socket.on('connect_error', (err) => {
    console.error('❌ Lỗi kết nối Socket.io:', err.message);
    console.log('Vui lòng đảm bảo backend đang chạy ở cổng 5000 (npm run dev trong vietmap-backend)');
    process.exit(1);
  });
}

main().catch(err => {
  console.error('Fatal error in simulation:', err);
});

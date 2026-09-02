import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Card, Row, Col, Tag, Descriptions, Button, Space, Tabs,
  Typography, Breadcrumb, Divider, Table, Badge, message, Modal, Form, Select, Upload, AutoComplete
} from 'antd';
import {
  ArrowLeftOutlined, EditOutlined, ReloadOutlined,
  EnvironmentOutlined, CheckCircleFilled, ClockCircleFilled, MinusCircleFilled,
  RadarChartOutlined, FileTextOutlined, PlusOutlined, UploadOutlined, EyeOutlined, DownloadOutlined
} from '@ant-design/icons';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import DB from '../store/db';
import dayjs from 'dayjs';
import API, { socket } from '../services/api';

const { Title, Text } = Typography;

/* ── Leaflet icon fix ── */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const mkIcon = (color, label) => L.divIcon({
  className: '',
  html: `<div style="background:${color};color:#fff;font-weight:700;font-size:12px;
    width:28px;height:28px;border-radius:50%;border:3px solid #fff;
    box-shadow:0 2px 8px rgba(0,0,0,0.35);
    display:flex;align-items:center;justify-content:center;font-family:Inter,sans-serif">${label}</div>`,
  iconSize:[28,28], iconAnchor:[14,14], popupAnchor:[0,-16],
});

/* ── Tọa độ mẫu ── */
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
  const h = [...(name||'X')].reduce((a,c)=>a+c.charCodeAt(0),0);
  return [10.72+(h%20)*0.009, 106.63+(h%15)*0.011];
};

const STATUS_COLOR = { chua_bat_dau:'#bfbfbf', hoan_thanh:'#52c41a', dang_thuc_hien:'#1677ff', tre_chuyen:'#ff4d4f' };
const STATUS_LABEL = { chua_bat_dau:'Chưa bắt đầu', hoan_thanh:'Hoàn thành', dang_thuc_hien:'Đang thực hiện', tre_chuyen:'Trễ chuyến' };
const TASK_COLOR  = { 'Lấy vỏ/hàng':'#ff4d4f', 'Giao vỏ/hàng':'#1677ff', 'Hạ hàng/vỏ':'#52c41a' };

/* ── Map component với routing thực tế (OSRM) - Đã tối ưu hóa chống lag ── */
function OrderMap({ stops, tileType, onRouteLoaded, vehiclePlate, vehicleId }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const tileLayerRef = useRef(null);
  const markersRef = useRef([]);
  const routeLayersRef = useRef([]);
  const gpsMarkerRef = useRef(null);
  const loadingPopupRef = useRef(null);

  // Thêm các refs quản lý toạ độ và đường đi
  const routeCoordsRef = useRef([]);
  const remainingRouteLayerRef = useRef(null);

  // Đưa vehicleId và vehiclePlate vào Ref để tránh lỗi stale closures trong socket listener và giữ render ổn định
  const vehicleIdRef = useRef(vehicleId);
  const vehiclePlateRef = useRef(vehiclePlate);

  useEffect(() => {
    vehicleIdRef.current = vehicleId;
  }, [vehicleId]);

  useEffect(() => {
    vehiclePlateRef.current = vehiclePlate;
  }, [vehiclePlate]);

  // 1. Khởi tạo bản đồ 1 lần duy nhất khi mount
  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current, { zoomControl: false });
    mapRef.current = map;
    L.control.zoom({ position: 'topleft' }).addTo(map);

    // Tạo tile layer rỗng ban đầu
    const tileLayer = L.tileLayer('', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    tileLayerRef.current = tileLayer;

    // Hàm theo dõi lộ trình và kiểm tra lệch đường đi
    const updateRouteTracking = (currentLatLng) => {
      if (!routeCoordsRef.current || routeCoordsRef.current.length === 0 || !mapRef.current) return;

      let closestIdx = -1;
      let minDistance = Infinity;

      // Tìm điểm gần nhất trên lộ trình OSRM so với toạ độ GPS xe hiện tại
      for (let i = 0; i < routeCoordsRef.current.length; i++) {
        const p = routeCoordsRef.current[i];
        const dist = Math.pow(p[0] - currentLatLng[0], 2) + Math.pow(p[1] - currentLatLng[1], 2);
        if (dist < minDistance) {
          minDistance = dist;
          closestIdx = i;
        }
      }

      // Kiểm tra chệch đường đi (Nếu lệch xa hơn ~200 mét, khoảng cách bình phương > 4e-6)
      if (minDistance > 4e-6) {
        // Lấy các mốc dừng chưa hoàn thành để dẫn đường tiếp
        const remainingStops = stops.filter(s => s.trangThai !== 'Hoàn thành');
        if (remainingStops.length > 0) {
          const waypoints = [currentLatLng, ...remainingStops.map(s => getCoord(s.diaChi))];
          const waypointsStr = waypoints.map(c => `${c[1]},${c[0]}`).join(';');
          const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${waypointsStr}?overview=full&geometries=geojson`;

          fetch(osrmUrl)
            .then(r => r.json())
            .then(data => {
              if (data.code === 'Ok' && data.routes?.[0]) {
                const geojson = data.routes[0].geometry;
                const newLatLngs = geojson.coordinates.map(c => [c[1], c[0]]);
                
                // Cập nhật lại lộ trình chính
                routeCoordsRef.current = newLatLngs;

                // Cập nhật đường vẽ mới từ vị trí lệch mới
                if (remainingRouteLayerRef.current) {
                  remainingRouteLayerRef.current.setLatLngs(newLatLngs);
                }
              }
            })
            .catch(err => console.error('Lỗi khi tính toán lại lộ trình lệch hướng:', err));
        }
      }
    };

    // Lắng nghe dữ liệu GPS thời gian thực từ socket
    const handleVehiclePosition = (data) => {
      if (!mapRef.current) return;
      const { vehicle_id, latitude, longitude, speed } = data;
      
      // Chỉ xử lý nếu đúng ID xe của đơn hàng này
      if (Number(vehicle_id) !== Number(vehicleIdRef.current || 1)) return;

      const latlng = [latitude, longitude];
      const activePlate = vehiclePlateRef.current || 'Xe Container';

      // Giao diện xe chuyên nghiệp (không dùng translate để tránh lệch so với anchor của Leaflet)
      const carHtml = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: flex-end; width: 120px; height: 60px; pointer-events: none;">
          <!-- License plate and speed tag -->
          <div style="background: rgba(38, 38, 38, 0.95); color: #fff; padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; border: 1px solid #555; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.3); margin-bottom: 4px; font-family: Inter, sans-serif; line-height: 1.2;">
            ${activePlate} • <span style="color: #52c41a;">${speed || 0} km/h</span>
          </div>
          <!-- Clean circular vehicle marker -->
          <div style="width: 24px; height: 24px; background: #1677ff; border: 2px solid #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 10px rgba(22,119,255,0.4); animation: gps-pulse 2s infinite;">
            <span style="font-size: 12px; line-height: 1;">🚛</span>
          </div>
          <style>
            @keyframes gps-pulse {
              0% { box-shadow: 0 0 0 0 rgba(22, 119, 255, 0.7); }
              70% { box-shadow: 0 0 0 8px rgba(22, 119, 255, 0); }
              100% { box-shadow: 0 0 0 0 rgba(22, 119, 255, 0); }
            }
          </style>
        </div>
      `;

      if (!gpsMarkerRef.current) {
        const carIcon = L.divIcon({
          className: '',
          html: carHtml,
          iconSize: [120, 60],
          iconAnchor: [60, 48]
        });
        gpsMarkerRef.current = L.marker(latlng, { icon: carIcon })
          .addTo(mapRef.current)
          .bindPopup(`<b>🚛 Xe: ${activePlate}</b><br/>Tọa độ: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}<br/>Tốc độ: <b>${speed || 0} km/h</b>`);
      } else {
        // Animation mượt: nội suy vị trí xe từ điểm cũ đến điểm mới trong 3.5s
        const ANIM_DURATION = 3500; // ms – phải nhỏ hơn interval để không chồng chéo
        const ANIM_STEPS = 40;
        const prevLatLng = gpsMarkerRef.current.getLatLng();
        const deltaLat = latitude  - prevLatLng.lat;
        const deltaLng = longitude - prevLatLng.lng;
        let step = 0;

        if (gpsMarkerRef._animTimer) clearInterval(gpsMarkerRef._animTimer);
        gpsMarkerRef._animTimer = setInterval(() => {
          step++;
          const t = step / ANIM_STEPS;
          const easedT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // ease-in-out
          const interpLat = prevLatLng.lat + deltaLat * easedT;
          const interpLng = prevLatLng.lng + deltaLng * easedT;
          if (gpsMarkerRef.current) {
            gpsMarkerRef.current.setLatLng([interpLat, interpLng]);
            // Theo dõi xe: bản đồ tự động pan theo vị trí hiện tại của xe
            if (mapRef.current) {
              mapRef.current.panTo([interpLat, interpLng], { animate: false, duration: 0 });
            }
          }
          if (step >= ANIM_STEPS) {
            clearInterval(gpsMarkerRef._animTimer);
            gpsMarkerRef._animTimer = null;
          }
        }, ANIM_DURATION / ANIM_STEPS);

        gpsMarkerRef.current.setIcon(L.divIcon({
          className: '',
          html: carHtml,
          iconSize: [120, 60],
          iconAnchor: [60, 48]
        }));
        gpsMarkerRef.current.getPopup().setContent(`<b>🚛 Xe: ${activePlate}</b><br/>Tọa độ: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}<br/>Tốc độ: <b>${speed || 0} km/h</b>`);
      }

      // Theo dõi lộ trình và cập nhật tuyến đường khi cần
      updateRouteTracking(latlng);
    };

    socket.on('vehicle_position_updated', handleVehiclePosition);

    return () => {
      socket.off('vehicle_position_updated', handleVehiclePosition);
      if (gpsMarkerRef.current) {
        gpsMarkerRef.current.remove();
        gpsMarkerRef.current = null;
      }
      if (remainingRouteLayerRef.current) {
        remainingRouteLayerRef.current.remove();
        remainingRouteLayerRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // 2. Cập nhật loại bản đồ (Vệ tinh / Bản đồ thường) không tạo lại bản đồ
  useEffect(() => {
    if (!tileLayerRef.current) return;
    const tileUrl = tileType === 'satellite'
      ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    tileLayerRef.current.setUrl(tileUrl);
  }, [tileType]);

  // 3. Cập nhật các điểm dừng và tuyến đường khi `stops` thay đổi
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Xóa markers cũ
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // Xóa đường đi cũ
    routeLayersRef.current.forEach(l => l.remove());
    routeLayersRef.current = [];

    // Đóng popup loading cũ nếu có
    if (loadingPopupRef.current) {
      map.closePopup(loadingPopupRef.current);
      loadingPopupRef.current = null;
    }

    const coords = stops.map(s => getCoord(s.diaChi));
    const newMarkers = [];

    // Vẽ markers mới
    stops.forEach((s, i) => {
      const c = getCoord(s.diaChi);
      const color = TASK_COLOR[s.nhiemVu] || '#666';
      const m = L.marker(c, { icon: mkIcon(color, i + 1) })
        .addTo(map)
        .bindPopup(`
          <div style="font-family:Inter,sans-serif;min-width:170px;padding:4px">
            <b style="color:${color};font-size:13px">${i+1}. ${s.tenGoiNho}</b><br/>
            <span style="font-size:12px;background:${color}20;padding:1px 6px;border-radius:8px;color:${color}">${s.nhiemVu}</span><br/>
            <span style="font-size:11px;color:#888;margin-top:4px;display:block">${s.diaChi}</span>
            ${s.ngay ? `<span style="font-size:11px;color:#666">📅 ${s.ngay}</span>` : ''}
          </div>`, { maxWidth: 240 });
      newMarkers.push(m);
    });
    markersRef.current = newMarkers;

    // Tự động căn chỉnh màn hình theo các điểm dừng trước
    if (newMarkers.length > 0) {
      const group = L.featureGroup(newMarkers);
      map.fitBounds(group.getBounds().pad(0.35));
    }

    // Lấy tuyến đường bộ thực tế qua OSRM (nếu có từ 2 điểm trở lên)
    if (coords.length > 1) {
      const waypoints = coords.map(c => `${c[1]},${c[0]}`).join(';');
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=full&geometries=geojson`;

      // Hiện loading indicator
      const loadingPopup = L.popup({ closeButton: false, offset: [0, -10] })
        .setLatLng(coords[0])
        .setContent('<div style="font-size:12px;color:#666">⏳ Đang tải đường đi...</div>')
        .openOn(map);
      loadingPopupRef.current = loadingPopup;

      fetch(osrmUrl)
        .then(r => r.json())
        .then(data => {
          if (!mapRef.current) return;
          if (loadingPopupRef.current) {
            map.closePopup(loadingPopupRef.current);
            loadingPopupRef.current = null;
          }

          if (data.code === 'Ok' && data.routes?.[0]) {
            const geojson = data.routes[0].geometry;
            const latlngs = geojson.coordinates.map(c => [c[1], c[0]]);

            // Lưu lộ trình vào ref để tính toán khi có GPS
            routeCoordsRef.current = latlngs;

            // Xoá các đường đi động cũ
            if (remainingRouteLayerRef.current) {
              remainingRouteLayerRef.current.remove();
              remainingRouteLayerRef.current = null;
            }

            // Vẽ toàn bộ lộ trình ban đầu dưới dạng chưa đi qua (màu xanh thương hiệu)
            remainingRouteLayerRef.current = L.polyline(latlngs, {
              color: '#1677ff', weight: 5, opacity: 0.9,
            }).addTo(map);
            routeLayersRef.current.push(remainingRouteLayerRef.current);

            // Đưa các markers lên trên cùng
            markersRef.current.forEach(m => m.bringToFront());

            // Tự động căn chỉnh theo đường đi thực tế
            map.fitBounds(remainingRouteLayerRef.current.getBounds().pad(0.2));

            // Truyền ngược tọa độ OSRM lên cha để mô phỏng
            if (onRouteLoaded) onRouteLoaded(latlngs);
          } else {
            console.warn('Không thể tìm thấy tuyến đường bộ thực tế từ OSRM API.');
            if (onRouteLoaded) onRouteLoaded(coords);
          }
        })
        .catch((err) => {
          console.error('Lỗi khi gọi OSRM routing:', err);
          if (!mapRef.current) return;
          if (loadingPopupRef.current) {
            map.closePopup(loadingPopupRef.current);
            loadingPopupRef.current = null;
          }
          if (onRouteLoaded) onRouteLoaded(coords);
        });
    }
  }, [stops]);

  return <div ref={ref} style={{ height: '100%', width: '100%', minHeight: 320 }} />;
}

const DOCUMENT_TYPE_OPTIONS = [
  { value: 'Phiếu EIR' },
  { value: 'Booking Confirmation' },
  { value: 'Hợp đồng vận chuyển' },
  { value: 'Tờ khai hải quan' },
  { value: 'Phiếu đóng cont' },
  { value: 'Hóa đơn / Receipt' },
  { value: 'Phiếu cân (VGM)' },
  { value: 'Giấy ra vào cổng' },
  { value: 'Biên bản giao nhận' }
];

/* ── Main component ── */
export default function OrderDetail({
  order: propOrder,
  vehicles = [],
  drivers = [],
  sales = [],
  senders = [],
  receivers = [],
  dieuvans = [],
  documents = [],
  onUploadDoc,
  onBack,
  onEdit
}) {
  const [tileType, setTileType] = useState('map');
  const [isSimulating, setIsSimulating] = useState(false);
  const [liveGps, setLiveGps] = useState(null);
  const [simRoute, setSimRoute] = useState([]); // Lưu lộ trình OSRM động phục vụ simulate
  const [reachedStop1, setReachedStop1] = useState(false);
  const [reachedStop2, setReachedStop2] = useState(false);
  const [reachedStop3, setReachedStop3] = useState(false);
  const [stop1Time, setStop1Time] = useState(null);
  const [stop2Time, setStop2Time] = useState(null);
  const [stop3Time, setStop3Time] = useState(null);
  const [docModal, setDocModal] = useState(false);
  const [localDocs, setLocalDocs] = useState([]);
  const [docForm] = Form.useForm();
  const simIdxRef = useRef(0);

  // Chuẩn hóa dữ liệu đơn hàng hỗ trợ cả snake_case và camelCase từ backend/frontend
  const order = useMemo(() => {
    if (!propOrder) return null;
    return {
      ...propOrder,
      id: propOrder.id,
      soBienNhan: propOrder.so_bien_nhan || propOrder.soBienNhan || '—',
      ngayTao: propOrder.ngay_tao || propOrder.ngayTao,
      capNhatLuc: propOrder.cap_nhat_luc || propOrder.capNhatLuc,
      loaiDonHang: propOrder.loai_don_hang || propOrder.loaiDonHang || 'Vận tải Container',
      loaiHinh: propOrder.loai_hinh || propOrder.loaiHinh || 'Nhập cảng',
      ghiChu: propOrder.ghi_chu || propOrder.ghiChu || '—',
      loaiCont: propOrder.loai_cont || propOrder.loaiCont || '20DC',
      soCont: propOrder.so_cont || propOrder.soCont || '—',
      sealNo: propOrder.seal_no || propOrder.sealNo || '—',
      chiPhi: propOrder.chi_phi || propOrder.chiPhi || 0,
      trangThai: propOrder.trang_thai || propOrder.trangThai || 'dang_thuc_hien',
      
      diemLayHang: propOrder.diem_lay_hang || propOrder.diemLayHang || propOrder.noiLay || '',
      ngayLayHang: propOrder.ngay_lay_hang || propOrder.ngayLayHang,
      diemGiaoHang: propOrder.diem_giao_hang || propOrder.diemGiaoHang || propOrder.noiGiao || '',
      ngayGiaoHang: propOrder.ngay_giao_hang || propOrder.ngayGiaoHang,
      diemNhanRong: propOrder.diem_nhan_rong || propOrder.diemNhanRong || '',
      ngayNhanRong: propOrder.ngay_nhan_rong || propOrder.ngayNhanRong,
      diemTraRong: propOrder.diem_tra_rong || propOrder.diemTraRong || propOrder.noiHa || '',
      ngayTraRong: propOrder.ngay_tra_rong || propOrder.ngayTraRong,

      // Alias fields for route display UI
      noiLay: propOrder.noiLay || propOrder.diem_lay_hang || propOrder.diemLayHang || '',
      noiGiao: propOrder.noiGiao || propOrder.diem_giao_hang || propOrder.diemGiaoHang || '',
      noiHa: propOrder.noiHa || propOrder.diem_tra_rong || propOrder.diemTraRong || '',
      
      vehicleId: propOrder.vehicle_id || propOrder.vehicleId,
      taiXeId: propOrder.tai_xe_id || propOrder.taiXeId,
      bienGuiId: propOrder.bien_gui_id || propOrder.bienGuiId || propOrder.senderId,
      bienNhanId: propOrder.bien_nhan_id || propOrder.bienNhanId || propOrder.receiverId,
      saleId: propOrder.sale_id || propOrder.saleId,
      dieuVanId: propOrder.dieu_van_id || propOrder.dieuVanId,
      hangHoa: propOrder.hang_hoa || propOrder.hangHoa || 'Hàng bách hóa',
      nhietDo: propOrder.nhiet_do || propOrder.nhietDo || 'Thường (Khô)',
    };
  }, [propOrder]);

  const [orderStatus, setOrderStatus] = useState('dang_thuc_hien');

  useEffect(() => {
    if (order?.trangThai) {
      setOrderStatus(order.trangThai);
    }
  }, [order?.trangThai]);

  // ── Khởi tạo stops và các trạng thái hành trình trước khi useEffect chạy để tránh lỗi hoisting ──
  const isDone    = orderStatus === 'hoan_thanh';
  const isOngoing = orderStatus === 'dang_thuc_hien';
  const stops = useMemo(() => {
    if (!order) return [];

    let status1 = 'Chưa thực hiện';
    if (isDone || reachedStop1) {
      status1 = 'Hoàn thành';
    } else if (isOngoing || isSimulating) {
      status1 = 'Đang thực hiện';
    }

    let status2 = 'Chưa thực hiện';
    if (isDone || reachedStop2) {
      status2 = 'Hoàn thành';
    } else if (reachedStop1) {
      status2 = 'Đang thực hiện';
    }

    let status3 = 'Chưa thực hiện';
    if (isDone || reachedStop3) {
      status3 = 'Hoàn thành';
    } else if (reachedStop2) {
      status3 = 'Đang thực hiện';
    }

    return [
      {
        so: 1,
        nhiemVu: 'Lấy vỏ/hàng',
        tenGoiNho: order.diemLayHang || '—',
        diaChi: order.diemLayHang || '',
        trangThai: status1,
        ngay: stop1Time || order.ngayLayHang,
      },
      {
        so: 2,
        nhiemVu: 'Giao vỏ/hàng',
        tenGoiNho: order.diemGiaoHang || '—',
        diaChi: order.diemGiaoHang || '',
        trangThai: status2,
        ngay: stop2Time || order.ngayGiaoHang,
      },
      {
        so: 3,
        nhiemVu: 'Hạ hàng/vỏ',
        tenGoiNho: order.diemTraRong || order.diemNhanRong || 'Bãi hạ vỏ/Cảng',
        diaChi: order.diemTraRong || order.diemNhanRong || order.diemGiaoHang || '',
        trangThai: status3,
        ngay: stop3Time || order.ngayTraRong || order.ngayNhanRong || '',
      },
    ];
  }, [order, isDone, isOngoing, isSimulating, reachedStop1, reachedStop2, reachedStop3, stop1Time, stop2Time, stop3Time]);

  // Theo dõi vị trí GPS thời gian thực để cập nhật mốc hành trình động
  useEffect(() => {
    if (!liveGps || !order) return;

    const coord1 = getCoord(order.diemLayHang);
    const coord2 = getCoord(order.diemGiaoHang);
    const coord3 = getCoord(order.diemTraRong || order.diemNhanRong || order.diemGiaoHang);

    const distTo1 = Math.pow(liveGps.latitude - coord1[0], 2) + Math.pow(liveGps.longitude - coord1[1], 2);
    const distTo2 = Math.pow(liveGps.latitude - coord2[0], 2) + Math.pow(liveGps.longitude - coord2[1], 2);
    const distTo3 = Math.pow(liveGps.latitude - coord3[0], 2) + Math.pow(liveGps.longitude - coord3[1], 2);

    // Khoảng cách dưới ~300m (bình phương khoảng cách độ < 8e-6) và phải hoàn thành tuần tự
    if (distTo1 < 8e-6 && !reachedStop1) {
      setReachedStop1(true);
      const nowStr = dayjs().format('HH:mm DD/MM/YYYY');
      setStop1Time(nowStr);
      message.success(`Xe đã tới trạm 1: ${order.diemLayHang || 'Lấy vỏ/hàng'}`);
    }
    if (distTo2 < 8e-6 && !reachedStop2 && reachedStop1) {
      setReachedStop2(true);
      const nowStr = dayjs().format('HH:mm DD/MM/YYYY');
      setStop2Time(nowStr);
      message.success(`Xe đã tới trạm 2: ${order.diemGiaoHang || 'Giao hàng'}`);
    }
    if (distTo3 < 8e-6 && !reachedStop3 && reachedStop2) {
      setReachedStop3(true);
      const nowStr = dayjs().format('HH:mm DD/MM/YYYY');
      setStop3Time(nowStr);
      message.success(`Xe đã hoàn thành tại trạm cuối: ${order.diemTraRong || order.diemNhanRong || 'Hạ vỏ'}`);
      
      // Cập nhật trạng thái hiển thị tức thời trên UI
      setOrderStatus('hoan_thanh');

      // Cập nhật trạng thái đơn hàng thành hoàn thành trên backend
      API.updateOrder(order.id, { ...order, trangThai: 'hoan_thanh' })
        .then(() => {
          message.success('Đã cập nhật trạng thái đơn hàng thành Hoàn thành!');
        })
        .catch(err => {
          console.error('Lỗi khi tự động cập nhật trạng thái đơn hàng:', err);
        });
    }
  }, [liveGps, order, reachedStop1, reachedStop2, reachedStop3]);

  // Reset mốc hành trình khi bắt đầu giả lập mới hoặc tắt
  useEffect(() => {
    if (isSimulating) {
      setReachedStop1(false);
      setReachedStop2(false);
      setReachedStop3(false);
      setStop1Time(null);
      setStop2Time(null);
      setStop3Time(null);
      simIdxRef.current = 0; // Reset index phát GPS về 0
    }
  }, [isSimulating]);

  const toggleGpsSimulation = () => {
    if (isSimulating) {
      setIsSimulating(false);
      message.info('Đã dừng phát tín hiệu GPS Realtime');
    } else {
      setIsSimulating(true);
      message.success('Bắt đầu phát GPS Realtime qua Socket.io!');
      if (orderStatus === 'chua_bat_dau') {
        setOrderStatus('dang_thuc_hien');
        API.updateOrder(order.id, { ...order, trangThai: 'dang_thuc_hien' })
          .then(() => {
            message.success('Đã tự động chuyển trạng thái đơn hàng sang: Đang thực hiện.');
          })
          .catch(err => {
            console.error('Lỗi khi cập nhật trạng thái đơn hàng:', err);
          });
      }
    }
  };

  // Lấy các điểm dừng tĩnh cho lộ trình GPS không đổi khi chạy simulation
  const staticStops = useMemo(() => {
    if (!order) return [];
    return [
      order.diemLayHang,
      order.diemGiaoHang,
      order.diemTraRong || order.diemNhanRong || order.diemGiaoHang
    ].filter(Boolean);
  }, [order?.diemLayHang, order?.diemGiaoHang, order?.diemTraRong, order?.diemNhanRong]);

  useEffect(() => {
    let timer = null;
    if (isSimulating) {
      // Dùng toàn bộ điểm OSRM như CLI (không decimation) - mỗi điểm cách 2500ms giống hệt simulate_gps.js
      let gpsPoints = [];
      if (simRoute && simRoute.length > 0) {
        // Sử dụng toàn bộ điểm OSRM, chỉ bỏ sót nếu quá dày (2 điểm liền sao cách nhau < 5m)
        const MIN_DIST_SQ = 2e-9; // ~5m
        const filtered = [simRoute[0]];
        for (let i = 1; i < simRoute.length; i++) {
          const prev = filtered[filtered.length - 1];
          const cur  = simRoute[i];
          const dSq  = Math.pow(cur[0] - prev[0], 2) + Math.pow(cur[1] - prev[1], 2);
          if (dSq >= MIN_DIST_SQ) filtered.push(cur);
        }
        gpsPoints = filtered.map((c, idx) => {
          let speed = 40 + Math.floor(Math.random() * 20);
          if (idx === 0 || idx === filtered.length - 1) speed = 0;
          else if (idx < 5 || idx > filtered.length - 6) speed = 20;
          return { lat: c[0], lng: c[1], speed };
        });
      } else {
        // Fallback: nội suy 30 điểm mỗi chặng khi không có OSRM
        const coords = staticStops.map(s => getCoord(s));
        for (let sIdx = 0; sIdx < coords.length - 1; sIdx++) {
          const c1 = coords[sIdx];
          const c2 = coords[sIdx + 1];
          const steps = 30;
          for (let i = 0; i < steps; i++) {
            const t = i / steps;
            const lat = c1[0] + (c2[0] - c1[0]) * t;
            const lng = c1[1] + (c2[1] - c1[1]) * t;
            let speed = 40 + Math.floor(Math.random() * 20);
            if (i < 3 || i > steps - 4) speed = 20;
            gpsPoints.push({ lat, lng, speed });
          }
        }
        const lastCoord = coords[coords.length - 1];
        gpsPoints.push({ lat: lastCoord[0], lng: lastCoord[1], speed: 0 });
      }

      // 2500ms/điểm - giống hệt file simulate_gps.js CLI
      const GPS_INTERVAL = 2500;
      const estMinutes = Math.round((gpsPoints.length * GPS_INTERVAL) / 60000);
      message.success(`Phát GPS: ${gpsPoints.length} điểm • 2.5s/điểm • ~${estMinutes} phút...`);

      timer = setInterval(() => {
        if (simIdxRef.current >= gpsPoints.length) {
          clearInterval(timer);
          setIsSimulating(false);
          message.success('Xe đã hoàn thiện toàn bộ lộ trình vận chuyển!');
          return;
        }

        const pt = gpsPoints[simIdxRef.current];
        if (pt) {
          socket.emit('update_gps_location', {
            vehicle_id: order?.vehicleId || 1,
            latitude: pt.lat,
            longitude: pt.lng,
            speed: pt.speed
          });
        }
        simIdxRef.current++;
      }, GPS_INTERVAL);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isSimulating, simRoute, staticStops, order?.vehicleId]);

  useEffect(() => {
    const handleGpsUpdate = (data) => {
      setLiveGps(data);
    };
    socket.on('vehicle_position_updated', handleGpsUpdate);
    return () => {
      socket.off('vehicle_position_updated', handleGpsUpdate);
    };
  }, []);

  if (!order) return null;

  const rawDriver = (drivers || []).find(x => x.id === order.taiXeId);
  const rawVehicle = (vehicles || []).find(x => x.id === order.vehicleId);
  const rawSender = (senders || []).find(x => x.id === order.bienGuiId);
  const rawReceiver = (receivers || []).find(x => x.id === order.bienNhanId);
  const rawDieuvan = (dieuvans || []).find(x => x.id === order.dieuVanId);
  const rawSale = (sales || []).find(x => x.id === order.saleId);

  // Normalize properties to support camelCase and snake_case database columns
  const driver = rawDriver ? {
    name: rawDriver.name,
    phone: rawDriver.phone,
  } : null;

  const vehicle = rawVehicle ? {
    bienSo: rawVehicle.bienSo || rawVehicle.bien_so || '—',
    soMooc: rawVehicle.soMooc || rawVehicle.so_mooc || '—',
    hangXe: rawVehicle.hangXe || rawVehicle.hang_xe || '—',
    khoiLuong: rawVehicle.khoiLuong || rawVehicle.khoi_luong || 0,
  } : null;

  const sender = rawSender ? {
    name: rawSender.name,
    address: rawSender.address,
  } : null;

  const receiver = rawReceiver ? {
    name: rawReceiver.name,
    address: rawReceiver.address,
  } : null;

  const dieuvan = rawDieuvan ? {
    name: rawDieuvan.name,
    phone: rawDieuvan.phone,
  } : null;

  const sale = rawSale ? {
    name: rawSale.name,
    phone: rawSale.phone,
  } : null;

  // stops đã được khai báo ở đầu component để tránh lỗi hoisting


  const statusTag = (s) => {
    if (s === 'Hoàn thành') return <Tag color="success" icon={<CheckCircleFilled/>}>{s}</Tag>;
    if (s === 'Đang thực hiện') return <Tag color="processing" icon={<ClockCircleFilled/>}>{s}</Tag>;
    return <Tag color="default" icon={<MinusCircleFilled/>}>{s}</Tag>;
  };

  const scheduleColumns = [
    { title:'No.', dataIndex:'so', width:50 },
    { title:'Nhiệm vụ', dataIndex:'nhiemVu', render:v=><Tag color={v==='Lấy vỏ/hàng'?'red':v==='Hạ hàng/vỏ'?'green':'blue'}>{v}</Tag> },
    { title:'Tên gọi nhớ', dataIndex:'tenGoiNho', render:v=><b>{v}</b> },
    { title:'Địa chỉ', dataIndex:'diaChi' },
    { title:'Kết thúc (TT)', key:'ketThucTt', render:(_, r) => <span style={{ color: r.trangThai==='Hoàn thành'?'#52c41a':'#8c8c8c', fontSize:12 }}>{r.trangThai==='Hoàn thành' ? (r.ngay ? `${dayjs(r.ngay).format('DD/MM/YYYY')} 00:25` : '27/08/2024 00:25') : '—'}</span> },
    { title:'Kết thúc (GPS)', key:'ketThucGps', render:(_, r) => {
        const c = getCoord(r.diaChi);
        return <span style={{ color:'#1677ff', fontSize:12 }}>
          {r.trangThai==='Hoàn thành' ? `📍 ${c[0].toFixed(4)}, ${c[1].toFixed(4)}` : 'Đang định vị...'}
        </span>;
      }
    },
    { title:'Trạng thái', dataIndex:'trangThai', render:v=>statusTag(v) },
  ];

  const orderColor = STATUS_COLOR[orderStatus] || '#666';

  useEffect(() => {
    const loadDocs = async () => {
      let apiDocs = [];
      try {
        const res = await API.getDocuments();
        if (Array.isArray(res.data)) apiDocs = res.data;
      } catch (err) {
        console.error('Lỗi lấy chứng từ từ API trong OrderDetail:', err);
      }

      let storedDocs = [];
      try {
        const saved = localStorage.getItem('vm_documents');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) storedDocs = parsed;
        }
      } catch (e) {}

      setLocalDocs([...apiDocs, ...storedDocs]);
    };
    loadDocs();
  }, [order?.soBienNhan, order?.so_bien_nhan]);

  const allDocs = useMemo(() => {
    return [...(documents || []), ...localDocs];
  }, [documents, localDocs]);

  const orderDocs = useMemo(() => {
    if (!order) return [];
    const code = String(order.soBienNhan || order.so_bien_nhan || '').trim();
    if (!code) return [];
    return allDocs.filter(d => {
      const docOrder = String(d.donHang || d.don_hang || '').trim();
      return docOrder && docOrder.toLowerCase() === code.toLowerCase();
    });
  }, [allDocs, order]);

  const dataURLtoBlob = (dataurl) => {
    if (!dataurl) return null;
    if (dataurl.startsWith('blob:')) return dataurl;
    try {
      const arr = dataurl.split(',');
      const mimeMatch = arr[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'application/pdf';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new Blob([u8arr], { type: mime });
    } catch (e) {
      console.error('Error converting dataURL to blob:', e);
      return null;
    }
  };

  const handleSaveDoc = async () => {
    try {
      const vals = await docForm.validateFields();
      const rawFile = vals.file?.fileList?.[0]?.originFileObj || vals.file?.file?.originFileObj || vals.file?.fileList?.[0] || null;
      const uploadedFileName = rawFile?.name || vals.file?.fileList?.[0]?.name || vals.file?.file?.name;
      
      let fileUrl = null;
      if (rawFile instanceof File || rawFile instanceof Blob) {
        fileUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(rawFile);
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => resolve(null);
        });
      } else if (typeof rawFile === 'string') {
        fileUrl = rawFile;
      }

      const newDocPayload = {
        maChungTu: `CT-${Date.now()}`,
        tenChungTu: vals.tenChungTu,
        tenFile: uploadedFileName || `${vals.tenChungTu.replace(/\s+/g, '_')}.pdf`,
        soChungTu: `SC-${Date.now()}`,
        donHang: order.soBienNhan || order.so_bien_nhan,
        fileUrl: fileUrl,
        trangThai: 'hop_le'
      };

      const res = await API.createDocument(newDocPayload);
      const savedDoc = res.data || { ...newDocPayload, id: Date.now() };

      setLocalDocs(prev => [savedDoc, ...prev]);
      if (onUploadDoc) onUploadDoc(savedDoc);
      message.success('Thêm chứng từ thành công!');
      setDocModal(false);
      docForm.resetFields();
    } catch (err) {
      console.error(err);
      message.error('Vui lòng chọn tên chứng từ');
    }
  };

  return (
    <div style={{ animation:'fadeIn 0.25s ease' }}>
      {/* Breadcrumb */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:8 }}>
        <Space>
          <Button type="text" icon={<ArrowLeftOutlined/>} onClick={onBack} />
          <Breadcrumb items={[
            { title:'Quản lý đơn hàng' },
            { title:'Đơn hàng' },
            { title:'Chi tiết' },
          ]} />
        </Space>
        <Space>
          <Button icon={<ReloadOutlined/>}>Làm mới</Button>
          <Button type="primary" icon={<EditOutlined/>} onClick={() => onEdit(order)}>Sửa</Button>
        </Space>
      </div>

      {/* Order number header */}
      <div style={{ marginBottom:16, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <Title level={4} style={{ margin:0, fontFamily:'monospace', color:'#1677ff' }}>
          {order.soBienNhan}
        </Title>
        <Tag color={orderColor}>{STATUS_LABEL[orderStatus]}</Tag>
        <Tag color="blue">{order.loaiCont || '20DC'}</Tag>
      </div>

      {/* ── THÔNG TIN ĐƠN HÀNG ── */}
      <Card title="📋 Thông tin đơn hàng" style={{ borderRadius:12, marginBottom:12, boxShadow:'0 2px 12px rgba(0,0,0,0.06)' }}>
        <Descriptions bordered column={{ xs:1, sm:2, md:3 }} size="small">
          <Descriptions.Item label="Số biên nhận"><b style={{ color:'#1677ff' }}>{order.soBienNhan}</b></Descriptions.Item>
          <Descriptions.Item label="Ngày lập">{order.ngayTao ? dayjs(order.ngayTao).format('DD/MM/YYYY') : '—'}</Descriptions.Item>
          <Descriptions.Item label="Ngày cập nhật">{order.capNhatLuc || dayjs().format('DD/MM/YYYY')}</Descriptions.Item>
          <Descriptions.Item label="Loại đơn hàng">{order.loaiDonHang || 'Xuất quốc tế'}</Descriptions.Item>
          <Descriptions.Item label="Loại hình">{order.loaiHinh || 'Nhập cảng'}</Descriptions.Item>
          <Descriptions.Item label="Hàng hóa / Loại hàng"><b>{order.hangHoa || order.hang_hoa || '—'}</b></Descriptions.Item>
          <Descriptions.Item label="Yêu cầu nhiệt độ">{order.nhietDo || order.nhiet_do || '—'}</Descriptions.Item>
          <Descriptions.Item label="Sale phụ trách">{sale?.name || order.saleName || '—'}</Descriptions.Item>
          <Descriptions.Item label="Ghi chú">{order.ghiChu || '—'}</Descriptions.Item>
        </Descriptions>
      </Card>

      {/* ── BÊN GIAO, NHẬN & HÓA ĐƠN VAT ── */}
      <Card title="🏢 Khách hàng / Bên giao, Bên nhận & Xuất hóa đơn VAT" style={{ borderRadius:12, marginBottom:12, boxShadow:'0 2px 12px rgba(0,0,0,0.06)' }} bodyStyle={{ padding: 16 }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Descriptions bordered column={1} size="small" labelStyle={{ width: 160, fontWeight: 600 }}>
              <Descriptions.Item label="Khách hàng / Bên giao">{sender?.name || order.benGiaoName || order.bien_gui_name || order.tenKhachHang || order.ten_khach_hang || '—'}</Descriptions.Item>
              <Descriptions.Item label="Bên nhận hàng">{receiver?.name || order.benNhanName || order.bien_nhan_name || '—'}</Descriptions.Item>
              <Descriptions.Item label="Điều vận">{dieuvan?.name || order.dieuVanName || '—'}</Descriptions.Item>
            </Descriptions>
          </Col>
          <Col xs={24} md={12}>
            <Descriptions bordered column={1} size="small" labelStyle={{ width: 160, fontWeight: 600 }}>
              <Descriptions.Item label="Tên công ty xuất HĐ">{order.tenKhachHang || order.ten_khach_hang || sender?.name || '—'}</Descriptions.Item>
              <Descriptions.Item label="Mã số thuế">{order.mstKhachHang || order.mst_khach_hang || '—'}</Descriptions.Item>
              <Descriptions.Item label="Địa chỉ xuất hóa đơn">{order.diaChiVat || order.dia_chi_vat || '—'}</Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
      </Card>

      {/* ── LỊCH TRÌNH VẬN CHUYỂN ── */}
      <Card title="📍 Lịch trình vận chuyển" style={{ borderRadius:12, marginBottom:16, boxShadow:'0 2px 12px rgba(0,0,0,0.06)' }}>
        <Descriptions bordered column={1} size="small" labelStyle={{ width: 200, fontWeight: 600 }}>
          <Descriptions.Item label="1. Nơi lấy vỏ/hàng">{order.noiLay || '—'}</Descriptions.Item>
          <Descriptions.Item label="2. Nơi giao vỏ/hàng">{order.noiGiao || '—'}</Descriptions.Item>
          <Descriptions.Item label="3. Nơi hạ hàng/vỏ">{order.noiHa || '—'}</Descriptions.Item>
        </Descriptions>
      </Card>

      {/* ── CHỨNG TỪ ĐÍNH KÈM DƠN HÀNG ── */}
      <Card
        title={<span>📑 Danh sách Chứng từ & Hồ sơ đính kèm đơn hàng ({order.soBienNhan})</span>}
        extra={
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => { docForm.resetFields(); setDocModal(true); }}>
            Upload Chứng từ
          </Button>
        }
        style={{ borderRadius: 12, marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
      >
        <Table
          dataSource={orderDocs}
          columns={[
            {
              title: 'Tên chứng từ',
              dataIndex: 'tenChungTu',
              key: 'tenChungTu',
              render: t => <strong>{t}</strong>
            },
            {
              title: 'Tên file',
              dataIndex: 'tenFile',
              key: 'tenFile',
              render: (t, r) => <span style={{ color: '#1677ff' }}>{t || r.fileName || 'Chưa có file'}</span>
            },
            {
              title: 'Thao tác',
              key: 'actions',
              render: (_, r) => (
                <Space size={8}>
                  <Button size="small" type="primary" ghost icon={<EyeOutlined />} onClick={() => {
                    if (r.fileUrl) {
                      let url = r.fileUrl;
                      if (typeof url === 'string' && url.startsWith('data:')) {
                        const blob = dataURLtoBlob(url);
                        if (blob) url = URL.createObjectURL(blob);
                      }
                      window.open(url, '_blank');
                    } else {
                      message.warning('Chưa có file đính kèm để xem trước');
                    }
                  }}>Xem trước</Button>
                  <Button size="small" icon={<DownloadOutlined />} onClick={() => {
                    if (r.fileUrl) {
                      let url = r.fileUrl;
                      let isTempBlob = false;
                      if (typeof url === 'string' && url.startsWith('data:')) {
                        const blob = dataURLtoBlob(url);
                        if (blob) {
                          url = URL.createObjectURL(blob);
                          isTempBlob = true;
                        }
                      }
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = r.tenFile || 'document.pdf';
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      if (isTempBlob) {
                        setTimeout(() => URL.revokeObjectURL(url), 10000);
                      }
                      message.success(`Đang tải file ${r.tenFile || 'document'}...`);
                    } else {
                      message.warning('Chưa có file đính kèm để tải xuống');
                    }
                  }}>Tải xuống</Button>
                </Space>
              )
            }
          ]}
          rowKey="id"
          size="small"
          pagination={false}
          locale={{ emptyText: 'Chưa có chứng từ nào được upload' }}
        />
      </Card>

      {/* Modal Upload Document */}
      <Modal
        title="Thêm chứng từ đính kèm"
        open={docModal}
        onCancel={() => setDocModal(false)}
        onOk={handleSaveDoc}
        okText="Lưu chứng từ"
        cancelText="Hủy"
      >
        <Form form={docForm} layout="vertical">
          <Form.Item name="tenChungTu" label="Tên chứng từ *" rules={[{ required: true, message: 'Vui lòng chọn hoặc nhập tên chứng từ' }]}>
            <AutoComplete
              options={DOCUMENT_TYPE_OPTIONS}
              placeholder="Chọn loại chứng từ hoặc nhập tự do..."
              filterOption={(inputValue, option) =>
                option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
              }
            />
          </Form.Item>
          <Form.Item name="file" label="File đính kèm (Hình ảnh/PDF)">
            <Upload maxCount={1} beforeUpload={() => false}>
              <Button icon={<UploadOutlined />}>Chọn file đính kèm (Hình ảnh/PDF)...</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>

      {/* Footer */}
      <div style={{ textAlign:'right', color:'#bfbfbf', fontSize:12, marginTop:12 }}>
        Tạo lúc: {order.ngayTao ? dayjs(order.ngayTao).format('HH:mm DD/MM/YYYY') : '—'}
        &nbsp;|&nbsp;
        Cập nhật: {dayjs().format('HH:mm DD/MM/YYYY')}
      </div>
    </div>
  );
}

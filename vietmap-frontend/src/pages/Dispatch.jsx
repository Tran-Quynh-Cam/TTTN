import React, { useState, useEffect, useRef } from 'react';
import { Table, Card, Typography, Tag, Space, Button, Select, Input, Modal, Form, message, Row, Col, Statistic, Progress, Timeline } from 'antd';
import { CarOutlined, PlusOutlined, EditOutlined, UserOutlined, ClockCircleOutlined, CheckCircleOutlined, SyncOutlined, SendOutlined, MailOutlined, FilterOutlined, ReloadOutlined, CheckOutlined, SearchOutlined, FilterFilled, CheckCircleFilled, PlayCircleOutlined, PauseCircleOutlined, RedoOutlined, CompassOutlined, EnvironmentOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import API, { socket } from '../services/api';
import DB from '../store/db';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const { Title, Text } = Typography;

/* ── Leaflet icon fix ── */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

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

function DispatchTrackingMap({ activeMapOrder, milestones, simStep, isSimulating, simSpeed, mapType }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const tileLayerRef = useRef(null);
  const truckMarkerRef = useRef(null);
  const routeLayerRef = useRef(null);
  const stationMarkersRef = useRef([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (container._leaflet_id) {
      container._leaflet_id = null;
    }

    const start = activeMapOrder?.diem_lay_hang || activeMapOrder?.diemLayHang || 'ICD Phước Long';
    const giao = activeMapOrder?.diem_giao_hang || activeMapOrder?.diemGiaoHang || 'KCN Long Hậu';
    const tra = activeMapOrder?.diem_tra_rong || activeMapOrder?.diemTraRong || 'Depot Cát Lái';

    const c1 = getCoord(start);
    const c2 = getCoord(giao);
    const c3 = getCoord(tra);

    const map = L.map(container, { zoomControl: false, fadeAnimation: false }).setView(c1, 11);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    mapRef.current = map;

    const tileUrl = mapType === 'satellite' 
      ? 'https://mt1.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}'
      : 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';

    const tileLayer = L.tileLayer(tileUrl, { maxZoom: 20, attribution: 'Google Maps' }).addTo(map);
    tileLayerRef.current = tileLayer;

    const forceResize = () => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
        mapRef.current.fitBounds([c1, c2, c3], { padding: [50, 50], maxZoom: 13 });
      }
    };

    const timers = [
      setTimeout(forceResize, 50),
      setTimeout(forceResize, 150),
      setTimeout(forceResize, 350),
      setTimeout(forceResize, 600)
    ];

    const resizeObserver = new ResizeObserver(forceResize);
    resizeObserver.observe(container);

    return () => {
      timers.forEach(clearTimeout);
      resizeObserver.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        routeLayerRef.current = null;
        truckMarkerRef.current = null;
        stationMarkersRef.current = [];
      }
    };
  }, [activeMapOrder?.id]);

  useEffect(() => {
    if (!tileLayerRef.current) return;
    const tileUrl = mapType === 'satellite' 
      ? 'https://mt1.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}'
      : 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
    tileLayerRef.current.setUrl(tileUrl);
  }, [mapType]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !activeMapOrder) return;

    const start = activeMapOrder.diem_lay_hang || activeMapOrder.diemLayHang || 'ICD Phước Long';
    const giao = activeMapOrder.diem_giao_hang || activeMapOrder.diemGiaoHang || 'KCN Long Hậu';
    const tra = activeMapOrder.diem_tra_rong || activeMapOrder.diemTraRong || 'Depot Cát Lái';

    const c1 = getCoord(start);
    const c2 = getCoord(giao);
    const c3 = getCoord(tra);

    const mkStationIcon = (number, labelTitle, statusColor) => L.divIcon({
      className: '',
      html: `
        <div style="display:flex;flex-direction:column;align-items:center;">
          <div style="background:#ffffff;color:#1f1f1f;font-weight:700;font-size:12px;padding:3px 8px;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:1px solid #d9d9d9;white-space:nowrap;margin-bottom:4px;">
            ${number}. ${labelTitle}
          </div>
          <div style="background:${statusColor};color:#fff;font-weight:800;font-size:13px;width:30px;height:30px;border-radius:50%;border:2px solid #ffffff;box-shadow:0 3px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">
            ${number}
          </div>
        </div>
      `,
      iconSize: [140, 60],
      iconAnchor: [70, 50],
    });

    const color1 = milestones.lay?.reached ? '#52c41a' : '#1677ff';
    const color2 = milestones.giao?.reached ? '#52c41a' : (simStep > 0 ? '#1677ff' : '#8c8c8c');
    const color3 = milestones.tra?.reached ? '#52c41a' : '#8c8c8c';

    stationMarkersRef.current.forEach(m => m.remove());
    stationMarkersRef.current = [];

    const m1 = L.marker(c1, { icon: mkStationIcon(1, 'Lấy vỏ/hàng', color1) }).bindPopup(`<b>1. Nơi Lấy vỏ/hàng:</b><br/>${start}`).addTo(map);
    const m2 = L.marker(c2, { icon: mkStationIcon(2, 'Giao vỏ/hàng', color2) }).bindPopup(`<b>2. Nơi Giao vỏ/hàng:</b><br/>${giao}`).addTo(map);
    const m3 = L.marker(c3, { icon: mkStationIcon(3, 'Hạ hàng/vỏ', color3) }).bindPopup(`<b>3. Nơi Hạ hàng/vỏ:</b><br/>${tra}`).addTo(map);
    stationMarkersRef.current = [m1, m2, m3];

    // Remove old route layer if present
    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }

    // High contrast route line connecting 1 -> 2 -> 3
    const routeGroup = L.featureGroup();
    L.polyline([c1, c2, c3], { color: '#003a8c', weight: 9, opacity: 0.3, lineCap: 'round', lineJoin: 'round' }).addTo(routeGroup);
    L.polyline([c1, c2, c3], { color: '#1677ff', weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(routeGroup);
    routeGroup.addTo(map);
    routeLayerRef.current = routeGroup;

    let currentPos;
    if (simStep <= 50) {
      const f = simStep / 50;
      currentPos = [c1[0] + (c2[0] - c1[0]) * f, c1[1] + (c2[1] - c1[1]) * f];
    } else {
      const f = (simStep - 50) / 50;
      currentPos = [c2[0] + (c3[0] - c2[0]) * f, c2[1] + (c3[1] - c2[1]) * f];
    }

    const truckIcon = L.divIcon({
      className: '',
      html: `
        <div style="background:#1677ff;color:#fff;font-size:18px;width:38px;height:38px;border-radius:50%;border:3px solid #fff;box-shadow:0 4px 12px rgba(22,119,255,0.6);display:flex;align-items:center;justify-content:center;">
          🚚
        </div>
      `,
      iconSize: [38, 38],
      iconAnchor: [19, 19]
    });

    if (!truckMarkerRef.current) {
      truckMarkerRef.current = L.marker(currentPos, { icon: truckIcon })
        .bindPopup(`<b>🚛 Xe: ${activeMapOrder.bien_so || activeMapOrder.bienSo || '51D-11111'}</b><br/>Vận tốc GPS: ${isSimulating ? 45 * simSpeed : 0} km/h`)
        .addTo(map);
    } else {
      truckMarkerRef.current.setLatLng(currentPos);
      if (truckMarkerRef.current.getPopup()) {
        truckMarkerRef.current.getPopup().setContent(`<b>🚛 Xe: ${activeMapOrder.bien_so || activeMapOrder.bienSo || '51D-11111'}</b><br/>Vận tốc GPS: ${isSimulating ? 45 * simSpeed : 0} km/h`);
      }
    }
  }, [activeMapOrder, milestones, simStep, isSimulating, simSpeed]);

  return <div ref={containerRef} style={{ width: '100%', height: '480px', borderBottomRightRadius: 8 }} />;
}

export default function Dispatch() {
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [saleFilter, setSaleFilter] = useState('');
  const [driverFilter, setDriverFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [trackingModalOpen, setTrackingModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [activeMapOrder, setActiveMapOrder] = useState(null);
  const [form] = Form.useForm();
  
  // ── GPS Simulation States ──
  const [isSimulating, setIsSimulating] = useState(false);
  const [simStep, setSimStep] = useState(0);
  const [simSpeed, setSimSpeed] = useState(1);
  const [mapType, setMapType] = useState('roadmap'); // 'roadmap' | 'satellite'
  const [milestones, setMilestones] = useState({
    lay: { reached: false, time: null, driverTime: null },
    giao: { reached: false, time: null, driverTime: null },
    tra: { reached: false, time: null, driverTime: null }
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [ordersRes, driversRes, vehiclesRes] = await Promise.all([
        API.getOrders().catch(() => ({ data: [] })),
        API.getStakeholders('drivers').catch(() => ({ data: [] })),
        API.getVehicles().catch(() => ({ data: [] }))
      ]);
      setOrders(ordersRes.data || []);
      setDrivers(driversRes.data || []);
      setVehicles(vehiclesRes.data || []);
      
      if (ordersRes.data?.length > 0 && !activeMapOrder) {
        setActiveMapOrder(ordersRes.data[0]);
      }
    } catch (err) {
      console.error('Lỗi lấy dữ liệu điều xe:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Listen to real-time socket events from drivers
  useEffect(() => {
    const handleRealtimeUpdate = (data) => {
      console.log('📡 Realtime station update received:', data);
      fetchData();
      if (data && activeMapOrder && Number(data.orderId || data.id) === Number(activeMapOrder.id)) {
        let prog = data.progress;
        if (typeof prog === 'string') {
          try { prog = JSON.parse(prog); } catch (e) {}
        }
        if (prog) {
          setMilestones(prev => ({
            lay: { ...prev.lay, driverTime: prog.step1 ? (prog.step1_time || dayjs().format('HH:mm:ss DD/MM/YYYY')) : null },
            giao: { ...prev.giao, driverTime: prog.step2 ? (prog.step2_time || dayjs().format('HH:mm:ss DD/MM/YYYY')) : null },
            tra: { ...prev.tra, driverTime: prog.step3 ? (prog.step3_time || dayjs().format('HH:mm:ss DD/MM/YYYY')) : null }
          }));
        }
      }
      message.info({ content: '⚡ Đã nhận cập nhật tiến độ trạm mới từ tài xế!', key: 'rt_station_msg' });
    };

    const handleStorageChange = () => {
      if (activeMapOrder && trackingModalOpen) {
        try {
          const savedProgress = localStorage.getItem('fleetos_order_progress_v1');
          const parsed = savedProgress ? JSON.parse(savedProgress) : {};
          const driverProg = parsed[activeMapOrder.id] || {};
          setMilestones(prev => ({
            lay: { ...prev.lay, driverTime: driverProg.step1 ? driverProg.step1_time : null },
            giao: { ...prev.giao, driverTime: driverProg.step2 ? driverProg.step2_time : null },
            tra: { ...prev.tra, driverTime: driverProg.step3 ? driverProg.step3_time : null }
          }));
        } catch (e) {}
      }
    };

    if (socket) {
      socket.on('order_progress_updated', handleRealtimeUpdate);
      socket.on('driver_confirm_station', handleRealtimeUpdate);
      socket.on('order_updated', handleRealtimeUpdate);
    }
    window.addEventListener('storage', handleStorageChange);

    return () => {
      if (socket) {
        socket.off('order_progress_updated', handleRealtimeUpdate);
        socket.off('driver_confirm_station', handleRealtimeUpdate);
        socket.off('order_updated', handleRealtimeUpdate);
      }
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [activeMapOrder?.id, trackingModalOpen]);

  // Load saved milestones when opening tracking modal or selecting a new order
  useEffect(() => {
    if (activeMapOrder && trackingModalOpen) {
      let driverProg = {};
      try {
        const savedProgress = localStorage.getItem('fleetos_order_progress_v1');
        const parsed = savedProgress ? JSON.parse(savedProgress) : {};
        if (parsed[activeMapOrder.id]) driverProg = parsed[activeMapOrder.id];
      } catch (e) {}

      let gpsSaved = {};
      try {
        const savedGps = localStorage.getItem(`vm_gps_milestones_${activeMapOrder.id}`);
        if (savedGps) gpsSaved = JSON.parse(savedGps);
      } catch (e) {}

      setMilestones({
        lay: { 
          reached: !!gpsSaved.lay?.reached, 
          time: gpsSaved.lay?.time || null, 
          driverTime: activeMapOrder.ngay_lay_hang || activeMapOrder.ngayLayHang || (driverProg.step1 ? driverProg.step1_time : null) || gpsSaved.lay?.driverTime || null 
        },
        giao: { 
          reached: !!gpsSaved.giao?.reached, 
          time: gpsSaved.giao?.time || null, 
          driverTime: activeMapOrder.ngay_giao_hang || activeMapOrder.ngayGiaoHang || (driverProg.step2 ? driverProg.step2_time : null) || gpsSaved.giao?.driverTime || null 
        },
        tra: { 
          reached: !!gpsSaved.tra?.reached, 
          time: gpsSaved.tra?.time || null, 
          driverTime: activeMapOrder.ngay_tra_rong || activeMapOrder.ngayTraRong || (driverProg.step3 ? driverProg.step3_time : null) || gpsSaved.tra?.driverTime || null 
        }
      });
      setSimStep(0);
      setIsSimulating(false);
    }
  }, [activeMapOrder?.id, activeMapOrder?.ngay_lay_hang, activeMapOrder?.ngay_giao_hang, activeMapOrder?.ngay_tra_rong, trackingModalOpen]);

  // Simulation timer loop
  useEffect(() => {
    let timer = null;
    if (isSimulating && trackingModalOpen && activeMapOrder) {
      const intervalMs = Math.max(80, Math.floor(350 / simSpeed));
      timer = setInterval(() => {
        setSimStep(prev => {
          const nextStep = prev + 1;
          const totalSteps = 100;

          const start = activeMapOrder.diem_lay_hang || activeMapOrder.diemLayHang || 'ICD Phước Long';
          const giao = activeMapOrder.diem_giao_hang || activeMapOrder.diemGiaoHang || 'KCN Long Hậu';
          const tra = activeMapOrder.diem_tra_rong || activeMapOrder.diemTraRong || 'Depot Cát Lái';
          const c1 = getCoord(start);
          const c2 = getCoord(giao);
          const c3 = getCoord(tra);

          let currentPos;
          if (nextStep <= 50) {
            const f = nextStep / 50;
            currentPos = [c1[0] + (c2[0] - c1[0]) * f, c1[1] + (c2[1] - c1[1]) * f];
          } else {
            const f = (nextStep - 50) / 50;
            currentPos = [c2[0] + (c3[0] - c2[0]) * f, c2[1] + (c3[1] - c2[1]) * f];
          }

          const nowStr = dayjs().format('HH:mm:ss DD/MM/YYYY');
          setMilestones(m => {
            const nextM = { ...m };
            let updated = false;

            if (!nextM.lay?.reached) {
              nextM.lay = { ...(nextM.lay || {}), reached: true, time: nowStr };
              updated = true;
            }

            if (nextStep >= 50 && !nextM.giao?.reached) {
              nextM.giao = { ...(nextM.giao || {}), reached: true, time: nowStr };
              updated = true;
              message.success(`🎯 Định vị GPS: Xe đã đi qua Điểm Giao Hàng (${giao}) lúc ${nowStr}`);
            }

            if (nextStep >= 100 && !nextM.tra?.reached) {
              nextM.tra = { ...(nextM.tra || {}), reached: true, time: nowStr };
              updated = true;
              message.success(`🏁 Định vị GPS: Xe đã đến Điểm Trả Rỗng (${tra}) lúc ${nowStr}`);
            }

            if (updated && activeMapOrder.id) {
              localStorage.setItem(`vm_gps_milestones_${activeMapOrder.id}`, JSON.stringify(nextM));
              setOrders(prevOrders => [...prevOrders]);
            }
            return nextM;
          });

          if (nextStep >= totalSteps) {
            setIsSimulating(false);
            return totalSteps;
          }

          return nextStep;
        });
      }, intervalMs);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isSimulating, trackingModalOpen, activeMapOrder, simSpeed]);

  const openDispatchModal = (order) => {
    setSelectedOrder(order);
    setModalOpen(true);
    const driverObj = drivers.find(d => d.id === (order.tai_xe_id || order.taiXeId));
    form.setFieldsValue({
      taiXeId: order.tai_xe_id || order.taiXeId,
      vehicleId: order.vehicle_id || order.vehicleId,
      emailTaiXe: order.email_tai_xe || order.emailTaiXe || driverObj?.email || ''
    });
  };

  const handleSaveDispatch = async () => {
    try {
      const vals = await form.validateFields();
      if (selectedOrder) {
        await API.updateOrder(selectedOrder.id, {
          ...selectedOrder,
          soBienNhan: selectedOrder.so_bien_nhan || selectedOrder.soBienNhan,
          ngayTao: selectedOrder.ngay_tao || selectedOrder.ngayTao,
          saleId: selectedOrder.sale_id || selectedOrder.saleId,
          dieuVanId: selectedOrder.dieu_van_id || selectedOrder.dieuVanId,
          taiXeId: vals.taiXeId,
          vehicleId: vals.vehicleId,
          trangThai: selectedOrder.trang_thai || selectedOrder.trangThai || 'chua_bat_dau',
          emailTaiXe: vals.emailTaiXe || '',
          ghiChu: selectedOrder.ghi_chu || selectedOrder.ghiChu || ''
        });
        message.success('Cập nhật điều phối chuyến hàng thành công!');
        setModalOpen(false);
        fetchData();
      }
    } catch (err) {
      console.error(err);
      message.error('Lỗi khi lưu điều phối chuyến hàng');
    }
  };

  const handleSendEmail = async (order) => {
    const isAssigned = !!(order.tai_xe_id || order.taiXeId);
    if (!isAssigned) {
      message.warning('Vui lòng phân công tài xế trước khi gửi lệnh qua Email!');
      return;
    }

    message.loading({ content: `Đang gửi lệnh đi đường & chứng từ qua Mail tài xế...`, key: 'sendEmail' });
    try {
      let docsForOrder = [];
      try {
        const savedDocs = JSON.parse(localStorage.getItem('vm_documents') || '[]');
        docsForOrder = savedDocs.filter(d => d.donHang === (order.so_bien_nhan || order.soBienNhan));
      } catch (e) {}

      const res = await API.post(`/orders/${order.id}/send-email`, {
        documents: docsForOrder,
        emailTaiXe: order.email_tai_xe || order.emailTaiXe
      });
      message.success({ content: res.data?.message || `Đã gửi Lệnh & Chứng từ qua Mail tài xế thành công!`, key: 'sendEmail' });
      fetchData();
    } catch (err) {
      console.error(err);
      message.error({ content: err.response?.data?.error || err.response?.data?.message || 'Gửi email thất bại!', key: 'sendEmail' });
    }
  };

  const filteredOrders = orders.filter(o => {
    const code = o.so_bien_nhan || o.soBienNhan || '';
    const driverName = o.driver_name || o.tai_xe_name || o.taiXeName || '';
    const driverId = o.tai_xe_id || o.taiXeId;
    const vehicle = o.vehicle_number || o.bien_so || o.bienSo || '';
    const saleName = o.sale_name || o.saleName || '';
    const saleId = o.sale_id || o.saleId;

    const matchSearch = !search || 
      code.toLowerCase().includes(search.toLowerCase()) || 
      driverName.toLowerCase().includes(search.toLowerCase()) || 
      vehicle.toLowerCase().includes(search.toLowerCase()) ||
      saleName.toLowerCase().includes(search.toLowerCase());

    const isAssigned = !!driverId;
    const isDone = (o.trang_thai || o.trangThai) === 'hoan_thanh';
    let matchStatus = true;
    if (statusFilter === 'hoan_thanh') {
      matchStatus = isDone;
    } else if (statusFilter === 'chua_hoan_thanh') {
      matchStatus = !isDone;
    }

    let matchSale = true;
    if (saleFilter) {
      matchSale = (saleName === saleFilter) || (saleId === saleFilter);
    }

    let matchDriver = true;
    if (driverFilter === 'unassigned') {
      matchDriver = !isAssigned;
    } else if (driverFilter) {
      matchDriver = (driverName === driverFilter) || (driverId === driverFilter);
    }

    return matchSearch && matchStatus && matchSale && matchDriver;
  }).sort((a, b) => (b.id || 0) - (a.id || 0));

  // Dynamic filter options for page header
  const uniqueSales = Array.from(new Set(orders.map(o => o.sale_name || o.saleName).filter(Boolean)));
  const saleOptions = [
    { value: '', label: 'Tất cả Sale' },
    ...uniqueSales.map(name => ({ value: name, label: `👤 Sale: ${name}` }))
  ];

  const driverOptions = [
    { value: '', label: 'Tất cả Tài xế' },
    { value: 'unassigned', label: '⚠️ Chưa gán tài xế' },
    ...drivers.map(d => ({ value: d.id, label: `🚛 ${d.name}` }))
  ];

  // Available drivers for dispatch assignment modal (filter out drivers assigned to active orders except selectedOrder)
  const assignedDriverIds = orders
    .filter(o => {
      const isCompleted = (o.trang_thai || o.trangThai) === 'hoan_thanh';
      const isCurrentOrder = selectedOrder && o.id === selectedOrder.id;
      return !isCompleted && !isCurrentOrder && (o.tai_xe_id || o.taiXeId);
    })
    .map(o => o.tai_xe_id || o.taiXeId);

  const availableDrivers = drivers.filter(d => !assignedDriverIds.includes(d.id));

  const STATUS_MAP = {
    chua_hoan_thanh: { text: 'Chưa hoàn thành', color: 'warning', icon: <ClockCircleOutlined /> },
    hoan_thanh: { text: 'Hoàn thành', color: 'success', icon: <CheckCircleOutlined /> }
  };

  const getColumnSearchProps = (dataIndex, placeholder) => ({
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
      <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
        <Input
          placeholder={placeholder}
          value={selectedKeys[0]}
          onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
          onPressEnter={() => confirm()}
          style={{ marginBottom: 8, display: 'block', width: 180 }}
        />
        <Space>
          <Button
            type="primary"
            onClick={() => confirm()}
            icon={<SearchOutlined />}
            size="small"
            style={{ width: 80 }}
          >
            Tìm
          </Button>
          <Button
            onClick={() => { clearFilters(); confirm(); }}
            size="small"
            style={{ width: 80 }}
          >
            Xóa
          </Button>
        </Space>
      </div>
    ),
    filterIcon: (filtered) => (
      <FilterFilled style={{ color: filtered ? '#1677ff' : '#bfbfbf', fontSize: 13 }} />
    ),
    onFilter: (value, record) => {
      if (value === 'unassigned') return !(record.tai_xe_id || record.taiXeId);
      if (value === 'assigned') return !!(record.tai_xe_id || record.taiXeId);
      const val = (value || '').toLowerCase();
      if (dataIndex === 'so_bien_nhan') {
        const code = (record.so_bien_nhan || record.soBienNhan || '').toLowerCase();
        const sale = (record.sale_name || record.saleName || '').toLowerCase();
        return code.includes(val) || sale.includes(val);
      }
      if (dataIndex === 'driverVehicle') {
        const driver = (record.driver_name || record.tai_xe_name || record.taiXeName || '').toLowerCase();
        const vehicle = (record.vehicle_number || record.bien_so || record.bienSo || '').toLowerCase();
        return driver.includes(val) || vehicle.includes(val);
      }
      return true;
    }
  });

  const getOrderMilestoneCount = (record) => {
    if (!record || !record.id) return 0;
    const saved = localStorage.getItem(`vm_gps_milestones_${record.id}`);
    if (saved) {
      try {
        const m = JSON.parse(saved);
        let count = 0;
        if (m.lay?.reached) count++;
        if (m.giao?.reached) count++;
        if (m.tra?.reached) count++;
        return count;
      } catch (e) {}
    }
    const st = record.trang_thai || record.trangThai || 'chua_hoan_thanh';
    if (st === 'hoan_thanh') return 3;
    if (st === 'dang_thuc_hien') return record.progress_step || 1;
    return 0;
  };

  const columns = [
    {
      title: 'Số biên nhận',
      dataIndex: 'so_bien_nhan',
      width: '20%',
      ...getColumnSearchProps('so_bien_nhan', 'Tìm mã đơn, sale...'),
      render: (t, r) => (
        <div style={{ lineHeight: 1.4 }}>
          <strong style={{ color: '#1677ff', cursor: 'pointer' }}>{t || r.soBienNhan}</strong>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>
            👤 Sale: {r.sale_name || r.saleName || '—'}
          </div>
        </div>
      )
    },
    {
      title: 'Tài xế & Xe',
      key: 'driverVehicle',
      width: '25%',
      filters: [
        { text: 'Chưa phân công tài xế', value: 'unassigned' },
        { text: 'Đã phân công tài xế', value: 'assigned' }
      ],
      ...getColumnSearchProps('driverVehicle', 'Tìm tài xế, biển số...'),
      render: (_, r) => (
        <div style={{ lineHeight: 1.4 }}>
          <div style={{ fontWeight: 600, color: '#262626' }}>
            <UserOutlined style={{ marginRight: 6, color: '#1677ff' }} />
            {r.driver_name || r.tai_xe_name || r.taiXeName || <span style={{ color: '#bfbfbf', fontStyle: 'italic' }}>Chưa gán tài xế</span>}
          </div>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>
            🚛 {r.vehicle_number || r.bien_so || r.bienSo || 'Chưa gán xe'} {r.so_mooc ? `(${r.so_mooc})` : ''}
          </div>
        </div>
      )
    },
    {
      title: 'Nhiệm vụ',
      key: 'route',
      width: '20%',
      render: (_, r) => {
        const doneCount = getOrderMilestoneCount(r);
        const pendingCount = 3 - doneCount;

        return (
          <div style={{ lineHeight: 1.5, textAlign: 'left' }}>
            <div style={{ fontWeight: 600, color: '#262626', fontSize: 13 }}>3 nhiệm vụ</div>
            {doneCount > 0 && (
              <div style={{ color: '#52c41a', fontWeight: 600, fontSize: 13 }}>{doneCount} hoàn thành</div>
            )}
            {pendingCount > 0 && (
              <div style={{ color: '#ff4d4f', fontWeight: 600, fontSize: 13 }}>{pendingCount} chưa hoàn thành</div>
            )}
          </div>
        );
      }
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: '20%',
      filters: [
        { text: 'Chưa hoàn thành', value: 'chua_hoan_thanh' },
        { text: 'Đang thực hiện', value: 'dang_thuc_hien' },
        { text: 'Hoàn thành', value: 'hoan_thanh' }
      ],
      filterIcon: (filtered) => (
        <FilterFilled style={{ color: filtered ? '#1677ff' : '#bfbfbf', fontSize: 13 }} />
      ),
      onFilter: (value, record) => {
        const doneCount = getOrderMilestoneCount(record);
        let currentSt = 'chua_hoan_thanh';
        if (doneCount === 3) currentSt = 'hoan_thanh';
        else if (doneCount > 0) currentSt = 'dang_thuc_hien';
        else {
          const raw = record.trang_thai || record.trangThai || 'chua_hoan_thanh';
          currentSt = raw === 'hoan_thanh' ? 'hoan_thanh' : 'chua_hoan_thanh';
        }
        return currentSt === value;
      },
      render: (_, r) => {
        let currentSt = r.trang_thai || r.trangThai || 'chua_hoan_thanh';

        return (
          <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
            <Select
              value={currentSt}
              size="small"
              style={{ width: 145 }}
              onChange={async (newStatus) => {
                if (newStatus === 'hoan_thanh') {
                  let actualCount = 0;
                  const saved = localStorage.getItem(`vm_gps_milestones_${r.id}`);
                  if (saved) {
                    try {
                      const m = JSON.parse(saved);
                      if (m.lay?.reached) actualCount++;
                      if (m.giao?.reached) actualCount++;
                      if (m.tra?.reached) actualCount++;
                    } catch (e) {}
                  }
                  if (actualCount < 3) {
                    message.error('Vui lòng hoàn thành lộ trình 3 điểm trước khi chọn Hoàn thành!');
                    return;
                  }
                }
                try {
                  await API.updateOrder(r.id, {
                    ...r,
                    soBienNhan: r.so_bien_nhan || r.soBienNhan,
                    ngayTao: r.ngay_tao || r.ngayTao,
                    saleId: r.sale_id || r.saleId,
                    dieuVanId: r.dieu_van_id || r.dieuVanId,
                    taiXeId: r.tai_xe_id || r.taiXeId,
                    vehicleId: r.vehicle_id || r.vehicleId,
                    trangThai: newStatus,
                    ghiChu: r.ghi_chu || r.ghiChu || ''
                  });
                  message.success('Cập nhật trạng thái thành công!');
                  fetchData();
                } catch (err) {
                  console.error(err);
                  message.error('Lỗi khi đổi trạng thái');
                }
              }}
              options={[
                { value: 'chua_hoan_thanh', label: <Tag color="warning" style={{ margin: 0 }}>Chưa hoàn thành</Tag> },
                { value: 'dang_thuc_hien', label: <Tag color="processing" style={{ margin: 0 }}>Đang thực hiện</Tag> },
                { value: 'hoan_thanh', label: <Tag color="success" style={{ margin: 0 }}>Hoàn thành</Tag> }
              ]}
            />
          </div>
        );
      }
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: '15%',
      filters: [
        { text: 'Chưa gửi lệnh', value: 'unsent' },
        { text: 'Đã gửi lệnh', value: 'sent' }
      ],
      filterIcon: (filtered) => (
        <FilterFilled style={{ color: filtered ? '#1677ff' : '#bfbfbf', fontSize: 13 }} />
      ),
      onFilter: (value, record) => {
        const isSent = !!(record.da_gui_lenh || record.daGuiLenh);
        if (value === 'unsent') return !isSent;
        if (value === 'sent') return isSent;
        return true;
      },
      render: (_, r) => {
        const isAssigned = !!(r.tai_xe_id || r.taiXeId);
        const isSent = !!(r.da_gui_lenh || r.daGuiLenh);

        return (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Button 
              size="small" 
              type={isAssigned ? "default" : "primary"} 
              block 
              style={isAssigned ? { color: '#595959', borderColor: '#d9d9d9', background: '#fafafa' } : { background: '#52c41a', borderColor: '#52c41a', color: '#fff', fontWeight: 700, boxShadow: '0 2px 6px rgba(82, 196, 26, 0.35)' }}
              onClick={(e) => { e.stopPropagation(); openDispatchModal(r); }}
            >
              {isAssigned ? 'Sửa phân công' : 'Phân công'}
            </Button>

            {isSent ? (
              <Button 
                size="small" 
                type="default" 
                block 
                icon={<CheckOutlined style={{ color: '#52c41a' }} />} 
                style={{ background: '#f5f5f5', color: '#8c8c8c', borderColor: '#d9d9d9' }} 
                onClick={(e) => { e.stopPropagation(); handleSendEmail(r); }}
              >
                Đã gửi lệnh
              </Button>
            ) : (
              <Button 
                size="small" 
                type="primary" 
                block 
                icon={<MailOutlined />} 
                style={{ background: '#1677ff', borderColor: '#1677ff', color: '#fff', fontWeight: 600, boxShadow: '0 2px 6px rgba(22, 119, 255, 0.35)' }} 
                onClick={(e) => { e.stopPropagation(); handleSendEmail(r); }}
              >
                Gửi lệnh
              </Button>
            )}
          </Space>
        );
      }
    }
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>🚦 Điều độ & Lộ trình Vận chuyển</Title>
      </div>



      <Row gutter={16}>
        {/* Dispatches Table (Full Width) */}
        <Col xs={24} md={24}>
          <Card style={{ borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }} bodyStyle={{ padding: 16 }}>
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
              <Text type="secondary" style={{ fontSize: 13 }}>
                Hiển thị <strong>{orders.length}</strong> chuyến
              </Text>
            </div>

            <Table
              dataSource={orders}
              columns={columns}
              rowKey="id"
              loading={loading}
              size="small"
              pagination={{ pageSize: 8 }}
              onRow={(record) => {
                const isCompleted = (record.trang_thai || record.trangThai) === 'hoan_thanh';
                return {
                  onClick: () => {
                    setActiveMapOrder(record);
                    setTrackingModalOpen(true);
                  },
                  style: {
                    cursor: 'pointer',
                    background: activeMapOrder?.id === record.id ? '#e6f4ff' : 'transparent',
                    fontWeight: isCompleted ? 400 : 600
                  }
                };
              }}
            />
          </Card>
        </Col>
      </Row>

      <Modal
        title={null}
        open={trackingModalOpen}
        onCancel={() => {
          setTrackingModalOpen(false);
          setIsSimulating(false);
        }}
        footer={null}
        width={1080}
        bodyStyle={{ padding: 0 }}
      >
        <Row style={{ minHeight: 540 }}>
          {/* Left Column: Timeline & Progress Details */}
          <Col xs={24} md={9} style={{ padding: 24, borderRight: '1px solid #f0f0f0', background: '#fafafa', borderTopLeftRadius: 8, borderBottomLeftRadius: 8 }}>
            <div style={{ marginBottom: 20 }}>
              <Title level={5} style={{ margin: 0, color: '#1f1f1f' }}>🚦 Tiến Độ & Lộ Trình Chi Tiết</Title>
              <Text type="secondary" style={{ fontSize: 12 }}>Định vị thời gian thực & Xác nhận GPS 3 điểm</Text>
            </div>

            {activeMapOrder && (
              <>
                <Card size="small" style={{ marginBottom: 20, borderRadius: 8, background: '#ffffff', borderColor: '#e8e8e8' }}>
                  <div style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: '#8c8c8c' }}>Mã đơn:</span>
                    <strong style={{ color: '#1677ff' }}>{activeMapOrder.so_bien_nhan || activeMapOrder.soBienNhan}</strong>
                  </div>
                  <div style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: '#8c8c8c' }}>Tài xế:</span>
                    <strong>{activeMapOrder.tai_xe_name || activeMapOrder.driver_name || activeMapOrder.taiXeName || 'Chưa gán'}</strong>
                  </div>
                  <div style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#8c8c8c' }}>Phương tiện:</span>
                    <Tag color="cyan" style={{ margin: 0 }}>{activeMapOrder.bien_so || activeMapOrder.vehicle_number || activeMapOrder.bienSo || '51D-11111'}</Tag>
                  </div>
                </Card>

                <Timeline style={{ marginTop: 10 }}>
                  {/* Point 1: Pickup */}
                  <Timeline.Item
                    color={milestones.lay?.driverTime ? "green" : (milestones.lay?.reached ? "blue" : "gray")}
                    dot={milestones.lay?.driverTime ? <CheckCircleFilled style={{ color: '#52c41a', fontSize: 18 }} /> : (milestones.lay?.reached ? <ClockCircleOutlined style={{ color: '#1677ff', fontSize: 16 }} /> : <ClockCircleOutlined style={{ color: '#bfbfbf', fontSize: 16 }} />)}
                  >
                    <div style={{ fontWeight: 700, color: (milestones.lay?.reached || milestones.lay?.driverTime) ? '#262626' : '#595959', fontSize: 13 }}>
                      1. Nơi Lấy Hàng / Vỏ
                    </div>
                    <div style={{ color: '#ff4d4f', fontWeight: 600, fontSize: 13, margin: '2px 0 4px 0' }}>
                      {activeMapOrder.diem_lay_hang || activeMapOrder.diemLayHang || 'ICD Phước Long'}
                    </div>
                    <div style={{ background: (milestones.lay?.reached || milestones.lay?.driverTime) ? '#f6ffed' : '#fafafa', border: `1px solid ${(milestones.lay?.reached || milestones.lay?.driverTime) ? '#b7eb8f' : '#f0f0f0'}`, padding: '6px 10px', borderRadius: 6, fontSize: 12 }}>
                      <div style={{ color: milestones.lay?.reached ? '#389e0d' : '#8c8c8c' }}>
                        ⏰ Thời gian xe đến (GPS): <b>{milestones.lay?.time || '⏳ Chưa đến điểm (GPS)'}</b>
                      </div>
                      <div style={{ color: milestones.lay?.driverTime ? '#1677ff' : '#8c8c8c', marginTop: 3 }}>
                        👤 Tài xế xác nhận: <b>{milestones.lay?.driverTime ? milestones.lay.driverTime : '⏳ Chưa bấm xác nhận'}</b>
                      </div>
                    </div>
                  </Timeline.Item>

                  {/* Point 2: Delivery */}
                  <Timeline.Item
                    color={milestones.giao?.driverTime ? "green" : (milestones.giao?.reached ? "blue" : "gray")}
                    dot={milestones.giao?.driverTime ? <CheckCircleFilled style={{ color: '#52c41a', fontSize: 18 }} /> : (milestones.giao?.reached ? <ClockCircleOutlined style={{ color: simStep > 0 ? '#1677ff' : '#bfbfbf', fontSize: 16 }} /> : <ClockCircleOutlined style={{ color: '#bfbfbf', fontSize: 16 }} />)}
                  >
                    <div style={{ fontWeight: 700, color: (milestones.giao?.reached || milestones.giao?.driverTime) ? '#262626' : '#595959', fontSize: 13 }}>
                      2. Nơi Giao Hàng
                    </div>
                    <div style={{ color: '#fa8c16', fontWeight: 600, fontSize: 13, margin: '2px 0 4px 0' }}>
                      {activeMapOrder.diem_giao_hang || activeMapOrder.diemGiaoHang || 'KCN Long Hậu'}
                    </div>
                    <div style={{ background: (milestones.giao?.reached || milestones.giao?.driverTime) ? '#f6ffed' : '#fafafa', border: `1px solid ${(milestones.giao?.reached || milestones.giao?.driverTime) ? '#b7eb8f' : '#f0f0f0'}`, padding: '6px 10px', borderRadius: 6, fontSize: 12 }}>
                      <div style={{ color: milestones.giao?.reached ? '#389e0d' : '#8c8c8c' }}>
                        ⏰ Thời gian xe đến (GPS): <b>{milestones.giao?.time || '⏳ Chưa đến điểm (GPS)'}</b>
                      </div>
                      <div style={{ color: milestones.giao?.driverTime ? '#1677ff' : '#8c8c8c', marginTop: 3 }}>
                        👤 Tài xế xác nhận: <b>{milestones.giao?.driverTime ? milestones.giao.driverTime : '⏳ Chưa bấm xác nhận'}</b>
                      </div>
                    </div>
                  </Timeline.Item>

                  {/* Point 3: Return Empty */}
                  <Timeline.Item
                    color={milestones.tra?.driverTime ? "green" : (milestones.tra?.reached ? "blue" : "gray")}
                    dot={milestones.tra?.driverTime ? <CheckCircleFilled style={{ color: '#52c41a', fontSize: 18 }} /> : (milestones.tra?.reached ? <ClockCircleOutlined style={{ color: '#1677ff', fontSize: 16 }} /> : <ClockCircleOutlined style={{ color: '#bfbfbf', fontSize: 16 }} />)}
                  >
                    <div style={{ fontWeight: 700, color: (milestones.tra?.reached || milestones.tra?.driverTime) ? '#262626' : '#595959', fontSize: 13 }}>
                      3. Nơi Hạ Cont / Trả Rỗng
                    </div>
                    <div style={{ color: '#52c41a', fontWeight: 600, fontSize: 13, margin: '2px 0 4px 0' }}>
                      {activeMapOrder.diem_tra_rong || activeMapOrder.diemTraRong || 'Depot Cát Lái'}
                    </div>
                    <div style={{ background: (milestones.tra?.reached || milestones.tra?.driverTime) ? '#f6ffed' : '#fafafa', border: `1px solid ${(milestones.tra?.reached || milestones.tra?.driverTime) ? '#b7eb8f' : '#f0f0f0'}`, padding: '6px 10px', borderRadius: 6, fontSize: 12 }}>
                      <div style={{ color: milestones.tra?.reached ? '#389e0d' : '#8c8c8c' }}>
                        ⏰ Thời gian xe đến (GPS): <b>{milestones.tra?.time || '⏳ Chưa đến điểm (GPS)'}</b>
                      </div>
                      <div style={{ color: milestones.tra?.driverTime ? '#1677ff' : '#8c8c8c', marginTop: 3 }}>
                        👤 Tài xế xác nhận: <b>{milestones.tra?.driverTime ? milestones.tra.driverTime : '⏳ Chưa bấm xác nhận'}</b>
                      </div>
                    </div>
                  </Timeline.Item>
                </Timeline>
              </>
            )}
          </Col>

          {/* Right Column: Map & Live GPS Controls */}
          <Col xs={24} md={15} style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Action Bar */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' }}>
              <Space size="middle">
                <span style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CompassOutlined style={{ color: '#1677ff', fontSize: 18 }} /> Giả Lập Định Vị GPS
                </span>
                {activeMapOrder && <Tag color="blue" style={{ fontSize: 13, padding: '2px 8px' }}>{activeMapOrder.so_bien_nhan || activeMapOrder.soBienNhan}</Tag>}
              </Space>

              <Space size="small">
                {isSimulating ? (
                  <Button 
                    type="primary" 
                    danger 
                    icon={<PauseCircleOutlined />} 
                    onClick={() => setIsSimulating(false)}
                  >
                    Tạm dừng GPS
                  </Button>
                ) : (
                  <Button 
                    type="primary" 
                    icon={<PlayCircleOutlined />} 
                    style={{ background: '#52c41a', borderColor: '#52c41a', fontWeight: 600 }}
                    onClick={async () => {
                      if (simStep >= 100) setSimStep(0);
                      setIsSimulating(true);

                      if (activeMapOrder && (activeMapOrder.trang_thai === 'chua_hoan_thanh' || activeMapOrder.trangThai === 'chua_hoan_thanh' || activeMapOrder.trang_thai === 'chua_bat_dau' || activeMapOrder.trangThai === 'chua_bat_dau')) {
                        try {
                          await API.updateOrder(activeMapOrder.id, {
                            ...activeMapOrder,
                            soBienNhan: activeMapOrder.so_bien_nhan || activeMapOrder.soBienNhan,
                            ngayTao: activeMapOrder.ngay_tao || activeMapOrder.ngayTao,
                            saleId: activeMapOrder.sale_id || activeMapOrder.saleId,
                            dieuVanId: activeMapOrder.dieu_van_id || activeMapOrder.dieuVanId,
                            taiXeId: activeMapOrder.tai_xe_id || activeMapOrder.taiXeId,
                            vehicleId: activeMapOrder.vehicle_id || activeMapOrder.vehicleId,
                            trangThai: 'dang_thuc_hien',
                            ghiChu: activeMapOrder.ghi_chu || activeMapOrder.ghiChu || ''
                          });
                          fetchData();
                        } catch (e) {
                          console.error(e);
                        }
                      }
                    }}
                  >
                    {simStep >= 100 ? 'Chạy lại GPS' : 'Bật Định vị GPS (Giả lập)'}
                  </Button>
                )}
                <Button 
                  icon={<RedoOutlined />} 
                  onClick={() => {
                    setIsSimulating(false);
                    setSimStep(0);
                    const resetM = { lay: { reached: false, time: null, driverTime: null }, giao: { reached: false, time: null, driverTime: null }, tra: { reached: false, time: null, driverTime: null } };
                    setMilestones(resetM);
                    if (activeMapOrder?.id) {
                      localStorage.removeItem(`vm_gps_milestones_${activeMapOrder.id}`);
                    }
                  }}
                >
                  Reset
                </Button>
                <Select 
                  value={simSpeed} 
                  onChange={setSimSpeed}
                  size="middle"
                  style={{ width: 75 }}
                  options={[
                    { value: 1, label: '1x' },
                    { value: 2, label: '2x' },
                    { value: 5, label: '5x' },
                  ]}
                />
              </Space>
            </div>

            {/* Telemetry Progress Header */}
            <div style={{ background: '#fafafa', padding: '10px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, marginRight: 20 }}>
                <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>Tiến độ GPS:</Text>
                <Progress percent={simStep} status={simStep === 100 ? "success" : "active"} strokeColor={{ '0%': '#1677ff', '100%': '#52c41a' }} style={{ margin: 0 }} />
              </div>
              <Tag color={isSimulating ? "green" : "default"} style={{ margin: 0, fontWeight: 600 }}>
                {isSimulating ? `🟢 GPS Live (${45 * simSpeed} km/h)` : "⚪ GPS Tắt"}
              </Tag>
            </div>

            {/* Map Container Wrapper */}
            <div style={{ flex: 1, minHeight: 440, width: '100%', position: 'relative', background: '#e5e3df', borderBottomRightRadius: 8 }}>
              {/* Top Left: Map Mode Toggle (Bản đồ / Vệ tinh) */}
              <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 1000, background: '#ffffff', padding: 4, borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.18)', display: 'flex', gap: 4 }}>
                <Button 
                  size="small" 
                  type={mapType === 'roadmap' ? 'primary' : 'default'}
                  onClick={() => setMapType('roadmap')}
                  style={{ fontSize: 12, fontWeight: mapType === 'roadmap' ? 600 : 400 }}
                >
                  Bản đồ
                </Button>
                <Button 
                  size="small" 
                  type={mapType === 'satellite' ? 'primary' : 'default'}
                  onClick={() => setMapType('satellite')}
                  style={{ fontSize: 12, fontWeight: mapType === 'satellite' ? 600 : 400 }}
                >
                  Vệ tinh
                </Button>
              </div>

              {/* Top Right: Status Legend matching user screenshot */}
              <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 1000, background: 'rgba(255, 255, 255, 0.95)', padding: '10px 14px', borderRadius: 8, boxShadow: '0 2px 12px rgba(0,0,0,0.18)', fontSize: 12, border: '1px solid #f0f0f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#8c8c8c', display: 'inline-block' }}></span>
                  <span style={{ color: '#595959', fontWeight: 500 }}>Chưa thực hiện</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#1677ff', display: 'inline-block' }}></span>
                  <span style={{ color: '#1677ff', fontWeight: 600 }}>Đang thực hiện</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#52c41a', display: 'inline-block' }}></span>
                  <span style={{ color: '#389e0d', fontWeight: 600 }}>Hoàn thành</span>
                </div>
              </div>

              {/* Leaflet Map Subcomponent */}
              {trackingModalOpen && activeMapOrder && (
                <DispatchTrackingMap 
                  activeMapOrder={activeMapOrder}
                  milestones={milestones}
                  simStep={simStep}
                  isSimulating={isSimulating}
                  simSpeed={simSpeed}
                  mapType={mapType}
                />
              )}
            </div>
          </Col>
        </Row>
      </Modal>

      <Modal
        title="Cập nhật điều phối chuyến hàng"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSaveDispatch}
        okText="Lưu điều phối"
        cancelText="Hủy"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="taiXeId" label="Tài xế lái xe *" rules={[{ required: true, message: 'Chọn tài xế' }]}>
            <Select
              showSearch
              placeholder="Chọn tài xế khả dụng..."
              filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
              onChange={(val) => {
                const driverObj = drivers.find(d => d.id === val);
                if (driverObj) {
                  const patch = {};
                  if (driverObj.default_vehicle_id || driverObj.defaultVehicleId) {
                    patch.vehicleId = driverObj.default_vehicle_id || driverObj.defaultVehicleId;
                  }
                  if (driverObj.email) {
                    patch.emailTaiXe = driverObj.email;
                  }
                  form.setFieldsValue(patch);
                }
              }}
              options={availableDrivers.map(d => ({
                value: d.id,
                label: `${d.name} (${d.phone || 'SĐT —'})`
              }))}
            />
          </Form.Item>
          <Form.Item name="emailTaiXe" label="Email nhận lệnh tài xế">
            <Input placeholder="Nhập email tài xế..." prefix={<MailOutlined style={{ color: '#1677ff' }} />} />
          </Form.Item>
          <Form.Item name="vehicleId" label="Xe & Mooc phụ trách *" rules={[{ required: true, message: 'Chọn xe' }]}>
            <Select
              showSearch
              placeholder="Chọn xe..."
              filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
              options={vehicles.map(v => ({
                value: v.id,
                label: `${v.bienSo || v.bien_so} - Mooc: ${v.soMooc || v.so_mooc || 'Không mooc'}`
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

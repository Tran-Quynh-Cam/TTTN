import React, { useState, useEffect } from 'react';
import { Card, Typography, Select, Button, Tag, Steps, Badge, message, Alert, Divider, List, Avatar, Input, Upload, Modal } from 'antd';
import { 
  CarOutlined, CheckCircleOutlined, UserOutlined, ClockCircleOutlined, 
  ArrowRightOutlined, EnvironmentOutlined, DownloadOutlined, LogoutOutlined, 
  PlayCircleOutlined, CheckOutlined, LoadingOutlined, PhoneOutlined, MailOutlined,
  UploadOutlined, FileImageOutlined, FileTextOutlined, EyeOutlined, PlusOutlined, PaperClipOutlined
} from '@ant-design/icons';
import API from '../services/api';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;

const STATUS_COLOR = { 
  chua_bat_dau: 'default', 
  dang_thuc_hien: 'processing', 
  hoan_thanh: 'success', 
  tre_chuyen: 'error' 
};

const STATUS_LABEL = { 
  chua_bat_dau: 'Chưa bắt đầu', 
  dang_thuc_hien: 'Đang thực hiện', 
  hoan_thanh: 'Hoàn thành', 
  tre_chuyen: 'Trễ chuyến' 
};

const maskValue = (val, type) => {
  if (!val) return '';
  const str = val.toString().trim();
  if (str.length <= 4) return '***';
  if (type === 'phone') {
    return str.slice(0, 3) + '****' + str.slice(-3);
  } else {
    return str.slice(0, 2) + '****' + str.slice(-2);
  }
};

export default function DriverPortal() {
  // PWA installation state
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstallable, setIsInstallable] = useState(false);
  
  // Driver identification state
  const [driver, setDriver] = useState(null);
  const [driversList, setDriversList] = useState([]);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  
  // Orders state
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [authCode, setAuthCode] = useState('');

  // Documents state for driver
  const [orderDocs, setOrderDocs] = useState([]);
  const [docType, setDocType] = useState('Biên nhận giao hàng (POD)');
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);

  // Local storage keys
  const DRIVER_STORAGE_KEY = 'fleetos_driver_profile';
  const PROGRESS_STORAGE_KEY = 'fleetos_order_progress_v1';

  const fetchOrderDocs = async () => {
    if (!selectedOrder) return;
    const orderCode = selectedOrder.soBienNhan || selectedOrder.so_bien_nhan;
    if (!orderCode) return;

    try {
      let apiDocs = [];
      try {
        const res = await API.getDocuments();
        apiDocs = res.data || [];
      } catch (e) {}

      let localDocs = [];
      try {
        const saved = localStorage.getItem('vm_documents');
        if (saved) localDocs = JSON.parse(saved);
      } catch (e) {}

      const combined = [...apiDocs, ...localDocs];
      const uniqueDocs = [];
      const seen = new Set();
      for (const d of combined) {
        const key = d.id || `${d.maChungTu}_${d.tenFile}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueDocs.push(d);
        }
      }

      const currentDocs = uniqueDocs.filter(d => {
        const docOrder = String(d.donHang || d.don_hang || '').trim();
        return docOrder && docOrder.toLowerCase() === orderCode.toLowerCase();
      });

      setOrderDocs(currentDocs);
    } catch (err) {
      console.error('Lỗi tải chứng từ đơn hàng:', err);
    }
  };

  useEffect(() => {
    if (selectedOrder) {
      fetchOrderDocs();
    }
  }, [selectedOrder]);

  const handleDriverFileUpload = async (file) => {
    if (!selectedOrder) return false;
    const orderCode = selectedOrder.soBienNhan || selectedOrder.so_bien_nhan;
    setUploadingDoc(true);

    try {
      const base64Data = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
      });

      const newDocPayload = {
        maChungTu: `CT-${Date.now()}`,
        tenChungTu: docType || 'Biên nhận giao hàng (POD)',
        tenFile: file.name,
        soChungTu: `POD-${Date.now().toString().slice(-6)}`,
        donHang: orderCode,
        fileUrl: base64Data,
        trangThai: 'hop_le'
      };

      try {
        await API.createDocument(newDocPayload);
      } catch (apiErr) {
        console.warn('Backend API createDocument warning:', apiErr);
      }

      try {
        const saved = localStorage.getItem('vm_documents');
        const parsed = saved ? JSON.parse(saved) : [];
        parsed.unshift({ ...newDocPayload, id: Date.now() });
        localStorage.setItem('vm_documents', JSON.stringify(parsed));
      } catch (e) {}

      message.success(`Đã tải lên chứng từ ${file.name} cho đơn ${orderCode}!`);
      fetchOrderDocs();
    } catch (err) {
      console.error('Lỗi upload file tài xế:', err);
      message.error('Lỗi khi tải lên file chứng từ');
    } finally {
      setUploadingDoc(false);
    }
    return false;
  };

  // 1. Detect PWA installation capability
  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstallable(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  // 2. Load Driver Profile from LocalStorage & fetch list
  useEffect(() => {
    const saved = localStorage.getItem(DRIVER_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      setDriver(parsed);
      setSelectedDriverId(parsed.id);
    }
    fetchDrivers();
  }, []);

  // 3. Fetch orders when driver changes
  useEffect(() => {
    if (driver) {
      fetchDriverOrders();
    }
  }, [driver]);

  const fetchDrivers = async () => {
    setLoadingDrivers(true);
    try {
      const res = await API.getStakeholders('drivers');
      setDriversList(res.data || []);
    } catch (err) {
      console.error('Lỗi tải danh sách tài xế:', err);
    } finally {
      setLoadingDrivers(false);
    }
  };

  const fetchDriverOrders = async () => {
    if (!driver) return;
    setLoadingOrders(true);
    try {
      const res = await API.getOrders();
      // Lọc các đơn của tài xế hiện tại
      const driverOrders = (res.data || []).filter(o => 
        o.taiXeId === driver.id || o.tai_xe_id === driver.id
      );
      setOrders(driverOrders);
      
      // Cập nhật lại đơn đang xem chi tiết nếu có
      if (selectedOrder) {
        const updated = driverOrders.find(o => o.id === selectedOrder.id);
        if (updated) setSelectedOrder(updated);
      }
    } catch (err) {
      message.error('Lỗi kết nối máy chủ để tải đơn hàng');
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleSelectDriver = async () => {
    const activeDrv = driversList.find(d => d.id === selectedDriverId);
    if (!activeDrv) {
      message.warning('Vui lòng chọn tài xế');
      return;
    }
    
    try {
      const res = await API.post('/driver/login', { driverId: selectedDriverId, authCode });
      const { token, driver } = res.data;
      
      localStorage.setItem('vm_token', token);
      localStorage.setItem(DRIVER_STORAGE_KEY, JSON.stringify(driver));
      setDriver(driver);
      setAuthCode('');
      message.success(`Xác thực thành công! Chào mừng tài xế ${driver.name}.`);
    } catch (err) {
      console.error(err);
      message.error(err.response?.data?.message || 'Thông tin xác thực (Số điện thoại hoặc Số bằng lái) không chính xác!');
    }
  };

  const handleLogoutDriver = () => {
    localStorage.removeItem(DRIVER_STORAGE_KEY);
    localStorage.removeItem('vm_token');
    setDriver(null);
    setSelectedOrder(null);
    setOrders([]);
  };

  const handleInstallPWA = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      message.success('Cảm ơn bạn đã cài đặt ứng dụng FleetOS!');
      setIsInstallable(false);
    }
    setDeferredPrompt(null);
  };

  // Xác nhận nhận đơn và bắt đầu đi
  const handleStartOrder = async (order) => {
    try {
      const payload = {
        ...order,
        trangThai: 'dang_thuc_hien'
      };
      await API.updateOrder(order.id, payload);
      message.success('Đã nhận đơn! Bắt đầu chuyến hành trình.');
      fetchDriverOrders();
    } catch (err) {
      message.error('Không thể cập nhật trạng thái đơn hàng');
    }
  };

  // Lấy danh sách cột mốc / mốc hành trình lưu tại local hoặc db
  const getOrderProgress = (orderId) => {
    const savedProgress = localStorage.getItem(PROGRESS_STORAGE_KEY);
    const parsed = savedProgress ? JSON.parse(savedProgress) : {};
    return parsed[orderId] || { step1: false, step2: false, step3: false };
  };

  const updateOrderProgress = async (order, stepKey, val) => {
    const savedProgress = localStorage.getItem(PROGRESS_STORAGE_KEY);
    const parsed = savedProgress ? JSON.parse(savedProgress) : {};
    const currentProgress = parsed[order.id] || { step1: false, step2: false, step3: false };
    
    // Strict Milestone Sequence Validation (Ràng buộc trình tự các trạm)
    if (stepKey === 'step2' && val === true && !currentProgress.step1) {
      message.warning('Bạn cần phải hoàn thành TRẠM 1: Lấy vỏ/hàng trước!');
      return;
    }
    if (stepKey === 'step3' && val === true && !currentProgress.step2) {
      message.warning('Bạn cần phải hoàn thành TRẠM 2: Giao vỏ/hàng trước!');
      return;
    }
    if (stepKey === 'step1' && val === false && currentProgress.step2) {
      message.warning('Không thể hủy TRẠM 1 khi TRẠM 2 đã được xác nhận!');
      return;
    }
    if (stepKey === 'step2' && val === false && currentProgress.step3) {
      message.warning('Không thể hủy TRẠM 2 khi TRẠM 3 đã được xác nhận!');
      return;
    }

    const nowStr = dayjs().format('HH:mm:ss DD/MM/YYYY');
    currentProgress[stepKey] = val;
    currentProgress[`${stepKey}_time`] = val ? nowStr : null;
    parsed[order.id] = currentProgress;
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(parsed));

    // Đồng bộ với Dispatch milestones
    try {
      const milestoneMapKey = stepKey === 'step1' ? 'lay' : (stepKey === 'step2' ? 'giao' : 'tra');
      const savedM = localStorage.getItem(`vm_gps_milestones_${order.id}`);
      const m = savedM ? JSON.parse(savedM) : { lay: { reached: false, time: null, driverTime: null }, giao: { reached: false, time: null, driverTime: null }, tra: { reached: false, time: null, driverTime: null } };
      m[milestoneMapKey] = {
        ...(m[milestoneMapKey] || {}),
        driverTime: val ? nowStr : null
      };
      localStorage.setItem(`vm_gps_milestones_${order.id}`, JSON.stringify(m));
    } catch (e) {}

    // Nếu bước cuối cùng hoàn thành, chuyển trạng thái đơn hàng thành hoàn thành
    if (stepKey === 'step3' && val === true) {
      try {
        await API.updateOrder(order.id, { ...order, trangThai: 'hoan_thanh' });
        message.success('Tuyệt vời! Bạn đã hoàn thành toàn bộ hành trình đơn hàng.');
      } catch (err) {
        console.error(err);
        message.error('Lỗi khi cập nhật trạng thái hoàn thành đơn hàng');
      }
    } else if (stepKey === 'step3' && val === false) {
      // Nếu hủy bước 3, cập nhật lại trạng thái đơn hàng thành đang thực hiện
      try {
        await API.updateOrder(order.id, { ...order, trangThai: 'dang_thuc_hien' });
        message.success('Đã hủy hoàn thành trạm. Trạng thái chuyển về Đang thực hiện.');
      } catch (err) {
        console.error(err);
        message.error('Lỗi khi cập nhật trạng thái đơn hàng');
      }
    } else {
      message.success(`Đã ghi nhận tài xế xác nhận trạm lúc ${nowStr}!`);
    }
    fetchDriverOrders();
  };

  // Giao diện chọn tài xế ban đầu
  if (!driver) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column', 
        justifyContent: 'center', alignItems: 'center', padding: 20,
        background: 'linear-gradient(135deg, #eef2f7 0%, #e2e8f0 100%)',
        color: '#1e293b'
      }}>
        {isInstallable && (
          <Card style={{ 
            width: '100%', maxWidth: 420, marginBottom: 20, borderRadius: 16,
            background: '#ffffff', border: '1px solid #cbd5e1',
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
          }} bodyStyle={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <Text strong style={{ color: '#0f172a', fontSize: 14 }}>Thêm FleetOS vào màn hình chính</Text>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Cài đặt ứng dụng PWA để thao tác mượt mà hơn</div>
              </div>
              <Button type="primary" size="small" icon={<DownloadOutlined />} onClick={handleInstallPWA}>Cài đặt</Button>
            </div>
          </Card>
        )}

        <Card style={{ 
          width: '100%', maxWidth: 420, borderRadius: 20, 
          background: '#ffffff', border: '1px solid #e2e8f0',
          boxShadow: '0 20px 40px rgba(15, 23, 42, 0.08)'
        }} bodyStyle={{ padding: '36px 28px' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ 
              width: 56, height: 56, borderRadius: 16, 
              background: 'linear-gradient(135deg, #1677ff, #0958d9)', 
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 16, boxShadow: '0 8px 16px rgba(22, 119, 255, 0.25)'
            }}>
              <CarOutlined style={{ fontSize: 28, color: '#fff' }} />
            </div>
            <Title level={3} style={{ margin: 0, color: '#0f172a', fontWeight: 800, letterSpacing: '-0.5px' }}>FleetOS Tài Xế</Title>
            <Text style={{ color: '#64748b', fontSize: 13, marginTop: 4, display: 'block' }}>Cổng thông tin và xác nhận hành trình vận chuyển</Text>
          </div>

          <FormSpace>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 14, color: '#1e293b', marginBottom: 8, fontWeight: 600 }}>Chọn tên tài xế:</label>
              <Select
                showSearch
                size="large"
                style={{ width: '100%' }}
                placeholder="Tìm theo tên, SĐT hoặc Số bằng lái..."
                loading={loadingDrivers}
                value={selectedDriverId}
                onChange={setSelectedDriverId}
                optionFilterProp="label"
                filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                options={driversList.map(d => ({
                  value: d.id,
                  label: `${d.name} (${d.phone ? maskValue(d.phone, 'phone') : d.license_no ? maskValue(d.license_no, 'license') : 'SĐT: Trống'})`
                }))}
                dropdownStyle={{ borderRadius: 12 }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 14, color: '#1e293b', marginBottom: 8, fontWeight: 600 }}>Số điện thoại hoặc Số bằng lái xe:</label>
              <Input
                size="large"
                placeholder="Nhập SĐT hoặc Số bằng lái để xác nhận..."
                value={authCode}
                onChange={e => setAuthCode(e.target.value)}
                style={{ 
                  borderRadius: 10, 
                  height: 44,
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  color: '#0f172a',
                  fontWeight: 500
                }}
              />
            </div>

            <Button 
              type="primary" 
              block 
              size="large" 
              icon={<CheckCircleOutlined />}
              onClick={handleSelectDriver}
              style={{ borderRadius: 12, height: 48, fontWeight: 700, fontSize: 15, background: 'linear-gradient(135deg, #1677ff, #0958d9)', border: 'none', boxShadow: '0 6px 16px rgba(22,119,255,0.3)' }}
            >
              Xác nhận thông tin
            </Button>
          </FormSpace>
        </Card>
      </div>
    );
  }

  // Giao diện chính sau khi chọn tài xế
  return (
    <div style={{ 
      minHeight: '100vh', background: '#f5f7fa', 
      paddingBottom: selectedOrder ? 0 : 40, 
      display: 'flex', flexDirection: 'column' 
    }}>
      {/* Header */}
      <div style={{ 
        background: '#0A1628', color: '#fff', padding: '16px 20px', 
        position: 'sticky', top: 0, zIndex: 10, 
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar style={{ background: '#1677ff', fontWeight: 600 }}>
            {driver.name.charAt(0).toUpperCase()}
          </Avatar>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{driver.name}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Tài xế chuyên nghiệp</div>
          </div>
        </div>
        <Button 
          type="text" 
          icon={<LogoutOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />} 
          onClick={handleLogoutDriver}
          style={{ padding: '4px 8px', color: '#ff4d4f', display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,77,79,0.1)', borderRadius: 6 }}
        >
          <span style={{ fontSize: 13, fontWeight: 500 }}>Đăng xuất</span>
        </Button>
      </div>

      {/* PWA Banner if in browser and installable */}
      {isInstallable && (
        <div style={{ 
          background: 'linear-gradient(90deg, #1677ff, #0958d9)', 
          color: '#fff', padding: '10px 20px', 
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 13
        }}>
          <span>Cài ứng dụng về điện thoại để xem nhanh!</span>
          <Button size="small" type="primary" style={{ background: '#fff', color: '#1677ff', border: 'none', fontWeight: 600 }} onClick={handleInstallPWA}>Cài đặt</Button>
        </div>
      )}

      {/* Main Body */}
      <div style={{ flex: 1, padding: 16, maxWidth: 500, width: '100%', margin: '0 auto' }}>
        
        {!selectedOrder ? (
          <>
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text strong style={{ fontSize: 15, color: '#262626' }}>
                Đơn hàng được phân công ({orders.length})
              </Text>
              <Button type="link" onClick={fetchDriverOrders} style={{ padding: 0 }}>Làm mới</Button>
            </div>

            {loadingOrders ? (
              <div style={{ textAlign: 'center', marginTop: 40 }}>
                <LoadingOutlined style={{ fontSize: 24, color: '#1677ff' }} spin />
                <div style={{ marginTop: 10, color: '#8c8c8c' }}>Đang tải đơn hàng...</div>
              </div>
            ) : orders.length === 0 ? (
              <Card style={{ borderRadius: 16, textAlign: 'center', padding: '32px 16px', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: 40, color: '#bfbfbf', marginBottom: 12 }}><CarOutlined /></div>
                <Text strong style={{ color: '#595959', display: 'block' }}>Không có đơn hàng nào</Text>
                <Text type="secondary" style={{ fontSize: 13 }}>Bạn hiện không được phân công đơn hàng nào trên hệ thống.</Text>
              </Card>
            ) : (
              <List
                dataSource={orders}
                renderItem={item => {
                  const progress = getOrderProgress(item.id);
                  let completedStops = 0;
                  if (progress.step1) completedStops++;
                  if (progress.step2) completedStops++;
                  if (progress.step3) completedStops++;
                  
                  return (
                    <Card 
                      hoverable 
                      style={{ 
                        borderRadius: 16, marginBottom: 12, border: 'none', 
                        boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                        overflow: 'hidden'
                      }}
                      bodyStyle={{ padding: 16 }}
                      onClick={() => setSelectedOrder(item)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <Text strong style={{ fontFamily: 'monospace', color: '#1677ff', fontSize: 14 }}>
                          {item.soBienNhan || item.so_bien_nhan}
                        </Text>
                        <Tag color={STATUS_COLOR[item.trangThai || item.trang_thai]}>
                          {STATUS_LABEL[item.trangThai || item.trang_thai]}
                        </Tag>
                      </div>

                      <div style={{ fontSize: 13, color: '#595959', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div>
                          <Badge status="processing" style={{ marginRight: 6 }} />
                          <Text type="secondary">Lấy hàng: </Text>
                          <Text strong>{item.diemLayHang || item.diem_lay_hang}</Text>
                        </div>
                        <div>
                          <Badge status="warning" style={{ marginRight: 6 }} />
                          <Text type="secondary">Giao hàng: </Text>
                          <Text strong>{item.diemGiaoHang || item.diem_giao_hang}</Text>
                        </div>
                      </div>

                      <Divider style={{ margin: '12px 0' }} />

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                        <span style={{ color: '#8c8c8c' }}>
                          Mẫu xe: {item.bienSo || '—'} ({item.loaiCont})
                        </span>
                        <span style={{ color: '#52c41a', fontWeight: 600 }}>
                          {item.trangThai === 'hoan_thanh' ? 'Đã hoàn thành' : `${completedStops}/3 trạm`}
                        </span>
                      </div>
                    </Card>
                  );
                }}
              />
            )}
          </>
        ) : (
          /* Chi tiết đơn hàng cho tài xế */
          <div style={{ animation: 'fadeIn 0.2s ease' }}>
            <Button 
              type="link" 
              onClick={() => setSelectedOrder(null)} 
              style={{ padding: 0, marginBottom: 16, color: '#8c8c8c' }}
            >
              ← Quay lại danh sách
            </Button>

            <Card style={{ borderRadius: 16, border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.04)', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Title level={4} style={{ margin: 0, fontFamily: 'monospace', color: '#1677ff' }}>
                  {selectedOrder.soBienNhan}
                </Title>
                <Tag color={STATUS_COLOR[selectedOrder.trangThai]}>
                  {STATUS_LABEL[selectedOrder.trangThai]}
                </Tag>
              </div>

              <div style={{ fontSize: 13, color: '#595959', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                <div><Text type="secondary">Loại container: </Text><Text strong>{selectedOrder.loaiCont}</Text></div>
                <div><Text type="secondary">Biển kiểm soát: </Text><Text strong>{selectedOrder.bienSo || 'Chưa nhận xe'}</Text></div>
                {selectedOrder.phone && (
                  <div><Text type="secondary">Liên hệ: </Text><a href={`tel:${selectedOrder.phone}`}><PhoneOutlined /> {selectedOrder.phone}</a></div>
                )}
              </div>

              <Divider style={{ margin: '12px 0' }} />

              {/* Tiến độ chi tiết */}
              <Title level={5} style={{ fontSize: 14, color: '#262626', marginBottom: 16 }}>
                Lộ trình chi tiết & Xác nhận trạm
              </Title>

              {selectedOrder.trangThai === 'chua_bat_dau' ? (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <Alert 
                    message="Đơn hàng chưa bắt đầu" 
                    description="Vui lòng bấm nút phía dưới để xác nhận nhận đơn hàng và chuẩn bị xuất phát."
                    type="info" 
                    showIcon
                    style={{ borderRadius: 12, marginBottom: 20, textAlign: 'left' }}
                  />
                  <Button 
                    type="primary" 
                    icon={<PlayCircleOutlined />}
                    size="large"
                    block
                    onClick={() => handleStartOrder(selectedOrder)}
                    style={{ background: '#52c41a', borderColor: '#52c41a', height: 48, borderRadius: 12, fontWeight: 600 }}
                  >
                    Xác nhận & Bắt đầu đi
                  </Button>
                </div>
              ) : (
                /* Checklist mốc hành trình */
                <div>
                  {(() => {
                    const prog = getOrderProgress(selectedOrder.id);
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        
                        {/* Trạm 1 */}
                        <div style={{ 
                          padding: 12, borderRadius: 12, 
                          background: prog.step1 ? '#f6ffed' : '#ffffff', 
                          border: prog.step1 ? '1px solid #b7eb8f' : '1px solid #f0f0f0',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}>
                          <div style={{ flex: 1, marginRight: 8 }}>
                            <div style={{ fontSize: 11, color: '#8c8c8c' }}>TRẠM 1: LẤY VỎ/HÀNG</div>
                            <div style={{ fontWeight: 600, color: '#262626' }}>{selectedOrder.diemLayHang}</div>
                            {prog.step1_time && <div style={{ fontSize: 11, color: '#52c41a', marginTop: 2 }}>⏰ Đã xác nhận: <b>{prog.step1_time}</b></div>}
                          </div>
                          <Button 
                            type={prog.step1 ? 'primary' : 'default'}
                            icon={prog.step1 ? <CheckOutlined /> : null}
                            onClick={() => updateOrderProgress(selectedOrder, 'step1', !prog.step1)}
                            style={{ 
                              background: prog.step1 ? '#52c41a' : '#fff',
                              borderColor: prog.step1 ? '#52c41a' : '#d9d9d9',
                              color: prog.step1 ? '#fff' : '#595959',
                              borderRadius: 8
                            }}
                          >
                            {prog.step1 ? 'Đã lấy' : 'Xác nhận'}
                          </Button>
                        </div>

                        {/* Trạm 2 */}
                        <div style={{ 
                          padding: 12, borderRadius: 12, 
                          background: prog.step2 ? '#f6ffed' : '#ffffff', 
                          border: prog.step2 ? '1px solid #b7eb8f' : '1px solid #f0f0f0',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          opacity: prog.step1 ? 1 : 0.5,
                          pointerEvents: prog.step1 ? 'auto' : 'none'
                        }}>
                          <div style={{ flex: 1, marginRight: 8 }}>
                            <div style={{ fontSize: 11, color: '#8c8c8c' }}>TRẠM 2: GIAO VỎ/HÀNG</div>
                            <div style={{ fontWeight: 600, color: '#262626' }}>{selectedOrder.diemGiaoHang}</div>
                            {prog.step2_time && <div style={{ fontSize: 11, color: '#52c41a', marginTop: 2 }}>⏰ Đã xác nhận: <b>{prog.step2_time}</b></div>}
                          </div>
                          <Button 
                            type={prog.step2 ? 'primary' : 'default'}
                            icon={prog.step2 ? <CheckOutlined /> : null}
                            disabled={!prog.step1}
                            onClick={() => updateOrderProgress(selectedOrder, 'step2', !prog.step2)}
                            style={{ 
                              background: prog.step2 ? '#52c41a' : '#fff',
                              borderColor: prog.step2 ? '#52c41a' : '#d9d9d9',
                              color: prog.step2 ? '#fff' : '#595959',
                              borderRadius: 8
                            }}
                          >
                            {prog.step2 ? 'Đã giao' : 'Xác nhận'}
                          </Button>
                        </div>

                        {/* Trạm 3 */}
                        <div style={{ 
                          padding: 12, borderRadius: 12, 
                          background: prog.step3 ? '#f6ffed' : '#ffffff', 
                          border: prog.step3 ? '1px solid #b7eb8f' : '1px solid #f0f0f0',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          opacity: prog.step2 ? 1 : 0.5,
                          pointerEvents: prog.step2 ? 'auto' : 'none'
                        }}>
                          <div style={{ flex: 1, marginRight: 8 }}>
                            <div style={{ fontSize: 11, color: '#8c8c8c' }}>TRẠM 3: HẠ HÀNG/VỎ</div>
                            <div style={{ fontWeight: 600, color: '#262626' }}>{selectedOrder.diemTraRong || selectedOrder.diemNhanRong || 'Cảng hạ'}</div>
                            {prog.step3_time && <div style={{ fontSize: 11, color: '#52c41a', marginTop: 2 }}>⏰ Đã xác nhận: <b>{prog.step3_time}</b></div>}
                          </div>
                          <Button 
                            type={prog.step3 ? 'primary' : 'default'}
                            icon={prog.step3 ? <CheckOutlined /> : null}
                            disabled={!prog.step2}
                            onClick={() => updateOrderProgress(selectedOrder, 'step3', !prog.step3)}
                            style={{ 
                              background: prog.step3 ? '#52c41a' : '#fff',
                              borderColor: prog.step3 ? '#52c41a' : '#d9d9d9',
                              color: prog.step3 ? '#fff' : '#595959',
                              borderRadius: 8
                            }}
                          >
                            {prog.step3 ? 'Hoàn thành' : 'Xác nhận'}
                          </Button>
                        </div>

                      </div>
                    );
                  })()}
                </div>
              )}
            </Card>

            {/* Thẻ Upload Chứng Từ / Ảnh dành cho Tài Xế */}
            <Card style={{ borderRadius: 16, border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.04)', marginBottom: 16 }}>
              <Title level={5} style={{ fontSize: 14, color: '#262626', marginBottom: 6 }}>
                📸 Tải lên ảnh / chứng từ thực tế chuyến đi
              </Title>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 14 }}>
                Ảnh & chứng từ được tải lên sẽ lưu trữ trực tiếp vào hồ sơ chứng từ của đơn hàng <b style={{ color: '#1677ff' }}>{selectedOrder.soBienNhan}</b>.
              </Text>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#595959', fontWeight: 600, marginBottom: 4, display: 'block' }}>Loại giấy tờ / chứng từ:</label>
                  <Select
                    value={docType}
                    onChange={setDocType}
                    style={{ width: '100%' }}
                    options={[
                      { value: 'Biên nhận giao hàng (POD)', label: '📄 Biên nhận giao hàng (POD)' },
                      { value: 'Phiếu EIR', label: '⚓ Phiếu EIR (Giao nhận container)' },
                      { value: 'Phiếu cân (VGM)', label: '⚖️ Phiếu cân (VGM)' },
                      { value: 'Ảnh container / Hàng hóa', label: '📷 Ảnh container / Hàng hóa' },
                      { value: 'Giấy ra vào cổng', label: '🎟️ Giấy ra vào cổng' },
                      { value: 'Hóa đơn / Receipt', label: '🧾 Hóa đơn / Chứng từ khác' },
                    ]}
                  />
                </div>

                <Upload
                  beforeUpload={handleDriverFileUpload}
                  showUploadList={false}
                  accept="image/*,.pdf,.doc,.docx"
                >
                  <Button 
                    type="primary" 
                    icon={<UploadOutlined />} 
                    loading={uploadingDoc}
                    block
                    style={{ height: 44, borderRadius: 10, background: '#1677ff', fontWeight: 600 }}
                  >
                    {uploadingDoc ? 'Đang tải lên...' : 'Chụp ảnh / Chọn file chứng từ'}
                  </Button>
                </Upload>
              </div>

              {orderDocs.length > 0 && (
                <div>
                  <Divider style={{ margin: '12px 0' }} />
                  <Text strong style={{ fontSize: 12, color: '#595959', marginBottom: 8, display: 'block' }}>
                    Chứng từ đã đính kèm ({orderDocs.length}):
                  </Text>
                  <List
                    size="small"
                    dataSource={orderDocs}
                    renderItem={doc => (
                      <List.Item
                        style={{ padding: '8px 0' }}
                        actions={[
                          doc.fileUrl ? (
                            <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => setPreviewDoc(doc)}>Xem</Button>
                          ) : null
                        ].filter(Boolean)}
                      >
                        <List.Item.Meta
                          avatar={<Avatar size="small" icon={<PaperClipOutlined />} style={{ background: '#e6f4ff', color: '#1677ff' }} />}
                          title={<span style={{ fontSize: 13, fontWeight: 600 }}>{doc.tenChungTu}</span>}
                          description={<span style={{ fontSize: 11, color: '#8c8c8c' }}>{doc.tenFile}</span>}
                        />
                      </List.Item>
                    )}
                  />
                </div>
              )}
            </Card>

            {/* Modal Xem chứng từ */}
            <Modal
              title={previewDoc?.tenChungTu || 'Xem chứng từ'}
              open={!!previewDoc}
              onCancel={() => setPreviewDoc(null)}
              footer={[<Button key="close" onClick={() => setPreviewDoc(null)}>Đóng</Button>]}
              width={700}
            >
              {previewDoc?.fileUrl ? (
                previewDoc.fileUrl.startsWith('data:image') || previewDoc.tenFile?.match(/\.(jpg|jpeg|png|webp|gif)$/i) ? (
                  <img src={previewDoc.fileUrl} alt={previewDoc.tenChungTu} style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 8 }} />
                ) : (
                  <iframe src={previewDoc.fileUrl} title={previewDoc.tenChungTu} style={{ width: '100%', height: '500px', border: 'none' }} />
                )
              ) : (
                <Alert message="Không thể hiển thị bản xem trước của file này" type="warning" showIcon />
              )}
            </Modal>
          </div>
        )}

      </div>
    </div>
  );
}

// Wrapper styles
function FormSpace({ children }) {
  return <div style={{ display: 'flex', flexDirection: 'column' }}>{children}</div>;
}

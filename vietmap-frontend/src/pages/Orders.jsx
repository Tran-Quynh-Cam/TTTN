import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, Select, InputNumber, DatePicker, Typography, Card, message, AutoComplete, Tabs, Tooltip, Row, Col, Statistic, Upload } from 'antd';
import { PlusOutlined, EyeOutlined, EditOutlined, DeleteOutlined, SearchOutlined, InfoCircleOutlined, CopyOutlined, FilterFilled, HistoryOutlined, MailOutlined, SendOutlined, SaveOutlined, FileTextOutlined, SwapOutlined, DownloadOutlined, SettingOutlined, LeftOutlined, RightOutlined, ShoppingOutlined, SyncOutlined, CheckCircleOutlined, ClockCircleOutlined, DollarOutlined, UploadOutlined } from '@ant-design/icons';
import DB from '../store/db';
import API from '../services/api';
import dayjs from 'dayjs';
import OrderDetail from './OrderDetail';

const { Title, Text } = Typography;

const STATUS_OPTIONS = [
  { value: 'chua_bat_dau', label: 'Chưa bắt đầu' },
  { value: 'dang_thuc_hien', label: 'Đang thực hiện' },
  { value: 'hoan_thanh', label: 'Hoàn thành' },
  { value: 'tre_chuyen', label: 'Trễ chuyến' },
];
const STATUS_COLOR = { chua_bat_dau: 'default', hoan_thanh: 'success', dang_thuc_hien: 'processing', tre_chuyen: 'error' };
const CONT_TYPES = ['20DC', '40DC', '40HC', '45HC'];

const STANDARD_LOCATIONS = [
  'Cảng Cát Lái',
  'Cảng VICT',
  'Cảng Hiệp Phước',
  'ICD Phước Long',
  'KCN Bình Dương',
  'KCN Long Hậu',
  'Depot An Sơn',
  'Depot Cát Lái',
  'Depot Trường Thọ',
  'Depot Phú Hữu'
];
const LOCATION_OPTIONS = STANDARD_LOCATIONS.map(loc => ({ value: loc }));

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

// Initial documents data for TMS Document Tabs
const INITIAL_DOCUMENTS = [
  { id: 1, maChungTu: 'CT2505-001', tenChungTu: 'Phiếu EIR', tenFile: 'Phieu_EIR_DH2505-001.pdf', soChungTu: 'EIR-250512-001', lenh: 'EIR', donHang: 'DH2505-001', vanDon: 'VD2505-001', ngayChungTu: '12/05/2025 08:15', ngayHieuLuc: '12/05/2025 08:15', trangThai: 'hop_le' },
  { id: 2, maChungTu: 'CT2505-002', tenChungTu: 'Booking Confirmation', tenFile: 'Booking_Conf_DH2505-002.pdf', soChungTu: 'BC-250512-002', lenh: 'BC', donHang: 'DH2505-002', vanDon: 'VD2505-002', ngayChungTu: '12/05/2025 09:20', ngayHieuLuc: '12/05/2025 09:20', trangThai: 'hop_le' },
  { id: 3, maChungTu: 'CT2505-003', tenChungTu: 'Hợp đồng vận chuyển', tenFile: 'Hop_Dong_DH2505-003.pdf', soChungTu: 'SC-250512-003', lenh: 'SC', donHang: 'DH2505-003', vanDon: 'VD2505-003', ngayChungTu: '12/05/2025 10:05', ngayHieuLuc: '12/05/2025 10:05', trangThai: 'hop_le' },
  { id: 4, maChungTu: 'CT2505-004', tenChungTu: 'Tờ khai hải quan', tenFile: 'To_Khai_HQ_DH2205-004.pdf', soChungTu: 'DC-250512-004', lenh: 'DC', donHang: 'DH2205-004', vanDon: 'VD2505-004', ngayChungTu: '12/05/2025 11:10', ngayHieuLuc: '12/05/2025 11:10', trangThai: 'cho_xu_ly' },
  { id: 5, maChungTu: 'CT2505-005', tenChungTu: 'Phiếu đóng cont', tenFile: 'Phieu_Dong_Cont_DH2505-005.pdf', soChungTu: 'PC-250512-005', lenh: 'PC', donHang: 'DH2505-005', vanDon: 'VD2505-005', ngayChungTu: '12/05/2025 13:30', ngayHieuLuc: '12/05/2025 13:30', trangThai: 'hop_le' },
];

const selectOpts = (list) => (Array.isArray(list) ? list.map(item => ({ value: item.id, label: item.name || item.bien_so || item.username || `ID ${item.id}` })) : []);

export default function Orders() {
  const user = DB.getUser();
  const isAdmin = user?.activeRole === 'admin';
  const isNhanVien = user?.activeRole === 'nhanvien';
  const canEditOrCreate = isAdmin || isNhanVien;

  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'waybills' | 'order_docs' | 'waybill_docs'
  const [data, setData] = useState([]);
  const [documents, setDocuments] = useState(() => {
    try {
      const saved = localStorage.getItem('vm_documents');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('Lỗi đọc vm_documents từ localStorage:', e);
    }
    return INITIAL_DOCUMENTS;
  });

  useEffect(() => {
    try {
      localStorage.setItem('vm_documents', JSON.stringify(documents));
    } catch (e) {
      console.error('Lỗi lưu vm_documents vào localStorage:', e);
    }
  }, [documents]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [docSearch, setDocSearch] = useState('');
  const [detailOrder, setDetailOrder] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [docModal, setDocModal] = useState(false);
  const [form] = Form.useForm();
  const [docForm] = Form.useForm();
  const currentSoBienNhan = Form.useWatch('soBienNhan', form);

  // History states
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Resources
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [sales, setSales] = useState([]);
  const [senders, setSenders] = useState([]);
  const [receivers, setReceivers] = useState([]);
  const [dieuvans, setDieuvans] = useState([]);
  const [dbLocations, setDbLocations] = useState([]);

  const fetchResources = async () => {
    try {
      const [vRes, dRes, sRes, sendRes, recRes, dvRes, locRes] = await Promise.all([
        API.getVehicles(),
        API.getStakeholders('drivers'),
        API.getStakeholders('sales'),
        API.getStakeholders('senders'),
        API.getStakeholders('receivers'),
        API.getStakeholders('dieuvans'),
        API.getLocations()
      ]);
      setVehicles(vRes.data || []);
      setDrivers(dRes.data || []);
      setSales(sRes.data || []);
      setSenders(sendRes.data || []);
      setReceivers(recRes.data || []);
      setDieuvans(dvRes.data || []);
      setDbLocations(locRes.data || []);
    } catch (err) {
      console.error('Lỗi khi tải danh sách tài nguyên:', err);
    }
  };

  const fetchOrdersFromBackend = async () => {
    setLoading(true);
    try {
      const [resOrders, resDocs] = await Promise.all([
        API.getOrders(),
        API.getDocuments()
      ]);
      const normalizedData = (resOrders.data || []).map(o => ({
        ...o,
        soBienNhan: o.soBienNhan || o.so_bien_nhan || '—',
        ngayTao: o.ngayTao || o.ngay_tao,
        saleName: o.saleName || o.sale_name || 'Nguyễn Văn A',
        loaiDonHang: o.loaiDonHang || o.loai_don_hang || 'Vận tải Container',
        benNhanName: o.benNhanName || o.bien_nhan_name || o.receiverName || 'Khách hàng mặc định',
        benGiaoName: o.benGiaoName || o.bien_gui_name || o.senderName || '',
      }));
      setData(normalizedData);

      if (Array.isArray(resDocs.data) && resDocs.data.length > 0) {
        setDocuments(resDocs.data);
      }
    } catch (err) {
      console.error('Lỗi lấy đơn hàng từ Backend:', err);
      message.error('Không thể kết nối CSDL PostgreSQL!');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrdersFromBackend();
    fetchResources();
  }, []);

  const refresh = () => {
    fetchOrdersFromBackend();
    fetchResources();
  };

  // KPI Calculations
  const totalOrders = data.length;
  const inProgressOrders = data.filter(o => (o.trangThai || o.trang_thai) === 'dang_thuc_hien').length;
  const completedOrders = data.filter(o => (o.trangThai || o.trang_thai) === 'hoan_thanh').length;
  const lateOrders = data.filter(o => (o.trangThai || o.trang_thai) === 'tre_chuyen').length;
  const totalRevenue = data.reduce((sum, o) => sum + Number(o.cuocPhi || o.cuoc_phi || 15000000), 0);

  const openHistory = async () => {
    setHistoryModalVisible(true);
    setHistoryLoading(true);
    try {
      const res = await API.getOrderHistory();
      setHistoryData(res.data || []);
    } catch (err) {
      message.error('Lỗi khi tải lịch sử đơn hàng!');
    } finally {
      setHistoryLoading(false);
    }
  };

  const openEdit = (order) => {
    setEditModal(order || 'new');
    if (order && order !== 'new') {
      form.setFieldsValue({
        soBienNhan: order.soBienNhan || order.so_bien_nhan,
        loaiDonHang: order.loaiDonHang || order.loai_don_hang || 'Vận tải Container',
        trangThai: order.trangThai || order.trang_thai || 'chua_bat_dau',
        saleId: order.saleId || order.sale_id,
        senderId: order.senderId || order.bien_gui_id,
        receiverId: order.receiverId || order.bien_nhan_id,
        dieuVanId: order.dieuVanId || order.dieu_van_id,
        taiXeId: order.taiXeId || order.tai_xe_id,
        vehicleId: order.vehicleId || order.vehicle_id,
        soMooc: order.soMooc || order.so_mooc,
        loaiCont: order.loaiCont || order.loai_cont || '20DC',
        soLuongCont: order.soLuongCont || 1,
        noiLay: order.noiLay || order.diem_lay_hang || order.diemLayHang,
        noiGiao: order.noiGiao || order.diem_giao_hang || order.diemGiaoHang,
        noiHa: order.noiHa || order.diem_tra_rong || order.noiHa || '',
        ngayTao: (order.ngayTao || order.ngay_tao) ? dayjs(order.ngayTao || order.ngay_tao) : null,
        ngayLayHang: (order.ngayLayHang || order.ngay_lay_hang) ? dayjs(order.ngayLayHang || order.ngay_lay_hang) : null,
        ngayGiaoHang: (order.ngayGiaoHang || order.ngay_giao_hang) ? dayjs(order.ngayGiaoHang || order.ngay_giao_hang) : null,
        ngayNhanRong: (order.ngayNhanRong || order.ngay_nhan_rong) ? dayjs(order.ngayNhanRong || order.ngay_nhan_rong) : null,
        ngayTraRong: (order.ngayTraRong || order.ngay_tra_rong) ? dayjs(order.ngayTraRong || order.ngay_tra_rong) : null,
        emailTaiXe: order.emailTaiXe || order.email_tai_xe || '',
        ghiChu: order.ghiChu || order.ghi_chu || '',
        cuocPhi: order.cuocPhi || order.cuoc_phi || '',
        tenKhachHang: order.tenKhachHang || order.ten_khach_hang || '',
        mstKhachHang: order.mstKhachHang || order.mst_khach_hang || '',
        diaChiVat: order.diaChiVat || order.dia_chi_vat || ''
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        soBienNhan: `DH${dayjs().format('YYMM')}-${Math.floor(100 + Math.random() * 900)}`,
        loaiDonHang: 'Xuất quốc tế',
        trangThai: 'chua_bat_dau',
        loaiCont: '20DC',
        soLuongCont: 1,
        ngayTao: dayjs(),
        noiLay: 'Depot Tân Cảng',
        noiGiao: 'Cảng Cát Lái',
        noiHa: '',
        cuocPhi: 12500000,
        hangHoa: 'Cá Ba Sa (-18 đến -15 độ C)',
        tenKhachHang: 'CÔNG TY CỔ PHẦN TIẾP VẬN SIÊU TỐC',
        mstKhachHang: '0200872512',
        diaChiVat: 'Tổ dân phố Tân Thanh, phường Hồng An, Thành phố Hải Phòng, Việt Nam'
      });
    }
  };

  const handleFormValuesChange = (changedValues, allValues) => {
    if (changedValues.noiLay || changedValues.noiGiao || changedValues.loaiCont || changedValues.noiHa) {
      const { noiLay, noiGiao, loaiCont } = allValues;
      if (noiLay || noiGiao) {
        try {
          const savedRates = localStorage.getItem('vm_freight_rates');
          const rates = savedRates ? JSON.parse(savedRates) : [];
          const match = rates.find(r => 
            r.noiLay === noiLay && 
            r.noiGiao === noiGiao && 
            (!loaiCont || r.loaiCont === loaiCont)
          );
          if (match && match.cuocPhi) {
            form.setFieldsValue({ cuocPhi: match.cuocPhi });
            message.info(`💡 Đã áp dụng cước phí theo bảng giá tuyến: ${Number(match.cuocPhi).toLocaleString('vi-VN')} ₫`);
          }
        } catch (e) {
          console.error('Lỗi tra cứu bảng giá cước:', e);
        }
      }
    }
  };

  const handleSave = async () => {
    try {
      const vals = await form.validateFields();
      const fmtDate = d => (d ? dayjs(d).format('YYYY-MM-DD') : null);
      const payload = {
        ...vals,
        trangThai: (editModal && editModal !== 'new') ? (editModal.trangThai || 'chua_bat_dau') : 'chua_bat_dau',
        ngayTao: fmtDate(vals.ngayTao),
        ngayLayHang: fmtDate(vals.ngayLayHang),
        ngayGiaoHang: fmtDate(vals.ngayGiaoHang),
        ngayNhanRong: fmtDate(vals.ngayNhanRong),
        ngayTraRong: fmtDate(vals.ngayTraRong),
      };
      if (editModal && editModal !== 'new') {
        await API.updateOrder(editModal.id, payload);
        message.success('Cập nhật đơn hàng thành công!');
      } else {
        await API.createOrder(payload);
        message.success('Tạo đơn hàng thành công!');
      }
      setEditModal(null); refresh();
    } catch (err) {
      console.error(err);
      message.error('Lỗi khi lưu đơn hàng!');
    }
  };

  const handleDelete = (id) => {
    Modal.confirm({
      title: 'Xác nhận xóa đơn hàng?',
      content: `Đơn hàng sẽ bị xóa vĩnh viễn.`,
      okText: 'Xóa', okType: 'danger', cancelText: 'Hủy',
      onOk: async () => {
        try {
          await API.deleteOrder(id);
          message.warning('Đã xóa đơn hàng!');
          refresh();
        } catch (err) {
          message.error('Lỗi khi xóa đơn hàng!');
        }
      }
    });
  };

  const handleSendEmail = (order) => {
    Modal.confirm({
      title: 'Xác nhận gửi email',
      content: `Gửi lệnh vận chuyển "${order.soBienNhan || order.so_bien_nhan}" tới ${order.emailTaiXe || order.email_tai_xe}?`,
      okText: 'Gửi ngay', cancelText: 'Hủy',
      onOk: async () => {
        const hide = message.loading('Đang gửi email...', 0);
        try {
          const res = await API.sendOrderEmail(order.id);
          hide();
          message.success(res.data?.message || 'Gửi email thành công!');
        } catch (err) {
          hide();
          message.error('Gửi email thất bại!');
        }
      }
    });
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

      const currentCode = (editModal && editModal !== 'new')
        ? (editModal.soBienNhan || editModal.so_bien_nhan)
        : (form.getFieldValue('soBienNhan') || '');
      const docId = Date.now();
      const newDocPayload = {
        maChungTu: `CT-${docId}`,
        tenChungTu: vals.tenChungTu,
        tenFile: uploadedFileName || `${vals.tenChungTu.replace(/\s+/g, '_')}.pdf`,
        soChungTu: `SC-${docId}`,
        donHang: currentCode,
        fileUrl: fileUrl,
        trangThai: 'hop_le'
      };

      const res = await API.createDocument(newDocPayload);
      const savedDoc = res.data || { ...newDocPayload, id: docId };

      setDocuments(prev => [savedDoc, ...(prev || [])]);
      message.success('Thêm chứng từ thành công!');
      setDocModal(false);
      docForm.resetFields();
    } catch (err) {
      console.error(err);
      message.error('Vui lòng chọn tên chứng từ');
    }
  };
  const getColumnSearchProps = (dataIndex, nameKey) => ({
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
      <div style={{ padding: 8 }} onKeyDown={e => e.stopPropagation()}>
        <Input
          placeholder={`Tìm ${nameKey}...`}
          value={selectedKeys[0]}
          onChange={e => setSelectedKeys(e.target.value ? [e.target.value] : [])}
          onPressEnter={() => confirm()}
          style={{ marginBottom: 8, display: 'block' }}
        />
        <Space>
          <Button type="primary" onClick={() => confirm()} icon={<SearchOutlined />} size="small" style={{ width: 80 }}>Tìm</Button>
          <Button onClick={() => { clearFilters(); confirm(); }} size="small" style={{ width: 80 }}>Xóa</Button>
        </Space>
      </div>
    ),
    filterIcon: filtered => <FilterFilled style={{ color: filtered ? '#1677ff' : undefined }} />,
    onFilter: (value, record) => {
      let v = '';
      if (dataIndex === 'soBienNhan') v = record.soBienNhan || record.so_bien_nhan || '';
      else if (dataIndex === 'saleName') v = record.saleName || record.sale_name || 'Nguyễn Văn A';
      else if (dataIndex === 'ngayTao') v = (record.ngayTao || record.ngay_tao) ? dayjs(record.ngayTao || record.ngay_tao).format('DD/MM/YYYY') : '12/05/2025';
      else if (dataIndex === 'trangThaiTag') v = 'Đơn hàng';
      else v = record[dataIndex];
      return v ? v.toString().toLowerCase().includes(value.toLowerCase()) : false;
    }
  });

  // Order Table Columns matching exact reference image design
  const orderColumns = [
    {
      title: 'Số biên nhận',
      key: 'soBienNhan',
      width: 160,
      ...getColumnSearchProps('soBienNhan', 'số biên nhận'),
      render: (_, r) => <span style={{ color: '#1677ff', fontWeight: 600 }}>{r.soBienNhan || r.so_bien_nhan || '—'}</span>
    },
    {
      title: 'Ngày kế hoạch',
      key: 'ngayTao',
      width: 130,
      ...getColumnSearchProps('ngayTao', 'ngày kế hoạch'),
      render: (_, r) => {
        const val = r.ngayTao || r.ngay_tao;
        return val ? dayjs(val).format('DD/MM/YYYY') : '12/05/2025';
      }
    },
    {
      title: 'Tên sale',
      key: 'saleName',
      width: 180,
      ...getColumnSearchProps('saleName', 'tên sale'),
      render: (_, r) => <strong>{r.saleName || r.sale_name || 'Nguyễn Văn A'}</strong>
    },
    {
      title: 'Loại đơn',
      key: 'loaiDonHang',
      width: 160,
      render: (_, r) => <Tag color="blue">{r.loaiDonHang || r.loai_don_hang || 'Vận tải Container'}</Tag>
    },
    {
      title: 'Bên nhận',
      key: 'benNhan',
      width: 250,
      render: (_, r) => <strong>{r.benNhanName || r.bien_nhan_name || r.receiverName || 'Khách hàng mặc định'}</strong>
    },
    {
      title: 'Trạng thái',
      key: 'trangThaiTag',
      width: 140,
      render: (_, r) => {
        const stMap = {
          chua_bat_dau: { text: 'Chưa bắt đầu', color: 'default' },
          dang_thuc_hien: { text: 'Đang vận chuyển', color: 'processing' },
          hoan_thanh: { text: 'Hoàn thành', color: 'success' },
          tre_chuyen: { text: 'Trễ chuyến', color: 'error' }
        };
        const stKey = r.trang_thai || r.trangThai || 'chua_bat_dau';
        const st = stMap[stKey] || { text: 'Chưa bắt đầu', color: 'default' };
        return <Tag color={st.color} style={{ fontWeight: 600 }}>{st.text}</Tag>;
      }
    },
    {
      title: 'Thao tác',
      key: 'actions',
      fixed: 'right',
      width: 120,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setDetailOrder(r)} />
          {canEditOrCreate && <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => openEdit(r)} />}
          {isAdmin && <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r.id)} />}
        </Space>
      )
    }
  ];

  // Document Columns showing only Document Name and File Name
  const docColumns = [
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
      render: (t, r) => <span style={{ color: '#1677ff' }}>{t || r.fileName || `${r.tenChungTu?.replace(/\s+/g, '_') || 'ChungTu'}.pdf`}</span>
    }
  ];

  const filteredOrders = data.filter(o => {
    const code = o.soBienNhan || '';
    const customer = o.benGiaoName || o.khach_hang || '';
    return code.toLowerCase().includes(search.toLowerCase()) || customer.toLowerCase().includes(search.toLowerCase());
  });

  const filteredDocs = (Array.isArray(documents) ? documents : []).filter(d => 
    (d.maChungTu || '').toLowerCase().includes(docSearch.toLowerCase()) || 
    (d.tenChungTu || '').toLowerCase().includes(docSearch.toLowerCase()) || 
    (d.soChungTu || '').toLowerCase().includes(docSearch.toLowerCase())
  );

  const selectOpts = (arr) => arr.map(x => ({ value: x.id, label: x.name || x.bienSo || x.bien_so || '' }));

  if (detailOrder) {
    return (
      <OrderDetail
        order={detailOrder}
        vehicles={vehicles}
        drivers={drivers}
        sales={sales}
        senders={senders}
        receivers={receivers}
        dieuvans={dieuvans}
        documents={documents}
        onUploadDoc={(newDoc) => setDocuments(prev => [newDoc, ...prev])}
        onBack={() => { setDetailOrder(null); refresh(); }}
        onEdit={(o) => { setDetailOrder(null); openEdit(o); }}
      />
    );
  }

  return (
    <div>
      {/* Title Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
           <Title level={3} style={{ margin: 0, fontWeight: 800, color: '#0A1628' }}>Quản lý đơn hàng & chứng từ</Title>
        </div>
        {isAdmin && <Button icon={<HistoryOutlined />} onClick={openHistory}>Lịch sử thao tác</Button>}
      </div>


      {/* Main Table */}
      <Card bodyStyle={{ padding: 16 }} style={{ borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
          {/* Action Header Bar */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <Space size={12}>
              {canEditOrCreate && (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit(null)} style={{ fontWeight: 600, borderRadius: 6 }}>
                  Mới
                </Button>
              )}


              <Text type="secondary" style={{ fontSize: 13, marginLeft: 8 }}>
                1-{filteredOrders.length} / {data.length}
              </Text>
              <Button size="small" icon={<LeftOutlined />} disabled />
              <Button size="small" icon={<RightOutlined />} />
            </Space>
          </div>

          <Table
            dataSource={filteredOrders}
            columns={orderColumns}
            rowKey="id"
            scroll={{ x: 'max-content' }}
            size="small"
            loading={loading}
            onRow={r => ({ onDoubleClick: () => setDetailOrder(r) })}
            pagination={{ pageSize: 10, showTotal: (total, range) => `Hiển thị ${range[0]}-${range[1]} / ${total} dòng` }}
          />
        </Card>


      {/* Edit/Create Order Modal */}
      <Modal
        title={editModal && editModal !== 'new' ? 'Chỉnh sửa đơn hàng' : 'Tạo đơn hàng mới'}
        open={!!editModal} onCancel={() => setEditModal(null)} onOk={handleSave} okText={<span><SaveOutlined /> Lưu</span>} cancelText="Hủy" width={800}
      >
        <Form form={form} layout="vertical" size="middle" onValuesChange={handleFormValuesChange}>
          <div style={{ fontWeight: 700, color: '#1677ff', marginBottom: 8, paddingBottom: 6, borderBottom: '2px solid #e6f4ff' }}>Thông tin chung</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '0 16px' }}>
            <Form.Item name="soBienNhan" label="Số biên nhận / Mã đơn *" rules={[{ required: true, message: 'Vui lòng nhập số biên nhận' }]}><Input placeholder="BN-2024-XXX" /></Form.Item>
            <Form.Item name="ngayTao" label="Ngày lập / Tạo"><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item>
            <Form.Item name="loaiDonHang" label="Loại đơn hàng">
              <Select options={[
                { value: 'Xuất quốc tế', label: 'Xuất quốc tế' },
                { value: 'Xuất nội địa', label: 'Xuất nội địa' },
                { value: 'Nhập quốc tế', label: 'Nhập quốc tế' },
                { value: 'Nhập nội địa', label: 'Nhập nội địa' },
                { value: 'Chuyển kho', label: 'Chuyển kho' }
              ]} placeholder="Chọn loại đơn hàng" />
            </Form.Item>
            <Form.Item name="saleId" label="Sale phụ trách"><Select showSearch placeholder="Chọn Sale" options={selectOpts(sales)} filterOption={(i, o) => o.label.toLowerCase().includes(i.toLowerCase())} allowClear /></Form.Item>
            <Form.Item name="senderId" label="Khách hàng / Bên giao"><Select showSearch placeholder="Chọn Bên giao" options={selectOpts(senders)} filterOption={(i, o) => o.label.toLowerCase().includes(i.toLowerCase())} allowClear /></Form.Item>
            <Form.Item name="receiverId" label="Bên nhận hàng"><Select showSearch placeholder="Chọn Bên nhận" options={selectOpts(receivers)} filterOption={(i, o) => o.label.toLowerCase().includes(i.toLowerCase())} allowClear /></Form.Item>
            <Form.Item name="hangHoa" label="Hàng hóa / Loại hàng"><Input placeholder="VD: Cá Ba Sa (-18 đến -15 độ C)" /></Form.Item>
            <Form.Item name="tenKhachHang" label="Tên công ty xuất hóa đơn"><Input placeholder="VD: CÔNG TY CỔ PHẦN TIẾP VẬN SIÊU TỐC" /></Form.Item>
            <Form.Item name="mstKhachHang" label="Mã số thuế khách hàng"><Input placeholder="VD: 0200872512" /></Form.Item>
            <Form.Item name="diaChiVat" label="Địa chỉ xuất hóa đơn"><Input placeholder="Địa chỉ ghi trên hóa đơn VAT..." /></Form.Item>
          </div>

          <div style={{ fontWeight: 700, color: '#1677ff', margin: '12px 0 8px 0', paddingBottom: 6, borderBottom: '2px solid #e6f4ff' }}>Điều phối vận chuyển</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '0 16px' }}>
            <Form.Item name="dieuVanId" label="Nhân viên điều vận"><Select showSearch placeholder="Chọn điều vận" options={selectOpts(dieuvans)} filterOption={(i, o) => o.label.toLowerCase().includes(i.toLowerCase())} allowClear /></Form.Item>
          </div>

          <div style={{ fontWeight: 700, color: '#1677ff', margin: '12px 0 8px 0', paddingBottom: 6, borderBottom: '2px solid #e6f4ff' }}>Thông tin Container & Lộ trình</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '0 16px' }}>
            <Form.Item name="loaiCont" label="Loại Cont"><Select options={CONT_TYPES.map(c => ({ value: c, label: c }))} /></Form.Item>
            <Form.Item name="soLuongCont" label="Số lượng Cont"><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="noiLay" label="1. Nơi lấy vỏ/hàng"><AutoComplete options={LOCATION_OPTIONS} placeholder="Chọn hoặc nhập địa điểm..." filterOption={(i, o) => o.value.toLowerCase().includes(i.toLowerCase())} /></Form.Item>
            <Form.Item name="noiGiao" label="2. Nơi giao vỏ/hàng"><AutoComplete options={LOCATION_OPTIONS} placeholder="Chọn hoặc nhập địa điểm..." filterOption={(i, o) => o.value.toLowerCase().includes(i.toLowerCase())} /></Form.Item>
            <Form.Item name="noiHa" label="3. Nơi hạ hàng/vỏ" style={{ gridColumn: 'span 2' }}><AutoComplete options={LOCATION_OPTIONS} placeholder="Chọn hoặc nhập địa điểm..." filterOption={(i, o) => o.value.toLowerCase().includes(i.toLowerCase())} /></Form.Item>
            <Form.Item name="ghiChu" label="Ghi chú đơn hàng" style={{ gridColumn: 'span 2' }}><Input placeholder="Ghi chú lộ trình..." /></Form.Item>
          </div>
        </Form>
        <div style={{ marginTop: 24 }}>
          <div style={{ fontWeight: 700, color: '#1677ff', marginBottom: 8, paddingBottom: 6, borderBottom: '2px solid #e6f4ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Chứng từ đính kèm (Tùy chọn)</span>
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => {
              docForm.resetFields();
              setDocModal(true);
            }}>Upload Chứng từ</Button>
          </div>
          <Table
            dataSource={(Array.isArray(documents) ? documents : []).filter(d => currentSoBienNhan && d.donHang === currentSoBienNhan)}
            columns={docColumns}
            rowKey="id"
            size="small"
            pagination={false}
            locale={{ emptyText: 'Chưa có chứng từ nào đính kèm' }}
          />
        </div>
      </Modal>

      {/* Upload Document Modal */}
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

      {/* History Modal */}
      <Modal title="📜 Lịch sử thao tác đơn hàng" open={historyModalVisible} onCancel={() => setHistoryModalVisible(false)} footer={null} width={750}>
        <Table dataSource={historyData} rowKey="id" loading={historyLoading} size="small" columns={[
          { title: 'Thời gian', dataIndex: 'created_at', render: d => d ? dayjs(d).format('DD/MM/YYYY HH:mm:ss') : '—' },
          { title: 'Người thực hiện', dataIndex: 'user_name', render: u => <strong>{u}</strong> },
          { title: 'Hành động', dataIndex: 'action', render: a => <Tag color={a === 'CREATE' ? 'green' : (a === 'UPDATE' ? 'blue' : 'red')}>{a}</Tag> },
          { title: 'Mã đơn', dataIndex: 'so_bien_nhan' }
        ]} />
      </Modal>
    </div>
  );
}

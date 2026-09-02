import React, { useState, useEffect } from 'react';
import { Table, Card, Typography, Tag, Space, Button, Select, Input, Modal, Form, InputNumber, message, Row, Col, Statistic, Tabs, AutoComplete } from 'antd';
import { AccountBookOutlined, EditOutlined, CheckCircleOutlined, ClockCircleOutlined, PayCircleOutlined, PlusOutlined, DeleteOutlined, TableOutlined, DollarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import API from '../services/api';
import DB from '../store/db';

const { Title, Text } = Typography;

export const INITIAL_FREIGHT_RATES = [
  { id: 'FR-001', noiLay: 'Depot Tân Cảng', noiGiao: 'Cảng Cát Lái', noiHa: 'KCN Bình Dương', loaiCont: '20DC', cuocPhi: 12500000, ghiChu: 'Đơn giá tuyến Tân Cảng - Cát Lái 20ft' },
  { id: 'FR-002', noiLay: 'Depot Tân Cảng', noiGiao: 'Cảng Cát Lái', noiHa: 'KCN Bình Dương', loaiCont: '40DC', cuocPhi: 15000000, ghiChu: 'Đơn giá tuyến Tân Cảng - Cát Lái 40ft' },
  { id: 'FR-003', noiLay: 'ICD Phước Long', noiGiao: 'KCN Long Hậu', noiHa: 'Depot Cát Lái', loaiCont: '20DC', cuocPhi: 11000000, ghiChu: 'Tuyến ICD Phước Long - Long Hậu' },
  { id: 'FR-004', noiLay: 'ICD Phước Long', noiGiao: 'KCN Long Hậu', noiHa: 'Depot Cát Lái', loaiCont: '40HC', cuocPhi: 14500000, ghiChu: 'Tuyến container 40HC' },
  { id: 'FR-005', noiLay: 'Cảng VICT', noiGiao: 'Cảng Hiệp Phước', noiHa: 'Depot Phú Hữu', loaiCont: '45HC', cuocPhi: 18000000, ghiChu: 'Hàng siêu trường siêu trọng' },
];

const STANDARD_LOCATIONS = [
  'Cảng Cát Lái', 'Cảng VICT', 'Cảng Hiệp Phước', 'ICD Phước Long',
  'KCN Bình Dương', 'KCN Long Hậu', 'Depot An Sơn', 'Depot Cát Lái',
  'Depot Trường Thọ', 'Depot Phú Hữu', 'Depot Tân Cảng'
];
const LOCATION_OPTIONS = STANDARD_LOCATIONS.map(l => ({ value: l }));
const CONT_TYPES = ['20DC', '40DC', '40HC', '45HC'];

export default function Freight() {
  const isAdmin = DB.getUser()?.activeRole === 'admin';
  const [activeTab, setActiveTab] = useState('orders');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [rateSearch, setRateSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [form] = Form.useForm();

  const [rates, setRates] = useState(() => {
    try {
      const saved = localStorage.getItem('vm_freight_rates');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return INITIAL_FREIGHT_RATES;
  });

  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [editingRate, setEditingRate] = useState(null);
  const [rateForm] = Form.useForm();

  useEffect(() => {
    try {
      localStorage.setItem('vm_freight_rates', JSON.stringify(rates));
    } catch (e) {}
  }, [rates]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await API.getOrders();
      setOrders(res.data || []);
    } catch (err) {
      console.error('Lỗi lấy danh sách cước phí:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const openEditFreight = (order) => {
    setSelectedOrder(order);
    form.setFieldsValue({
      cuocPhi: order.cuoc_phi || order.cuocPhi || 15000000,
      trangThaiThanhToan: order.trang_thai_thanh_toan || order.trangThaiThanhToan || 'chua_thanh_toan',
      ghiChu: order.ghi_chu_cuoc || ''
    });
    setModalOpen(true);
  };

  const handleSaveFreight = async () => {
    try {
      const vals = await form.validateFields();
      if (selectedOrder) {
        await API.updateOrder(selectedOrder.id, {
          ...selectedOrder,
          cuocPhi: vals.cuocPhi,
          trangThaiThanhToan: vals.trangThaiThanhToan,
          ghiChuCuoc: vals.ghiChu
        });
        message.success('Cập nhật cước phí đơn hàng thành công!');
        setModalOpen(false);
        fetchOrders();
      }
    } catch (err) {
      message.error('Lỗi khi lưu cước phí');
    }
  };

  const openEditRate = (rate) => {
    setEditingRate(rate || 'new');
    if (rate && rate !== 'new') {
      rateForm.setFieldsValue(rate);
    } else {
      rateForm.resetFields();
      rateForm.setFieldsValue({
        id: `FR-${Math.floor(100 + Math.random() * 900)}`,
        loaiCont: '20DC',
        cuocPhi: 12000000
      });
    }
    setRateModalOpen(true);
  };

  const handleSaveRate = async () => {
    try {
      const vals = await rateForm.validateFields();
      if (editingRate && editingRate !== 'new') {
        setRates(prev => prev.map(r => r.id === editingRate.id ? { ...r, ...vals } : r));
        message.success('Đã cập nhật đơn giá tuyến!');
      } else {
        const newRate = { ...vals, id: vals.id || `FR-${Math.floor(100 + Math.random() * 900)}` };
        setRates(prev => [newRate, ...prev]);
        message.success('Đã thêm đơn giá cước tuyến mới!');
      }
      setRateModalOpen(false);
    } catch (err) {
      message.error('Vui lòng điền đủ thông tin tuyến cước');
    }
  };

  const handleDeleteRate = (id) => {
    Modal.confirm({
      title: 'Xóa tuyến cước này?',
      content: 'Đơn giá tuyến cước sẽ bị xóa khỏi bảng giá.',
      okText: 'Xóa', okType: 'danger', cancelText: 'Hủy',
      onOk: () => {
        setRates(prev => prev.filter(r => r.id !== id));
        message.success('Đã xóa tuyến cước!');
      }
    });
  };

  const filteredOrders = orders.filter(o => {
    const code = o.so_bien_nhan || o.soBienNhan || '';
    const sender = o.khach_hang || o.benGiaoName || o.bien_gui_name || o.tenKhachHang || o.ten_khach_hang || '';
    const receiver = o.benNhanName || o.bien_nhan_name || '';
    const matchSearch = !search || 
      code.toLowerCase().includes(search.toLowerCase()) || 
      sender.toLowerCase().includes(search.toLowerCase()) || 
      receiver.toLowerCase().includes(search.toLowerCase());
    const status = o.trang_thai_thanh_toan || o.trangThaiThanhToan || 'chua_thanh_toan';
    const matchPayment = !paymentFilter || status === paymentFilter;
    return matchSearch && matchPayment;
  });

  const filteredRates = rates.filter(r => {
    if (!rateSearch) return true;
    const q = rateSearch.toLowerCase();
    return (
      (r.noiLay || '').toLowerCase().includes(q) ||
      (r.noiGiao || '').toLowerCase().includes(q) ||
      (r.noiHa || '').toLowerCase().includes(q) ||
      (r.loaiCont || '').toLowerCase().includes(q)
    );
  });

  const totalFreight = orders.reduce((sum, o) => sum + Number(o.cuoc_phi || o.cuocPhi || 15000000), 0);
  const paidFreight = orders.filter(o => (o.trang_thai_thanh_toan || o.trangThaiThanhToan) === 'da_thanh_toan').reduce((sum, o) => sum + Number(o.cuoc_phi || o.cuocPhi || 15000000), 0);
  const pendingFreight = totalFreight - paidFreight;

  const PAYMENT_STATUS = {
    chua_thanh_toan: { label: 'Chưa thanh toán', color: 'warning', icon: <ClockCircleOutlined /> },
    da_thanh_toan: { label: 'Đã thanh toán', color: 'success', icon: <CheckCircleOutlined /> }
  };

  const handleStatusChange = async (order, newStatus) => {
    try {
      setOrders(prev => prev.map(item => item.id === order.id ? { ...item, trang_thai_thanh_toan: newStatus, trangThaiThanhToan: newStatus } : item));
      await API.updateOrder(order.id, {
        ...order,
        trangThaiThanhToan: newStatus,
        trang_thai_thanh_toan: newStatus
      });
      message.success(`Đã cập nhật trạng thái thanh toán đơn ${order.so_bien_nhan || order.soBienNhan || ''}!`);
      fetchOrders();
    } catch (err) {
      message.error('Lỗi khi cập nhật trạng thái thanh toán');
      fetchOrders();
    }
  };

  const getOrderFreightRate = (order) => {
    const noiLay = order.diem_lay_hang || order.diemLayHang || '';
    const noiGiao = order.diem_giao_hang || order.diemGiaoHang || '';
    const loaiCont = order.loai_cont || order.loaiCont || '';

    // Match against Tariff Rates matrix
    const matched = rates.find(r => {
      const matchLay = r.noiLay && (noiLay.toLowerCase().includes(r.noiLay.toLowerCase()) || r.noiLay.toLowerCase().includes(noiLay.toLowerCase()));
      const matchGiao = r.noiGiao && (noiGiao.toLowerCase().includes(r.noiGiao.toLowerCase()) || r.noiGiao.toLowerCase().includes(noiGiao.toLowerCase()));
      const matchCont = !r.loaiCont || !loaiCont || r.loaiCont.toLowerCase() === loaiCont.toLowerCase();
      return matchLay && matchGiao && matchCont;
    });

    if (matched && matched.cuocPhi) {
      return Number(matched.cuocPhi);
    }

    if (order.cuoc_phi && Number(order.cuoc_phi) > 0) return Number(order.cuoc_phi);
    if (order.cuocPhi && Number(order.cuocPhi) > 0) return Number(order.cuocPhi);

    return 15000000;
  };

  const columns = [
    { title: 'Số biên nhận', dataIndex: 'so_bien_nhan', render: (t, r) => <strong>{t || r.soBienNhan}</strong> },
    { title: 'Khách hàng / Bên giao', dataIndex: 'khach_hang', render: (t, r) => <span>{t || r.benGiaoName || r.bien_gui_name || r.tenKhachHang || r.ten_khach_hang || r.khach_hang || '—'}</span> },
    { title: 'Lộ trình vận chuyển', key: 'route', render: (_, r) => <span>📍 {r.diem_lay_hang || r.diemLayHang || '—'} ➔ 🏁 {r.diem_giao_hang || r.diemGiaoHang || '—'}</span> },
    {
      title: 'Cước vận chuyển (₫)',
      key: 'cuocPhi',
      render: (_, r) => {
        const stKey = r.trang_thai_thanh_toan || r.trangThaiThanhToan || 'chua_thanh_toan';
        const isPaid = stKey === 'da_thanh_toan';
        const baseRate = getOrderFreightRate(r);

        if (isPaid) {
          return (
            <strong style={{ color: '#52c41a', fontSize: 14 }}>
              0 ₫
            </strong>
          );
        }

        return (
          <strong style={{ color: '#1677ff', fontSize: 14 }}>
            {baseRate.toLocaleString('vi-VN')} ₫
          </strong>
        );
      }
    },
    {
      title: 'Trạng thái thanh toán',
      key: 'paymentStatus',
      width: 200,
      render: (_, r) => {
        const stKey = r.trang_thai_thanh_toan || r.trangThaiThanhToan || 'chua_thanh_toan';
        return (
          <Select
            value={stKey}
            onChange={(val) => handleStatusChange(r, val)}
            style={{ width: 170 }}
            options={[
              { value: 'chua_thanh_toan', label: <Tag color="warning" icon={<ClockCircleOutlined />} style={{ margin: 0 }}>Chưa thanh toán</Tag> },
              { value: 'da_thanh_toan', label: <Tag color="success" icon={<CheckCircleOutlined />} style={{ margin: 0 }}>Đã thanh toán</Tag> }
            ]}
          />
        );
      }
    }
  ];

  const rateColumns = [
    { title: 'Mã tuyến', dataIndex: 'id', render: t => <strong style={{ color: '#1677ff', fontFamily: 'monospace' }}>{t}</strong> },
    { title: 'Nơi lấy vỏ/hàng', dataIndex: 'noiLay', render: t => <span>📍 {t}</span> },
    { title: 'Nơi giao vỏ/hàng', dataIndex: 'noiGiao', render: t => <span>🏁 {t}</span> },
    { title: 'Nơi hạ hàng/vỏ', dataIndex: 'noiHa', render: t => <span style={{ color: '#595959' }}>⚓ {t || '—'}</span> },
    { title: 'Loại Container', dataIndex: 'loaiCont', render: t => <Tag color="blue" style={{ fontWeight: 600 }}>{t}</Tag> },
    { title: 'Đơn giá cước quy định (₫)', dataIndex: 'cuocPhi', render: v => <strong style={{ color: '#52c41a', fontSize: 14 }}>{Number(v).toLocaleString('vi-VN')} ₫</strong> },
    ...(isAdmin ? [{
      title: 'Thao tác',
      key: 'act',
      render: (_, r) => (
        <Space>
          <Button size="small" type="default" icon={<EditOutlined />} onClick={() => openEditRate(r)}>Sửa</Button>
          <Button size="small" type="primary" danger icon={<DeleteOutlined />} onClick={() => handleDeleteRate(r.id)}>Xóa</Button>
        </Space>
      )
    }] : [])
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>💵 Quản lý Cước phí & Doanh thu Vận tải</Title>
        <Text type="secondary">Quản lý bảng giá cước định mức theo tuyến, hóa đơn thanh toán & công nợ vận tải</Text>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        type="card"
        style={{ marginBottom: 16 }}
        items={[
          {
            key: 'orders',
            label: <span><DollarOutlined /> Đơn hàng & Doanh thu Cước</span>,
            children: (
              <Card style={{ borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                <Space style={{ marginBottom: 16, flexWrap: 'wrap' }}>
                    <Input.Search placeholder="Tìm theo biên nhận, khách hàng..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 280 }} allowClear />
                    <Select
                      placeholder="Lọc trạng thái thanh toán"
                      value={paymentFilter}
                      onChange={setPaymentFilter}
                      style={{ width: 200 }}
                      options={[
                        { value: '', label: 'Tất cả trạng thái' },
                        { value: 'chua_thanh_toan', label: 'Chưa thanh toán' },
                        { value: 'da_thanh_toan', label: 'Đã thanh toán' }
                      ]}
                    />
                  </Space>

                  <Table dataSource={filteredOrders} columns={columns} rowKey="id" loading={loading} size="small" pagination={{ pageSize: 10 }} />
                </Card>
            )
          },
          {
            key: 'rates',
            label: <span><TableOutlined /> Bảng Giá Cước Theo Tuyến</span>,
            children: (
              <Card style={{ borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                  <Input.Search placeholder="Tìm theo điểm lấy, điểm giao, loại cont..." value={rateSearch} onChange={e => setRateSearch(e.target.value)} style={{ width: 320 }} allowClear />
                  {isAdmin && (
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditRate(null)} style={{ background: '#52c41a', borderColor: '#52c41a', fontWeight: 600 }}>
                      Thêm tuyến cước mới
                    </Button>
                  )}
                </div>

                <Table dataSource={filteredRates} columns={rateColumns} rowKey="id" size="small" pagination={{ pageSize: 10 }} />
              </Card>
            )
          }
        ]}
      />

      <Modal
        title="Chỉnh sửa cước phí đơn hàng"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSaveFreight}
        okText="Lưu cước phí"
        cancelText="Hủy"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="cuocPhi" label="Tổng cước phí vận chuyển (₫) *" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={v => v.replace(/\$\s?|(,*)/g, '')} />
          </Form.Item>
          <Form.Item name="trangThaiThanhToan" label="Trạng thái thanh toán *" rules={[{ required: true }]}>
            <Select options={[
              { value: 'chua_thanh_toan', label: 'Chưa thanh toán' },
              { value: 'quoc_dinh', label: 'Chờ đối soát' },
              { value: 'da_thanh_toan', label: 'Đã thanh toán' }
            ]} />
          </Form.Item>
          <Form.Item name="ghiChu" label="Ghi chú đối soát cước">
            <Input.TextArea rows={2} placeholder="Nhập ghi chú thanh toán, số hóa đơn..." />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingRate && editingRate !== 'new' ? 'Chỉnh sửa đơn giá tuyến cước' : 'Thêm tuyến cước quy định mới'}
        open={rateModalOpen}
        onCancel={() => setRateModalOpen(false)}
        onOk={handleSaveRate}
        okText="Lưu tuyến cước"
        cancelText="Hủy"
      >
        <Form form={rateForm} layout="vertical">
          <Form.Item name="id" label="Mã tuyến cước *" rules={[{ required: true }]}>
            <Input placeholder="VD: FR-006" />
          </Form.Item>
          <Form.Item name="noiLay" label="Nơi lấy vỏ/hàng *" rules={[{ required: true }]}>
            <AutoComplete options={LOCATION_OPTIONS} placeholder="Chọn hoặc nhập nơi lấy..." filterOption={(i, o) => o.value.toLowerCase().includes(i.toLowerCase())} />
          </Form.Item>
          <Form.Item name="noiGiao" label="Nơi giao vỏ/hàng *" rules={[{ required: true }]}>
            <AutoComplete options={LOCATION_OPTIONS} placeholder="Chọn hoặc nhập nơi giao..." filterOption={(i, o) => o.value.toLowerCase().includes(i.toLowerCase())} />
          </Form.Item>
          <Form.Item name="noiHa" label="Nơi hạ hàng/vỏ">
            <AutoComplete options={LOCATION_OPTIONS} placeholder="Chọn hoặc nhập nơi hạ..." filterOption={(i, o) => o.value.toLowerCase().includes(i.toLowerCase())} />
          </Form.Item>
          <Form.Item name="loaiCont" label="Loại Container *" rules={[{ required: true }]}>
            <Select options={CONT_TYPES.map(c => ({ value: c, label: c }))} />
          </Form.Item>
          <Form.Item name="cuocPhi" label="Đơn giá cước quy định (₫) *" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={v => v.replace(/\$\s?|(,*)/g, '')} placeholder="Nhập đơn giá cước..." />
          </Form.Item>
          <Form.Item name="ghiChu" label="Ghi chú tuyến">
            <Input placeholder="VD: Áp dụng từ quý III/2026..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

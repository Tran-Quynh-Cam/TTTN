import React, { useState, useEffect } from 'react';
import { Table, Card, Typography, Tag, Space, Button, Select, Input, Modal, Form, InputNumber, DatePicker, message, Row, Col, Statistic } from 'antd';
import { DollarOutlined, PlusOutlined, EditOutlined, DeleteOutlined, FileTextOutlined, AuditOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import API from '../services/api';
import DB from '../store/db';

const { Title, Text } = Typography;

export default function Expenses() {
  const user = DB.getUser();
  const isAdmin = user?.activeRole === 'admin';
  const [data, setData] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form] = Form.useForm();

  // Mock initial expenses merged with database records
  const initialExpenses = [
    { id: 1, maChiPhi: 'CP-001', bienSo: '15H-096.12', loaiChiPhi: 'nhien_lieu', tenChiPhi: 'Đổ dầu Diesel 200 lít', soTien: 4200000, ngay: '2026-08-30', ghiChu: 'Đổ cây dầu Petrolimex Cảng Cát Lái' },
    { id: 2, maChiPhi: 'CP-002', bienSo: '15H-096.34', loaiChiPhi: 'cau_duong', tenChiPhi: 'Vé trạm BOT Cao tốc Hải Phòng', soTien: 380000, ngay: '2026-08-31', ghiChu: 'ETC tự động trừ' },
    { id: 3, maChiPhi: 'CP-003', bienSo: '15H-096.56', loaiChiPhi: 'ben_bai', tenChiPhi: 'Phí lưu bãi container đêm', soTien: 500000, ngay: '2026-09-01', ghiChu: 'Cảng Tân Cảng Cát Lái' },
    { id: 4, maChiPhi: 'CP-004', bienSo: '15H-096.78', loaiChiPhi: 'sua_chua', tenChiPhi: 'Thay nhớt & lọc phanh', soTien: 2500000, ngay: '2026-09-01', ghiChu: 'Bảo dưỡng định kỳ 10.000km' },
  ];

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const vRes = await API.getVehicles();
      setVehicles(vRes.data || []);
      
      const stored = localStorage.getItem('fleet_expenses_data');
      if (stored) {
        setData(JSON.parse(stored));
      } else {
        setData(initialExpenses);
        localStorage.setItem('fleet_expenses_data', JSON.stringify(initialExpenses));
      }
    } catch (err) {
      console.error('Lỗi lấy chi phí:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  const saveExpenses = (newList) => {
    setData(newList);
    localStorage.setItem('fleet_expenses_data', JSON.stringify(newList));
  };

  const openModal = (item) => {
    setEditItem(item || 'new');
    if (item && item !== 'new') {
      form.setFieldsValue({
        ...item,
        ngay: item.ngay ? dayjs(item.ngay) : null
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        maChiPhi: `CP-${Math.floor(1000 + Math.random() * 9000)}`,
        loaiChiPhi: 'nhien_lieu',
        ngay: dayjs(),
        soTien: 0
      });
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const vals = await form.validateFields();
      const payload = {
        ...vals,
        ngay: vals.ngay ? vals.ngay.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD')
      };
      
      if (editItem && editItem !== 'new') {
        const updated = data.map(d => d.id === editItem.id ? { ...d, ...payload } : d);
        saveExpenses(updated);
        message.success('Cập nhật phiếu chi phí thành công!');
      } else {
        const newItem = { id: Date.now(), ...payload };
        saveExpenses([newItem, ...data]);
        message.success('Tạo phiếu chi phí mới thành công!');
      }
      setModalOpen(false);
    } catch (err) {
      message.error('Lỗi khi lưu phiếu chi phí');
    }
  };

  const handleDelete = (id) => {
    Modal.confirm({
      title: 'Xóa phiếu chi phí này?',
      okText: 'Xóa', okType: 'danger', cancelText: 'Hủy',
      onOk: () => {
        const updated = data.filter(d => d.id !== id);
        saveExpenses(updated);
        message.warning('Đã xóa phiếu chi phí!');
      }
    });
  };

  const filtered = data.filter(item => {
    const matchSearch = !search || 
      (item.maChiPhi || '').toLowerCase().includes(search.toLowerCase()) || 
      (item.tenChiPhi || '').toLowerCase().includes(search.toLowerCase()) || 
      (item.bienSo || '').toLowerCase().includes(search.toLowerCase());
    const matchType = !typeFilter || item.loaiChiPhi === typeFilter;
    return matchSearch && matchType;
  });

  const totalExpense = data.reduce((sum, d) => sum + Number(d.soTien || 0), 0);
  const fuelExpense = data.filter(d => d.loaiChiPhi === 'nhien_lieu').reduce((sum, d) => sum + Number(d.soTien || 0), 0);
  const tollExpense = data.filter(d => d.loaiChiPhi === 'cau_duong').reduce((sum, d) => sum + Number(d.soTien || 0), 0);
  const repairExpense = data.filter(d => d.loaiChiPhi === 'sua_chua').reduce((sum, d) => sum + Number(d.soTien || 0), 0);

  const TYPE_MAP = {
    nhien_lieu: { label: 'Nhiên liệu (Dầu)', color: 'blue' },
    cau_duong: { label: 'Cầu đường (BOT)', color: 'gold' },
    ben_bai: { label: 'Bến bãi / Lưu bãi', color: 'cyan' },
    sua_chua: { label: 'Sửa chữa & Bảo dưỡng', color: 'volcano' },
    lop_xe: { label: 'Lốp xe', color: 'purple' },
    khac: { label: 'Chi phí khác', color: 'default' }
  };

  const columns = [
    { title: 'Mã phiếu', dataIndex: 'maChiPhi', render: t => <strong>{t}</strong> },
    { title: 'Biển số xe', dataIndex: 'bienSo', render: t => <Tag color="geekblue">{t || 'Dùng chung'}</Tag> },
    { title: 'Hạng mục chi phí', dataIndex: 'tenChiPhi', render: t => <strong>{t}</strong> },
    {
      title: 'Loại chi phí',
      dataIndex: 'loaiChiPhi',
      render: t => {
        const item = TYPE_MAP[t] || TYPE_MAP.khac;
        return <Tag color={item.color}>{item.label}</Tag>;
      }
    },
    { title: 'Số tiền (₫)', dataIndex: 'soTien', render: v => <strong style={{ color: '#cf1322' }}>{Number(v || 0).toLocaleString('vi-VN')} ₫</strong> },
    { title: 'Ngày phát sinh', dataIndex: 'ngay', render: d => d ? dayjs(d).format('DD/MM/YYYY') : '—' },
    { title: 'Ghi chú', dataIndex: 'ghiChu' },
    {
      title: 'Thao tác',
      key: 'actions',
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => openModal(r)} />
          {isAdmin && <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r.id)} />}
        </Space>
      )
    }
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>💳 Quản lý Chi phí Vận hành</Title>
          <Text type="secondary">Theo dõi chi phí nhiên liệu, cầu đường, bến bãi & bảo trì đội xe</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal(null)}>Thêm phiếu chi phí</Button>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, background: 'linear-gradient(135deg, #FFF1F0, #FFCCC7)' }}>
            <Statistic title="Tổng chi phí phát sinh" value={totalExpense} suffix="₫" valueStyle={{ color: '#cf1322', fontWeight: 700 }} prefix={<DollarOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, background: 'linear-gradient(135deg, #E6F7FF, #BAE7FF)' }}>
            <Statistic title="Chi phí Dầu Diesel" value={fuelExpense} suffix="₫" valueStyle={{ color: '#0958d9' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, background: 'linear-gradient(135deg, #FEFBE8, #FFF1B8)' }}>
            <Statistic title="Vé cầu đường (BOT)" value={tollExpense} suffix="₫" valueStyle={{ color: '#d48806' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, background: 'linear-gradient(135deg, #FFF2E8, #FFD8BF)' }}>
            <Statistic title="Sửa chữa & Bảo dưỡng" value={repairExpense} suffix="₫" valueStyle={{ color: '#d4380d' }} />
          </Card>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
        <Space style={{ marginBottom: 16, flexWrap: 'wrap' }}>
          <Input.Search placeholder="Tìm mã phiếu, tên chi phí, xe..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 260 }} allowClear />
          <Select
            placeholder="Lọc loại chi phí"
            value={typeFilter}
            onChange={setTypeFilter}
            style={{ width: 200 }}
            options={[
              { value: '', label: 'Tất cả loại chi phí' },
              { value: 'nhien_lieu', label: 'Nhiên liệu (Dầu)' },
              { value: 'cau_duong', label: 'Cầu đường (BOT)' },
              { value: 'ben_bai', label: 'Bến bãi / Lưu bãi' },
              { value: 'sua_chua', label: 'Sửa chữa & Bảo dưỡng' },
              { value: 'lop_xe', label: 'Lốp xe' },
              { value: 'khac', label: 'Chi phí khác' }
            ]}
          />
        </Space>

        <Table dataSource={filtered} columns={columns} rowKey="id" loading={loading} size="small" pagination={{ pageSize: 10 }} />
      </Card>

      <Modal
        title={editItem && editItem !== 'new' ? 'Chỉnh sửa phiếu chi phí' : 'Thêm phiếu chi phí mới'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        okText="Lưu phiếu chi"
        cancelText="Hủy"
        width={550}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="maChiPhi" label="Mã phiếu *" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="bienSo" label="Xe liên quan">
            <Select showSearch placeholder="Chọn xe..." allowClear options={vehicles.map(v => ({ value: v.bienSo || v.bien_so, label: v.bienSo || v.bien_so }))} />
          </Form.Item>
          <Form.Item name="tenChiPhi" label="Tên hạng mục chi phí *" rules={[{ required: true, message: 'Nhập tên chi phí' }]}>
            <Input placeholder="Ví dụ: Đổ dầu 200L, Phí BOT Hải Phòng, Lưu bãi..." />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="loaiChiPhi" label="Loại chi phí *" rules={[{ required: true }]}>
              <Select options={[
                { value: 'nhien_lieu', label: 'Nhiên liệu (Dầu)' },
                { value: 'cau_duong', label: 'Cầu đường (BOT)' },
                { value: 'ben_bai', label: 'Bến bãi / Lưu bãi' },
                { value: 'sua_chua', label: 'Sửa chữa & Bảo dưỡng' },
                { value: 'lop_xe', label: 'Lốp xe' },
                { value: 'khac', label: 'Chi phí khác' }
              ]} />
            </Form.Item>
            <Form.Item name="ngay" label="Ngày phát sinh" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item>
          </div>
          <Form.Item name="soTien" label="Số tiền chi phí (₫) *" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={v => v.replace(/\$\s?|(,*)/g, '')} />
          </Form.Item>
          <Form.Item name="ghiChu" label="Ghi chú">
            <Input.TextArea rows={2} placeholder="Ghi chú địa điểm, hóa đơn chứng từ..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

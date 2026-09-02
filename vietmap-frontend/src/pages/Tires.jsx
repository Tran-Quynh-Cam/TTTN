import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, Select, DatePicker, message, Card, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import API from '../services/api';
import DB from '../store/db';

const { Title, Text } = Typography;

export default function Tires() {
  const isAdmin = DB.getUser()?.activeRole === 'admin';
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editModal, setEditModal] = useState(null); // null | 'new' | tire object
  const [search, setSearch] = useState('');
  const [vehicles, setVehicles] = useState([]);
  const [form] = Form.useForm();

  const fetchTires = async () => {
    setLoading(true);
    try {
      const res = await API.getTires();
      const formatted = res.data.map(item => ({
        id: item.id,
        maLop: item.ma_lop || '—',
        vehicleId: item.vehicle_id,
        bienSo: item.bien_so || (item.vehicle_id ? 'Xe #' + item.vehicle_id : 'Chưa lắp'),
        viTri: item.vi_tri || 'Bánh trước trái',
        hangLop: item.hang_lop || 'Bridgestone',

        ngayLap: item.ngay_lap || null,
        ngayThao: item.ngay_thao || null,
        ghiChu: item.ghi_chu || ''
      }));
      setData(formatted);
    } catch (err) {
      console.warn('Lỗi lấy danh sách lốp xe:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchVehicles = async () => {
    try {
      const res = await API.getVehicles();
      setVehicles(res.data || []);
    } catch (err) {
      console.error('Lỗi lấy danh sách xe:', err);
    }
  };

  useEffect(() => {
    fetchTires();
    fetchVehicles();
  }, []);

  const refresh = () => {
    fetchTires();
    fetchVehicles();
  };

  const filtered = data.filter(t => 
    (t.maLop || '').toLowerCase().includes(search.toLowerCase()) || 
    (t.bienSo || '').toLowerCase().includes(search.toLowerCase())
  );

  const openEdit = (tire) => {
    setEditModal(tire || 'new');
    if (tire && tire !== 'new') {
      form.setFieldsValue({
        ...tire,
        ngayLap: tire.ngayLap ? dayjs(tire.ngayLap) : null,
        ngayThao: tire.ngayThao ? dayjs(tire.ngayThao) : null,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ viTri: 'Bánh trước trái', hangLop: 'Bridgestone', ngayLap: dayjs() });
    }
  };

  const handleSave = async () => {
    try {
      const vals = await form.validateFields();
      const payload = {
        ...vals,
        ngayLap: vals.ngayLap ? vals.ngayLap.format('YYYY-MM-DD') : null,
        ngayThao: vals.ngayThao ? vals.ngayThao.format('YYYY-MM-DD') : null,
      };
      if (editModal && editModal !== 'new') {
        await API.updateTire(editModal.id, payload);
        message.success('Cập nhật lốp xe thành công!');
      } else {
        await API.createTire(payload);
        message.success('Thêm lốp xe thành công!');
      }
      setEditModal(null);
      refresh();
    } catch (err) {
      console.error(err);
      message.error('Lỗi khi lưu thông tin lốp xe');
    }
  };

  const handleDelete = (id) => {
    Modal.confirm({
      title: 'Xác nhận xóa lốp xe này?',
      content: 'Dữ liệu lốp xe sẽ bị xóa vĩnh viễn khỏi hệ thống.',
      okText: 'Xóa', okType: 'danger', cancelText: 'Hủy',
      onOk: async () => {
        try {
          await API.deleteTire(id);
          message.warning('Đã xóa lốp xe!');
          refresh();
        } catch (err) {
          message.error('Lỗi khi xóa lốp xe');
        }
      }
    });
  };

  const cols = [
    { title: 'Mã lốp (Serial)', dataIndex: 'maLop', render: t => <strong style={{ color: '#1677ff' }}>{t}</strong> },
    { title: 'Hãng lốp', dataIndex: 'hangLop', render: t => <Tag color="blue">{t}</Tag> },
    { title: 'Xe lắp đặt', dataIndex: 'bienSo' },
    { title: 'Vị trí lắp', dataIndex: 'viTri' },

    { title: 'Ngày lắp', dataIndex: 'ngayLap', render: d => d ? dayjs(d).format('DD/MM/YYYY') : '—' },
    { title: 'Ngày tháo', dataIndex: 'ngayThao', render: d => d ? dayjs(d).format('DD/MM/YYYY') : <Tag color="success">Đang sử dụng</Tag> },
    {
      title: 'Thao tác',
      key: 'actions',
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          {isAdmin && <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r.id)} />}
        </Space>
      )
    }
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div><Title level={4} style={{ margin: 0 }}>Quản lý lốp xe</Title></div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit(null)}>Thêm lốp mới</Button>
      </div>
      
      <Card style={{ borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
        <Input.Search placeholder="Tìm theo mã lốp, biển số xe..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 300, marginBottom: 16 }} allowClear />
        <Table dataSource={filtered} columns={cols} rowKey="id" size="small" loading={loading} pagination={{ pageSize: 10 }} />
      </Card>

      <Modal
        title={editModal && editModal !== 'new' ? 'Chỉnh sửa thông tin lốp' : 'Thêm lốp xe mới'}
        open={!!editModal}
        onCancel={() => setEditModal(null)}
        onOk={handleSave}
        okText="Lưu"
        cancelText="Hủy"
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="maLop" label="Mã lốp (Serial) *" rules={[{ required: true, message: 'Vui lòng nhập mã lốp' }]}>
            <Input placeholder="Nhập mã serial lốp..." />
          </Form.Item>
          <Form.Item name="hangLop" label="Hãng lốp *" rules={[{ required: true }]}>
            <Select options={[
              { value: 'Bridgestone', label: 'Bridgestone' },
              { value: 'Michelin', label: 'Michelin' },
              { value: 'Yokohama', label: 'Yokohama' },
              { value: 'Hankook', label: 'Hankook' },
              { value: 'Kumho', label: 'Kumho' },
              { value: 'Casumina', label: 'Casumina' },
            ]} />
          </Form.Item>
          <Form.Item name="vehicleId" label="Xe lắp đặt">
            <Select showSearch placeholder="Chọn xe..." allowClear filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())} options={vehicles.map(v => ({ value: v.id, label: v.bienSo || v.bien_so }))} />
          </Form.Item>
          <Form.Item name="viTri" label="Vị trí lắp đặt">
            <Select options={[
              { value: 'Bánh trước trái', label: 'Bánh trước trái' },
              { value: 'Bánh trước phải', label: 'Bánh trước phải' },
              { value: 'Bánh sau trái ngoài', label: 'Bánh sau trái ngoài' },
              { value: 'Bánh sau trái trong', label: 'Bánh sau trái trong' },
              { value: 'Bánh sau phải ngoài', label: 'Bánh sau phải ngoài' },
              { value: 'Bánh sau phải trong', label: 'Bánh sau phải trong' },
            ]} />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="ngayLap" label="Ngày lắp">
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item>
            <Form.Item name="ngayThao" label="Ngày tháo (để trống nếu đang dùng)">
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" allowClear />
            </Form.Item>
          </div>
          <Form.Item name="ghiChu" label="Ghi chú">
            <Input.TextArea placeholder="Ghi chú thêm thông tin..." rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

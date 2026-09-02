import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, Select, DatePicker, message, Card, Typography, InputNumber } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import API from '../services/api';
import DB from '../store/db';

const { Title, Text } = Typography;

export default function Repair() {
  const user = DB.getUser();
  const isAdmin = user?.activeRole === 'admin';
  const isNhanVien = user?.activeRole === 'nhanvien';

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editModal, setEditModal] = useState(null); // null | 'new' | repair object
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [vehicles, setVehicles] = useState([]);
  const [form] = Form.useForm();

  const fetchRepairs = async () => {
    setLoading(true);
    try {
      const res = await API.getRepairs();
      const formatted = res.data.map(item => ({
        id: item.id,
        vehicleId: item.vehicle_id || item.vehicleId,
        bienSo: item.bien_so || item.bienSo || (item.vehicle_id ? 'Xe #' + item.vehicle_id : '—'),
        loaiSuaChua: item.loai_sua_chua || item.loaiSuaChua || 'Sửa chữa phanh & động cơ',
        ngaySuaChua: item.ngay_sua_chua || item.ngaySuaChua,
        chiPhi: item.chi_phi || item.chiPhi || 0,
        trangThai: item.trang_thai || item.trangThai || 'dang_sua'
      }));
      setData(formatted);
    } catch (err) {
      console.warn('Lỗi lấy danh sách sửa chữa:', err);
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
    fetchRepairs();
    fetchVehicles();
  }, []);

  const refresh = () => {
    fetchRepairs();
    fetchVehicles();
  };

  const filtered = data.filter(r => {
    const matchStatus = !statusFilter || r.trangThai === statusFilter;
    const matchSearch = !search || 
      (r.bienSo || '').toLowerCase().includes(search.toLowerCase()) || 
      (r.loaiSuaChua || '').toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const openEdit = (repair) => {
    setEditModal(repair || 'new');
    if (repair && repair !== 'new') {
      form.setFieldsValue({
        ...repair,
        vehicleId: repair.vehicleId,
        ngaySuaChua: repair.ngaySuaChua ? dayjs(repair.ngaySuaChua) : null,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ ngaySuaChua: dayjs(), trangThai: 'dang_sua', chiPhi: 0 });
    }
  };

  const handleSave = async () => {
    try {
      const vals = await form.validateFields();
      const payload = {
        ...vals,
        ngaySuaChua: vals.ngaySuaChua ? vals.ngaySuaChua.format('YYYY-MM-DD') : null,
      };
      if (editModal && editModal !== 'new') {
        await API.updateRepair(editModal.id, payload);
        message.success('Cập nhật phiếu sửa chữa thành công!');
      } else {
        await API.createRepair(payload);
        message.success('Tạo phiếu sửa chữa mới thành công!');
      }
      setEditModal(null);
      refresh();
    } catch (err) {
      console.error(err);
      message.error('Lỗi khi lưu thông tin sửa chữa');
    }
  };

  const handleStatusChange = async (record, newStatus) => {
    try {
      const payload = {
        ...record,
        trangThai: newStatus,
        ngaySuaChua: record.ngaySuaChua ? dayjs(record.ngaySuaChua).format('YYYY-MM-DD') : null,
      };
      await API.updateRepair(record.id, payload);
      message.success('Cập nhật trạng thái sửa chữa thành công!');
      refresh();
    } catch (err) {
      console.error(err);
      message.error('Lỗi khi cập nhật trạng thái');
    }
  };

  const handleDelete = (id) => {
    Modal.confirm({
      title: 'Xác nhận xóa phiếu sửa chữa này?',
      content: 'Thông tin sửa chữa xe sẽ bị xóa vĩnh viễn khỏi hệ thống.',
      okText: 'Xóa', okType: 'danger', cancelText: 'Hủy',
      onOk: async () => {
        try {
          await API.deleteRepair(id);
          message.warning('Đã xóa phiếu sửa chữa!');
          refresh();
        } catch (err) {
          message.error('Lỗi khi xóa phiếu sửa chữa');
        }
      }
    });
  };

  const cols = [
    { title: 'Xe', dataIndex: 'bienSo', render: t => <strong>{t}</strong> },
    { title: 'Loại sửa chữa', dataIndex: 'loaiSuaChua' },
    { title: 'Ngày sửa chữa', dataIndex: 'ngaySuaChua', render: d => d ? dayjs(d).format('DD/MM/YYYY') : '—' },
    { title: 'Chi phí', dataIndex: 'chiPhi', render: v => <strong>{Number(v || 0).toLocaleString('vi-VN')} ₫</strong> },
    {
      title: 'Trạng thái',
      dataIndex: 'trangThai',
      render: (s, r) => (
        <Select
          size="small"
          value={s || 'dang_sua'}
          onChange={(val) => handleStatusChange(r, val)}
          style={{ width: 140 }}
          bordered={false}
          options={[
            { value: 'cho_sua', label: <Tag color="warning">Chờ sửa chữa</Tag> },
            { value: 'dang_sua', label: <Tag color="processing">Đang sửa chữa</Tag> },
            { value: 'hoan_thanh', label: <Tag color="success">Hoàn thành</Tag> }
          ]}
        />
      )
    },
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
        <div>
          <Title level={4} style={{ margin: 0 }}>🛠️ Quản lý Sửa chữa xe</Title>
          <Text type="secondary">Theo dõi danh sách & chi phí sửa chữa xe trong đội</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit(null)}>Thêm phiếu sửa chữa</Button>
      </div>
      
      <Card style={{ borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
        <Space style={{ marginBottom: 16, flexWrap: 'wrap' }}>
          <Input.Search placeholder="Tìm theo xe, loại sửa chữa..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 260 }} allowClear />
          <Select
            placeholder="Lọc trạng thái"
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 180 }}
            options={[
              { value: '', label: 'Tất cả trạng thái' },
              { value: 'cho_sua', label: 'Chờ sửa chữa' },
              { value: 'dang_sua', label: 'Đang sửa chữa' },
              { value: 'hoan_thanh', label: 'Hoàn thành' }
            ]}
          />
        </Space>
        <Table dataSource={filtered} columns={cols} rowKey="id" size="small" loading={loading} pagination={{ pageSize: 10 }} />
      </Card>

      <Modal
        title={editModal && editModal !== 'new' ? 'Chỉnh sửa phiếu sửa chữa' : 'Tạo phiếu sửa chữa mới'}
        open={!!editModal}
        onCancel={() => setEditModal(null)}
        onOk={handleSave}
        okText="Lưu phiếu"
        cancelText="Hủy"
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="vehicleId" label="Xe sửa chữa *" rules={[{ required: true, message: 'Vui lòng chọn xe' }]}>
            <Select
              showSearch
              placeholder="Chọn xe..."
              filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
              options={vehicles.map(v => ({ value: v.id, label: `${v.bienSo || v.bien_so} (${v.soMooc || v.so_mooc || 'Không mooc'})` }))}
            />
          </Form.Item>
          <Form.Item name="loaiSuaChua" label="Loại sửa chữa *" rules={[{ required: true, message: 'Vui lòng nhập hạng mục sửa chữa' }]}>
            <Input placeholder="Ví dụ: Thay dầu máy, Sửa phanh, Thay lốp, Đồng sơn..." />
          </Form.Item>
          <Form.Item name="ngaySuaChua" label="Ngày sửa chữa" rules={[{ required: true, message: 'Vui lòng chọn ngày' }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="chiPhi" label="Chi phí sửa chữa (₫)">
            <InputNumber style={{ width: '100%' }} formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={v => v.replace(/\$\s?|(,*)/g, '')} />
          </Form.Item>
          <Form.Item name="trangThai" label="Trạng thái">
            <Select options={[
              { value: 'cho_sua', label: 'Chờ sửa chữa' },
              { value: 'dang_sua', label: 'Đang sửa chữa' },
              { value: 'hoan_thanh', label: 'Hoàn thành' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

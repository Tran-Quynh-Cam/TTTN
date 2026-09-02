import React, { useState, useEffect } from 'react';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { Table, Tag, Card, Typography, Select, Space, Button, Modal, Form, Input, DatePicker, InputNumber, message } from 'antd';
import dayjs from 'dayjs';
import API from '../services/api';
import DB from '../store/db';

const { Title, Text } = Typography;

export default function Maintenance() {
  const user = DB.getUser();
  const isAdmin = user?.activeRole === 'admin';
  const isNhanVien = user?.activeRole === 'nhanvien';
  const canEdit = isAdmin || isNhanVien;

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editModal, setEditModal] = useState(null); // null | 'new' | maintenance object
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [vehicles, setVehicles] = useState([]);
  const [form] = Form.useForm();

  const fetchMaintenance = async () => {
    setLoading(true);
    try {
      const res = await API.getMaintenance();
      const formatted = res.data.map(item => ({
        id: item.id,
        vehicleId: item.vehicle_id || item.vehicleId,
        bienSo: item.bien_so || item.bienSo || (item.vehicle_id ? 'Xe #' + item.vehicle_id : '—'),
        loaiBaoDuong: item.loai_bao_duong || item.loaiBaoDuong || 'Bảo dưỡng định kỳ',
        ngayBaoDuong: item.ngay_bao_duong || item.ngayBaoDuong,
        ngayCanhBao: item.ngay_canh_bao || item.ngayCanhBao,
        chiPhi: item.chi_phi || item.chiPhi || 0,
        trangThai: item.trang_thai || item.trangThai || 'da_bao_duong'
      }));
      setData(formatted);
    } catch (err) {
      console.error('Lỗi tải bảo dưỡng:', err);
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
    fetchMaintenance();
    fetchVehicles();
  }, []);

  const refresh = () => {
    fetchMaintenance();
    fetchVehicles();
  };

  const filtered = data.filter(m => {
    const matchStatus = !statusFilter || m.trangThai === statusFilter;
    const matchSearch = !search || 
      (m.bienSo || '').toLowerCase().includes(search.toLowerCase()) || 
      (m.loaiBaoDuong || '').toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const openEdit = (maintenance) => {
    setEditModal(maintenance || 'new');
    if (maintenance && maintenance !== 'new') {
      form.setFieldsValue({
        ...maintenance,
        vehicleId: maintenance.vehicleId,
        ngayBaoDuong: maintenance.ngayBaoDuong ? dayjs(maintenance.ngayBaoDuong) : null,
        ngayCanhBao: maintenance.ngayCanhBao ? dayjs(maintenance.ngayCanhBao) : null,
      });
    } else {
      form.resetFields();
      const today = dayjs();
      form.setFieldsValue({
        ngayBaoDuong: today,
        ngayCanhBao: today.add(6, 'month'),
        trangThai: 'da_bao_duong',
        chiPhi: 0
      });
    }
  };

  const handleSave = async () => {
    try {
      const vals = await form.validateFields();
      const payload = {
        ...vals,
        ngayBaoDuong: vals.ngayBaoDuong ? vals.ngayBaoDuong.format('YYYY-MM-DD') : null,
        ngayCanhBao: vals.ngayCanhBao ? vals.ngayCanhBao.format('YYYY-MM-DD') : null,
      };
      if (editModal && editModal !== 'new') {
        await API.updateMaintenance(editModal.id, payload);
        message.success('Cập nhật lịch bảo dưỡng thành công!');
      } else {
        await API.createMaintenance(payload);
        message.success('Tạo lịch bảo dưỡng mới thành công!');
      }
      setEditModal(null);
      refresh();
    } catch (err) {
      console.error(err);
      message.error('Lỗi khi lưu thông tin bảo dưỡng');
    }
  };

  const handleStatusChange = async (record, newStatus) => {
    try {
      const payload = {
        ...record,
        trangThai: newStatus,
        ngayBaoDuong: record.ngayBaoDuong ? dayjs(record.ngayBaoDuong).format('YYYY-MM-DD') : null,
        ngayCanhBao: record.ngayCanhBao ? dayjs(record.ngayCanhBao).format('YYYY-MM-DD') : null,
      };
      await API.updateMaintenance(record.id, payload);
      message.success('Cập nhật trạng thái bảo dưỡng thành công!');
      refresh();
    } catch (err) {
      console.error(err);
      message.error('Lỗi khi cập nhật trạng thái');
    }
  };

  const handleDelete = (id) => {
    Modal.confirm({
      title: 'Xác nhận xóa lịch bảo dưỡng này?',
      content: 'Thông tin lịch bảo dưỡng xe sẽ bị xóa vĩnh viễn khỏi hệ thống.',
      okText: 'Xóa', okType: 'danger', cancelText: 'Hủy',
      onOk: async () => {
        try {
          await API.deleteMaintenance(id);
          message.warning('Đã xóa lịch bảo dưỡng!');
          refresh();
        } catch (err) {
          message.error('Lỗi khi xóa lịch bảo dưỡng');
        }
      }
    });
  };

  const STATUS_M = { da_bao_duong: 'success', sap_den_han: 'warning', qua_han: 'error' };

  const cols = [
    { title: 'Biển số xe', dataIndex: 'bienSo', render: t => <strong>{t}</strong> },
    { title: 'Loại bảo dưỡng', dataIndex: 'loaiBaoDuong' },
    { title: 'Ngày bảo dưỡng', dataIndex: 'ngayBaoDuong', render: d => d ? dayjs(d).format('DD/MM/YYYY') : '—' },
    { title: 'Ngày cảnh báo', dataIndex: 'ngayCanhBao', render: d => d ? dayjs(d).format('DD/MM/YYYY') : '—' },
    { title: 'Chi phí', dataIndex: 'chiPhi', render: v => <strong>{Number(v || 0).toLocaleString('vi-VN')} ₫</strong> },
    {
      title: 'Trạng thái',
      dataIndex: 'trangThai',
      render: (s, r) => (
        <Select
          size="small"
          value={s || 'da_bao_duong'}
          disabled={!canEdit}
          onChange={(val) => handleStatusChange(r, val)}
          style={{ width: 140 }}
          bordered={false}
          className={`status-select-${s}`}
          options={[
            { value: 'da_bao_duong', label: <Tag color="success">Đã bảo dưỡng</Tag> },
            { value: 'sap_den_han', label: <Tag color="warning">Sắp đến hạn</Tag> },
            { value: 'qua_han', label: <Tag color="error">Quá hạn</Tag> }
          ]}
        />
      )
    },
    ...(canEdit ? [{
      title: 'Thao tác',
      key: 'actions',
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          {isAdmin && <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r.id)} />}
        </Space>
      )
    }] : [])
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>🔧 Quản lý Bảo dưỡng xe</Title>
          <Text type="secondary">Danh sách phiếu bảo dưỡng & cảnh báo định kỳ</Text>
        </div>
        {canEdit && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit(null)}>Thêm phiếu bảo dưỡng</Button>
        )}
      </div>
      
      <Card style={{ borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
        <Space style={{ marginBottom: 16, flexWrap: 'wrap' }}>
          <Input.Search placeholder="Tìm theo xe, loại bảo dưỡng..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 260 }} allowClear />
          <Select placeholder="Lọc trạng thái" value={statusFilter} onChange={setStatusFilter} style={{ width: 180 }}
            options={[
              { value: '', label: 'Tất cả trạng thái' },
              { value: 'da_bao_duong', label: 'Đã bảo dưỡng' },
              { value: 'sap_den_han', label: 'Sắp đến hạn' },
              { value: 'qua_han', label: 'Quá hạn' }
            ]} />
        </Space>
        <Table dataSource={filtered} columns={cols} rowKey="id" size="small" loading={loading} pagination={{ pageSize: 10 }} />
      </Card>

      <Modal
        title={editModal && editModal !== 'new' ? 'Chỉnh sửa phiếu bảo dưỡng' : 'Tạo phiếu bảo dưỡng mới'}
        open={!!editModal}
        onCancel={() => setEditModal(null)}
        onOk={handleSave}
        okText="Lưu phiếu"
        cancelText="Hủy"
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="vehicleId" label="Xe bảo dưỡng *" rules={[{ required: true, message: 'Vui lòng chọn xe' }]}>
            <Select
              showSearch
              placeholder="Chọn xe..."
              filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
              options={vehicles.map(v => ({ value: v.id, label: `${v.bienSo || v.bien_so} (${v.soMooc || v.so_mooc || 'Không mooc'})` }))}
            />
          </Form.Item>
          <Form.Item name="loaiBaoDuong" label="Loại bảo dưỡng *" rules={[{ required: true, message: 'Vui lòng nhập loại bảo dưỡng' }]}>
            <Input placeholder="Ví dụ: Thay nhớt động cơ định kỳ, Thay lọc gió, Kiểm tra phanh..." />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="ngayBaoDuong" label="Ngày bảo dưỡng" rules={[{ required: true, message: 'Chọn ngày bảo dưỡng' }]}>
              <DatePicker
                style={{ width: '100%' }}
                format="DD/MM/YYYY"
                onChange={(date) => {
                  if (date) {
                    form.setFieldsValue({ ngayCanhBao: dayjs(date).add(6, 'month') });
                  }
                }}
              />
            </Form.Item>
            <Form.Item name="ngayCanhBao" label="Ngày cảnh báo tiếp theo">
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" allowClear />
            </Form.Item>
          </div>
          <Form.Item name="chiPhi" label="Chi phí bảo dưỡng (₫)">
            <InputNumber style={{ width: '100%' }} formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={v => v.replace(/\$\s?|(,*)/g, '')} />
          </Form.Item>
          <Form.Item name="trangThai" label="Trạng thái">
            <Select options={[
              { value: 'da_bao_duong', label: 'Đã bảo dưỡng' },
              { value: 'sap_den_han', label: 'Sắp đến hạn' },
              { value: 'qua_han', label: 'Quá hạn' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

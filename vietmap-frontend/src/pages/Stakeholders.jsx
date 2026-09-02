import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, Select, message, Card, Typography, Tabs } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, FileTextOutlined, UserOutlined, ShoppingOutlined, InboxOutlined, CarOutlined } from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../services/api';
import DB from '../store/db';

const { Title, Text } = Typography;

export default function Stakeholders() {
  const isAdmin = DB.getUser()?.activeRole === 'admin';
  const { type } = useParams();
  const navigate = useNavigate();
  const activeTab = type || 'dieuvans';
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editModal, setEditModal] = useState(null); // null | 'new' | stakeholder object
  const [search, setSearch] = useState('');
  const [form] = Form.useForm();

  const [vehicles, setVehicles] = useState([]);

  // Gọi trực tiếp Backend API lấy dữ liệu từ Supabase PostgreSQL
  const fetchStakeholders = async () => {
    setLoading(true);
    try {
      const [res, vRes] = await Promise.all([
        API.getStakeholders(activeTab).catch(() => ({ data: [] })),
        API.getVehicles().catch(() => ({ data: [] }))
      ]);
      setVehicles(vRes.data || []);
      const formatted = res.data.map(item => ({
        id: item.id,
        type: item.type,
        name: item.name,
        phone: item.phone || '—',
        licenseNo: item.license_no || '—',
        licenseType: item.license_type || '—',
        email: item.email || '—',
        address: item.address || '—',
        company: item.company || '—',
        status: item.status || 'active',
        defaultVehicleId: item.default_vehicle_id,
        defaultVehicleNumber: item.default_vehicle_number,
        defaultVehicleMooc: item.default_vehicle_mooc,
      }));
      setData(formatted);
    } catch (err) {
      console.error('Lỗi tải dữ liệu đối tác:', err);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStakeholders();
  }, [activeTab]);

  const refresh = () => fetchStakeholders();

  const filtered = data.filter(d => 
    (d.name || '').toLowerCase().includes(search.toLowerCase()) || 
    (d.phone || '').includes(search)
  );

  const openEdit = (item) => {
    setEditModal(item || 'new');
    if (item && item !== 'new') {
      form.setFieldsValue(item);
    } else {
      form.resetFields();
      form.setFieldsValue({ status: 'active' });
    }
  };

  const handleSave = async () => {
    try {
      const vals = await form.validateFields();
      const payload = {
        ...vals,
        type: activeTab,
      };
      if (editModal && editModal !== 'new') {
        await API.updateStakeholder(editModal.id, payload);
        message.success('Cập nhật thông tin thành công!');
      } else {
        await API.createStakeholder(payload);
        message.success('Thêm đối tác/nhân sự thành công!');
      }
      setEditModal(null);
      refresh();
    } catch (err) {
      console.error(err);
      message.error('Lỗi khi lưu thông tin');
    }
  };

  const handleDelete = (id) => {
    Modal.confirm({
      title: 'Xác nhận xóa đối tác/nhân viên này?',
      content: 'Thông tin sẽ bị xóa vĩnh viễn khỏi CSDL.',
      okText: 'Xóa', okType: 'danger', cancelText: 'Hủy',
      onOk: async () => {
        try {
          await API.deleteStakeholder(id);
          message.warning('Đã xóa đối tác/nhân viên!');
          refresh();
        } catch (err) {
          message.error('Lỗi khi xóa đối tác/nhân viên');
        }
      }
    });
  };

  const actionsCol = {
    title: 'Thao tác',
    key: 'actions',
    render: (_, r) => (
      <Space size={4}>
        {isAdmin && <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => openEdit(r)} />}
        {isAdmin && <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r.id)} />}
      </Space>
    )
  };

  const colsDriver = [
    { title: 'Họ và tên', dataIndex: 'name', render: t => <strong>{t}</strong> },
    { title: 'Số điện thoại', dataIndex: 'phone' },
    { title: 'Email', dataIndex: 'email' },
    {
      title: 'Xe gán mặc định', key: 'defaultVehicle',
      render: (_, r) => r.defaultVehicleNumber ? (
        <Tag color="cyan">🚛 {r.defaultVehicleNumber} {r.defaultVehicleMooc ? `(${r.defaultVehicleMooc})` : ''}</Tag>
      ) : <Text type="secondary">Chưa gán</Text>
    },
    { title: 'Số GPLX', dataIndex: 'licenseNo' },
    { title: 'Hạng GPLX', dataIndex: 'licenseType', render: t => <Tag color="blue">{t}</Tag> },
    { title: 'Trạng thái', dataIndex: 'status', render: s => <Tag color={s === 'active' ? 'success' : 'default'}>{s === 'active' ? 'Hoạt động' : 'Tạm nghỉ'}</Tag> },
    isAdmin ? actionsCol : null
  ].filter(Boolean);

  const colsGeneral = [
    { title: 'Tên đối tác', dataIndex: 'name', render: t => <strong>{t}</strong> },
    { title: 'Số điện thoại', dataIndex: 'phone' },
    { title: 'Email', dataIndex: 'email' },
    { title: 'Địa chỉ', dataIndex: 'address' },
    { title: 'Công ty', dataIndex: 'company' },
    isAdmin ? actionsCol : null
  ].filter(Boolean);

  const tabNames = {
    dieuvans: 'Điều vận',
    sales: 'Sale',
    senders: 'Bên giao',
    receivers: 'Bên nhận',
    drivers: 'Tài xế',
  };
  const currentTitle = tabNames[activeTab] || 'đối tác & nhân sự';

  const tabItems = [
    { key: 'dieuvans', label: <span><FileTextOutlined /> Điều vận</span> },
    { key: 'sales', label: <span><UserOutlined /> Sale</span> },
    { key: 'senders', label: <span><ShoppingOutlined /> Bên giao</span> },
    { key: 'receivers', label: <span><InboxOutlined /> Bên nhận</span> },
    { key: 'drivers', label: <span><CarOutlined /> Tài xế</span> },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>👥 Quản lý Các bên liên quan</Title>
          <Text type="secondary">Danh sách nhân sự & đối tác doanh nghiệp</Text>
        </div>
        {isAdmin && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit(null)}>
            Thêm {currentTitle} mới
          </Button>
        )}
      </div>

      <Card style={{ borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => navigate(`/stakeholders/${key}`)}
          items={tabItems}
          style={{ marginBottom: 16 }}
        />
        <Input.Search placeholder={`Tìm ${currentTitle} theo tên, SĐT...`} value={search} onChange={e => setSearch(e.target.value)} style={{ width: 280, marginBottom: 16 }} allowClear />
        <Table dataSource={filtered} columns={activeTab === 'drivers' ? colsDriver : colsGeneral} rowKey="id" size="small" loading={loading} pagination={{ pageSize: 10 }} />
      </Card>

      <Modal
        title={editModal && editModal !== 'new' ? 'Chỉnh sửa thông tin' : 'Thêm mới nhân viên/đối tác'}
        open={!!editModal}
        onCancel={() => setEditModal(null)}
        onOk={handleSave}
        okText="Lưu"
        cancelText="Hủy"
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Họ và tên / Tên đối tác *" rules={[{ required: true, message: 'Vui lòng nhập tên' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="Số điện thoại">
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Vui lòng nhập định dạng email hợp lệ' }]}>
            <Input placeholder="vi-du@email.com" />
          </Form.Item>

          {activeTab === 'drivers' ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Form.Item name="licenseNo" label="Số GPLX">
                  <Input />
                </Form.Item>
                <Form.Item name="licenseType" label="Hạng GPLX">
                  <Input placeholder="Ví dụ: FC, C..." />
                </Form.Item>
              </div>
              <Form.Item name="defaultVehicleId" label="Xe gán mặc định">
                <Select
                  showSearch
                  allowClear
                  placeholder="Chọn xe gán cho tài xế..."
                  filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                  options={vehicles.map(v => ({ value: v.id, label: `${v.bienSo || v.bien_so} (${v.soMooc || v.so_mooc || 'Không mooc'})` }))}
                />
              </Form.Item>
              <Form.Item name="status" label="Trạng thái">
                <Select options={[
                  { value: 'active', label: 'Hoạt động' },
                  { value: 'inactive', label: 'Tạm nghỉ' },
                ]} />
              </Form.Item>
            </>
          ) : (
            <>
              <Form.Item name="address" label="Địa chỉ">
                <Input />
              </Form.Item>
              <Form.Item name="company" label="Công ty / Ghi chú liên hệ">
                <Input />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </div>
  );
}

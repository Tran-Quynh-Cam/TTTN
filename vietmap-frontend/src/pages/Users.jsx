import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, Select, Typography, Card, message } from 'antd';
import { UserAddOutlined, EditOutlined, DeleteOutlined, KeyOutlined, SafetyCertificateOutlined, UserOutlined } from '@ant-design/icons';
import DB from '../store/db';
import API from '../services/api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export default function Users() {
  const currentUser = DB.getUser();
  const isAdmin = currentUser?.activeRole === 'admin';

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null); // null | 'new' | user object
  const [form] = Form.useForm();

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await API.getUsers();
      setUsers(res.data || []);
    } catch (err) {
      console.error('Lỗi tải danh sách tài khoản:', err);
      message.error('Lỗi kết nối CSDL!');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const openModal = (userObj) => {
    setModal(userObj || 'new');
    if (userObj && userObj !== 'new') {
      form.setFieldsValue({
        name: userObj.name,
        username: userObj.username,
        role: userObj.role,
        password: ''
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ role: 'nhanvien' });
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (modal && modal !== 'new') {
        // Edit User
        await API.updateUser(modal.id, values);
        message.success('Cập nhật tài khoản thành công!');
      } else {
        // Create New User
        await API.createUser(values);
        message.success('Tạo tài khoản mới thành công!');
      }
      setModal(null);
      fetchUsers();
    } catch (err) {
      console.error(err);
      message.error('Lỗi khi lưu thông tin người dùng');
    }
  };

  const handleDelete = (id, username) => {
    if (username === 'admin') {
      message.error('Không thể xóa tài khoản Quản trị viên tối cao (admin)!');
      return;
    }
    Modal.confirm({
      title: 'Xác nhận xóa tài khoản?',
      content: `Tài khoản ${username} sẽ bị xóa khỏi hệ thống.`,
      okText: 'Xóa', okType: 'danger', cancelText: 'Hủy',
      onOk: async () => {
        try {
          await API.deleteUser(id);
          message.warning('Đã xóa tài khoản!');
          fetchUsers();
        } catch (err) {
          console.error(err);
          message.error('Lỗi khi xóa tài khoản');
        }
      }
    });
  };

  const columns = [
    {
      title: 'ID', dataIndex: 'id', width: 60,
      render: id => <Text type="secondary">#{id}</Text>
    },
    {
      title: 'Họ và tên', dataIndex: 'name',
      render: (t, r) => <b>{t || r.username}</b>
    },
    {
      title: 'Tên đăng nhập', dataIndex: 'username',
      render: u => <Text code style={{ color: '#1677ff', fontWeight: 600 }}>{u}</Text>
    },
    {
      title: 'Vai trò', dataIndex: 'role',
      render: r => r === 'admin'
        ? <Tag color="blue" icon={<SafetyCertificateOutlined />}>Quản trị viên</Tag>
        : <Tag color="green" icon={<UserOutlined />}>Nhân viên</Tag>
    },
    {
      title: 'Ngày tạo', dataIndex: 'created_at',
      render: d => d ? dayjs(d).format('DD/MM/YYYY HH:mm') : '—'
    },
    {
      title: 'Thao tác', key: 'action', width: 120,
      render: (_, r) => isAdmin && (
        <Space size="small">
          <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => openModal(r)} />
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r.id, r.username)} />
        </Space>
      )
    }
  ];

  return (
    <div style={{ animation: 'fadeIn 0.25s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>Quản lý người dùng</Title>
          <Text type="secondary">Quản lý tài khoản đăng nhập và phân quyền hệ thống FleetOS</Text>
        </div>
        {isAdmin && (
          <Button type="primary" icon={<UserAddOutlined />} onClick={() => openModal(null)}>
            Thêm tài khoản
          </Button>
        )}
      </div>

      <Card style={{ borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
        <Table
          dataSource={users}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10, showTotal: t => `Tổng cộng ${t} tài khoản` }}
        />
      </Card>

      {/* Modal Thêm / Sửa User */}
      <Modal
        title={modal && modal !== 'new' ? `Chỉnh sửa tài khoản: ${modal.username}` : 'Tạo tài khoản người dùng mới'}
        open={!!modal}
        onCancel={() => setModal(null)}
        onOk={handleSave}
        okText="Lưu tài khoản"
        cancelText="Hủy"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Họ và tên" rules={[{ required: true, message: 'Nhập họ tên!' }]}>
            <Input placeholder="Ví dụ: Nguyễn Văn A" />
          </Form.Item>
          
          <Form.Item name="username" label="Tên đăng nhập" rules={[{ required: true, message: 'Nhập tên đăng nhập!' }]}>
            <Input placeholder="username" disabled={modal && modal !== 'new'} />
          </Form.Item>

          <Form.Item name="password" label={modal && modal !== 'new' ? 'Mật khẩu mới (Để trống nếu không đổi)' : 'Mật khẩu'}>
            <Input.Password placeholder={modal && modal !== 'new' ? 'Nhập mật khẩu mới...' : 'Mật khẩu mặc định: admin123'} prefix={<KeyOutlined />} />
          </Form.Item>

          <Form.Item name="role" label="Vai trò / Phân quyền" rules={[{ required: true }]}>
            <Select options={[
              { value: 'admin', label: 'Quản trị viên (Admin - Full quyền)' },
              { value: 'nhanvien', label: 'Nhân viên (Xem & Thực hiện công việc)' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

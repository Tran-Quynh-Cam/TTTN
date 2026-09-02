import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, Alert } from 'antd';
import { UserOutlined, LockOutlined, RocketFilled, LoginOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import DB from '../store/db';
import API from '../services/api';

const { Title } = Typography;

export default function Login() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const handleLogin = async (values) => {
    setLoading(true);
    setError('');
    try {
      // Gọi API Backend Node.js / PostgreSQL
      const response = await API.login({ username: values.username, password: values.password });
      const { token, user } = response.data;
      
      // Lưu JWT Token & User Session
      localStorage.setItem('vm_token', token);
      const activeRole = user.role === 'admin' ? 'admin' : 'nhanvien';
      DB.setUser({ ...user, activeRole });
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Tên đăng nhập hoặc mật khẩu không đúng!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 50%, #cbd5e1 100%)',
      position: 'relative', overflow: 'hidden'
    }}>
      {/* Background orbs */}
      <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', background: '#3b82f6', filter: 'blur(120px)', opacity: 0.12, top: -150, right: -100 }} />
      <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', background: '#a855f7', filter: 'blur(120px)', opacity: 0.1, bottom: -100, left: -80 }} />

      <Card
        style={{
          width: 440, borderRadius: 20, background: 'rgba(255, 255, 255, 0.75)',
          backdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.6)',
          boxShadow: '0 20px 40px rgba(15, 23, 42, 0.06)'
        }}
        bodyStyle={{ padding: '40px 36px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28, justifyContent: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#0052CC,#00B8D9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <RocketFilled style={{ fontSize: 20, color: '#fff' }} />
          </div>
          <Title level={3} style={{ margin: 0, color: '#0f172a', fontWeight: 800 }}>Đăng nhập Fleet<span style={{ color: '#0052CC' }}>OS</span></Title>
        </div>

        {error && <Alert message={error} type="error" showIcon style={{ marginBottom: 16, borderRadius: 8 }} />}

        <Form form={form} onFinish={handleLogin} layout="vertical" size="large">
          <Form.Item name="username" label={<span style={{ color: '#475569', fontSize: 13, fontWeight: 500 }}>Tên đăng nhập</span>}
            rules={[{ required: true, message: 'Vui lòng nhập tên đăng nhập!' }]}>
            <Input className="light-input" prefix={<UserOutlined style={{ color: '#64748b' }} />} placeholder="Nhập tên đăng nhập"
              style={{ background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: 10 }} />
          </Form.Item>
          <Form.Item name="password" label={<span style={{ color: '#475569', fontSize: 13, fontWeight: 500 }}>Mật khẩu</span>}
            rules={[{ required: true, message: 'Vui lòng nhập mật khẩu!' }]}>
            <Input.Password className="light-input" prefix={<LockOutlined style={{ color: '#64748b' }} />} placeholder="Nhập mật khẩu"
              style={{ background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: 10 }} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" block size="large" loading={loading}
              style={{ borderRadius: 10, height: 48, fontWeight: 600, fontSize: 15, background: 'linear-gradient(135deg,#0052CC,#0065FF)', border: 'none' }}
              icon={<LoginOutlined />}
            >
              Đăng nhập
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

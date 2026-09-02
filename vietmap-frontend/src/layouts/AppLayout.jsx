import React, { useState, useEffect } from 'react';
import { Layout, Menu, Avatar, Badge, Button, Dropdown, Typography, Drawer, Popover, Tag, Tooltip } from 'antd';
import {
  DashboardOutlined, ShoppingOutlined, TeamOutlined, ToolOutlined,
  CarOutlined, SettingOutlined, BellOutlined, LogoutOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, BuildOutlined, RocketFilled, SafetyCertificateOutlined, UserOutlined,
  FileTextOutlined, InboxOutlined, EnvironmentOutlined, CloseOutlined,
  DollarOutlined, AccountBookOutlined, WalletOutlined, SendOutlined, CheckOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import dayjs from 'dayjs';
import DB from '../store/db';
import API from '../services/api';

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

const NAV = [
  { key: '/dashboard',      icon: <DashboardOutlined />,    label: 'Tổng quan' },
  { key: '/orders',         icon: <ShoppingOutlined />,     label: 'Đơn hàng' },
  { key: '/dispatch',       icon: <SendOutlined />,         label: 'Điều xe' },
  { key: '/expenses',       icon: <DollarOutlined />,       label: 'Chi phí' },
  { key: '/freight',        icon: <AccountBookOutlined />,  label: 'Bảng cước giá' },
  {
    key: '/fleet',
    icon: <CarOutlined />,
    label: 'Đội xe & Thiết bị',
    children: [
      { key: '/vehicles',    label: 'Danh sách xe', icon: <CarOutlined /> },
      { key: '/maintenance', label: 'Bảo dưỡng xe', icon: <ToolOutlined /> },
    ]
  },
  { key: '/locations',      icon: <EnvironmentOutlined />,  label: 'Trạm & Địa điểm' },
  { key: '/stakeholders',   icon: <TeamOutlined />,         label: 'Các bên liên quan' },
  { key: '/users',          icon: <UserOutlined />,         label: 'Quản lý người dùng' },
  { key: '/driver',         icon: <CarOutlined style={{ color: '#52c41a' }} />, label: 'Cổng tài xế (Mobile)' },
];

const MOBILE_BREAKPOINT = 768;

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= MOBILE_BREAKPOINT);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const user = DB.getUser();

  const [notifications, setNotifications] = useState([]);
  const [notifPopoverOpen, setNotifPopoverOpen] = useState(false);
  const [readIds, setReadIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('vm_read_notif_ids') || '[]');
    } catch {
      return [];
    }
  });

  if (!user) { navigate('/login'); return null; }

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      if (!mobile) setDrawerOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (location.pathname === '/users' && user?.activeRole !== 'admin') {
      navigate('/dashboard', { replace: true });
    }
  }, [location.pathname, user, navigate]);

  // Close drawer on navigation
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const loadNotifications = async () => {
    try {
      const [ordersRes, maintRes] = await Promise.allSettled([
        API.getOrders(),
        API.getMaintenance()
      ]);

      const orders = ordersRes.status === 'fulfilled' ? (ordersRes.value.data || []) : [];
      const maintenanceList = maintRes.status === 'fulfilled' ? (maintRes.value.data || []) : [];

      const list = [];

      // 1. Maintenance Notifications
      maintenanceList.forEach(m => {
        const bienSo = m.bien_so || m.bienSo || 'đội xe';
        const loaiBaoDuong = m.loai_bao_duong || m.loaiBaoDuong || 'Bảo dưỡng định kỳ';
        const trangThai = m.trang_thai || m.trangThai || '';
        const ngayCanhBao = m.ngay_canh_bao || m.ngayCanhBao;
        const isOverdue = trangThai === 'qua_han' || (ngayCanhBao && dayjs(ngayCanhBao).isBefore(dayjs(), 'day'));
        const isUpcoming = trangThai === 'sap_den_han' || (ngayCanhBao && dayjs(ngayCanhBao).diff(dayjs(), 'day') <= 7);

        if (isOverdue || isUpcoming) {
          list.push({
            id: `maint_${m.id}`,
            category: 'Bảo dưỡng xe',
            categoryColor: isOverdue ? 'red' : 'orange',
            icon: <ToolOutlined style={{ color: isOverdue ? '#ff4d4f' : '#faad14', fontSize: 16 }} />,
            title: isOverdue ? `Xe ${bienSo} đã quá hạn bảo dưỡng!` : `Xe ${bienSo} sắp đến hạn bảo dưỡng`,
            desc: `Hạng mục: ${loaiBaoDuong} - Hạn: ${ngayCanhBao ? dayjs(ngayCanhBao).format('DD/MM/YYYY') : 'Cần kiểm tra'}`,
            time: ngayCanhBao ? dayjs(ngayCanhBao).format('DD/MM/YYYY') : 'Gần đây',
            targetUrl: '/maintenance'
          });
        }
      });

      // 2 & 3. Orders Notifications
      orders.forEach(o => {
        const soBienNhan = o.so_bien_nhan || o.soBienNhan || `Đơn #${o.id}`;
        const trangThaiThanhToan = o.trang_thai_thanh_toan || o.trangThaiThanhToan || 'chua_thanh_toan';
        const cuocPhi = Number(o.cuoc_phi || o.cuocPhi || o.chi_phi || o.chiPhi || 0);
        const trangThai = o.trang_thai || o.trangThai || '';
        const step = Number(o.buoc_hien_tai || o.step || o.stopsCompleted || (o.da_di_du_diem ? 3 : 0));
        const isRouteCompleted = o.da_di_du_diem || step >= 3 || o.tien_do === 'Hoàn thành' || o.is_completed_route;

        // 2. Unpaid Freight
        if (trangThaiThanhToan === 'chua_thanh_toan' && trangThai !== 'da_huy') {
          list.push({
            id: `unpaid_${o.id}`,
            category: 'Chưa thanh toán',
            categoryColor: 'volcano',
            icon: <DollarOutlined style={{ color: '#ff7a45', fontSize: 16 }} />,
            title: `Đơn hàng ${soBienNhan} chưa thanh toán cước`,
            desc: `Khách chưa thanh toán cước phí: ${cuocPhi > 0 ? cuocPhi.toLocaleString('vi-VN') + ' ₫' : 'Chưa cập nhật cước'}`,
            time: o.ngay_tao ? dayjs(o.ngay_tao).format('DD/MM/YYYY') : 'Gần đây',
            targetUrl: '/freight'
          });
        }

        // 3. Completed 3 points route but unconfirmed status
        if (trangThai !== 'hoan_thanh' && trangThai !== 'da_huy' && (isRouteCompleted || o.da_di_du_3_diem)) {
          list.push({
            id: `unconfirmed_${o.id}`,
            category: 'Cần xác nhận',
            categoryColor: 'blue',
            icon: <SendOutlined style={{ color: '#1677ff', fontSize: 16 }} />,
            title: `Đơn ${soBienNhan} chưa xác nhận hoàn thành`,
            desc: `Xe đã đi đủ 3 điểm (hoàn thành lộ trình) nhưng chưa chuyển trạng thái Hoàn thành`,
            time: o.cap_nhat_luc ? dayjs(o.cap_nhat_luc).format('DD/MM/YYYY') : 'Gần đây',
            targetUrl: '/orders'
          });
        }
      });

      setNotifications(list);
    } catch (err) {
      console.error('Lỗi tải thông báo:', err);
    }
  };

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleMarkAsRead = (id, targetUrl) => {
    setReadIds(prev => {
      if (prev.includes(id)) return prev;
      const updated = [...prev, id];
      localStorage.setItem('vm_read_notif_ids', JSON.stringify(updated));
      return updated;
    });
    setNotifPopoverOpen(false);
    if (targetUrl) {
      navigate(targetUrl);
    }
  };

  const handleQuickRead = (id) => {
    setReadIds(prev => {
      if (prev.includes(id)) return prev;
      const updated = [...prev, id];
      localStorage.setItem('vm_read_notif_ids', JSON.stringify(updated));
      return updated;
    });
  };

  const handleMarkAllAsRead = () => {
    const allIds = notifications.map(n => n.id);
    setReadIds(allIds);
    localStorage.setItem('vm_read_notif_ids', JSON.stringify(allIds));
  };

  const unreadNotifications = notifications.filter(n => !readIds.includes(n.id));
  const unreadCount = unreadNotifications.length;

  const filteredNav = NAV.filter(n => {
    if (n.key === '/users') {
      return user?.activeRole === 'admin';
    }
    return true;
  });

  const notifContent = (
    <div style={{ width: 350, maxWidth: '90vw' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, marginBottom: 8, borderBottom: '1px solid #f0f0f0' }}>
        <div>
          <strong style={{ fontSize: 14 }}>🔔 Thông báo hệ thống</strong>
          {unreadCount > 0 && <Tag color="blue" style={{ marginLeft: 8, borderRadius: 10 }}>{unreadCount} mới</Tag>}
        </div>
        {unreadCount > 0 && (
          <Button type="link" size="small" onClick={handleMarkAllAsRead} style={{ padding: 0, fontSize: 12 }}>
            Đánh dấu tất cả đã đọc
          </Button>
        )}
      </div>

      <div style={{ maxHeight: 380, overflowY: 'auto' }}>
        {unreadNotifications.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#8c8c8c' }}>
            <CheckOutlined style={{ fontSize: 28, color: '#52c41a', marginBottom: 8 }} />
            <div style={{ fontWeight: 500, color: '#595959' }}>Tất cả thông báo đã được xử lý</div>
            <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>Không có thông báo chưa đọc nào</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {unreadNotifications.map(n => (
              <div
                key={n.id}
                onClick={() => handleMarkAsRead(n.id, n.targetUrl)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: '#e6f4ff',
                  border: '1px solid #91caff',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  position: 'relative'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
                  e.currentTarget.style.background = '#bae0ff';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.background = '#e6f4ff';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ marginTop: 2 }}>{n.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Tag color={n.categoryColor} style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>{n.category}</Tag>
                        <span style={{ fontSize: 11, color: '#8c8c8c' }}>{n.time}</span>
                      </div>
                      <Tooltip title="Đánh dấu đã đọc (xóa thông báo này)">
                        <Button
                          type="text"
                          shape="circle"
                          size="small"
                          icon={<CheckOutlined style={{ color: '#52c41a', fontSize: 13 }} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickRead(n.id);
                          }}
                          style={{ width: 22, height: 22, minWidth: 22, marginLeft: 4 }}
                        />
                      </Tooltip>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#262626', marginBottom: 2 }}>
                      {n.title}
                    </div>
                    <div style={{ fontSize: 12, color: '#595959', lineHeight: '1.4' }}>
                      {n.desc}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const userMenu = {
    items: [
      { key: 'info', label: <span><strong>{user.name}</strong><br /><small style={{ color: '#8c8c8c' }}>{user.activeRole === 'admin' ? 'Quản trị viên' : 'Nhân viên'}</small></span>, disabled: true },
      { type: 'divider' },
      { key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất', danger: true },
    ],
    onClick: ({ key }) => { if (key === 'logout') { DB.logout(); navigate('/login'); } }
  };

  // Shared sidebar content
  const sidebarContent = (
    <>
      {/* Logo */}
      <div onClick={() => navigate('/dashboard')} style={{ padding: '18px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden', flexShrink: 0, cursor: 'pointer' }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: 'linear-gradient(135deg,#0052CC,#00B8D9)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <RocketFilled style={{ fontSize: 18, color: '#fff' }} />
        </div>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: 16, whiteSpace: 'nowrap' }}>Fleet<span style={{ color: '#4C9AFF' }}>OS</span></span>
      </div>

      {/* User info */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <Avatar style={{ background: 'linear-gradient(135deg,#0052CC,#00B8D9)', flexShrink: 0 }}>{user.name.charAt(0)}</Avatar>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ color: '#fff', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{user.activeRole === 'admin' ? <><SafetyCertificateOutlined /> Quản trị viên</> : <><UserOutlined /> Nhân viên</>}</div>
        </div>
      </div>

      {/* Navigation */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0' }}>
        <Menu
          theme="dark" mode="inline"
          selectedKeys={[location.pathname]}
          defaultOpenKeys={['/stakeholders']}
          items={filteredNav.map(n => ({
            key: n.key,
            icon: n.icon,
            label: n.label,
            children: n.children
          }))}
          onClick={({ key }) => navigate(key)}
          style={{ background: 'transparent', border: 'none', padding: '0 6px' }}
        />
      </div>

      {/* Logout at bottom */}
      <div style={{ padding: '8px 6px', borderTop: '1px solid rgba(255,255,255,0.07)', background: '#0A1628', flexShrink: 0 }}>
        <Menu theme="dark" mode="inline"
          items={[{ key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất', danger: true }]}
          onClick={() => { DB.logout(); navigate('/login'); }}
          style={{ background: 'transparent', border: 'none' }}
        />
      </div>
    </>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Desktop Sidebar */}
      {!isMobile && (
        <Sider
          collapsible collapsed={collapsed} onCollapse={setCollapsed}
          trigger={null} width={240}
          style={{
            background: '#0A1628',
            position: 'fixed',
            left: 0,
            top: 0,
            height: '100vh',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Logo */}
          <div onClick={() => navigate('/dashboard')} style={{ padding: collapsed ? '18px 8px' : '18px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden', flexShrink: 0, cursor: 'pointer' }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: 'linear-gradient(135deg,#0052CC,#00B8D9)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <RocketFilled style={{ fontSize: 18, color: '#fff' }} />
            </div>
            {!collapsed && <span style={{ color: '#fff', fontWeight: 800, fontSize: 16, whiteSpace: 'nowrap' }}>Fleet<span style={{ color: '#4C9AFF' }}>OS</span></span>}
          </div>

          {/* User info */}
          {!collapsed && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <Avatar style={{ background: 'linear-gradient(135deg,#0052CC,#00B8D9)', flexShrink: 0 }}>{user.name.charAt(0)}</Avatar>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ color: '#fff', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{user.activeRole === 'admin' ? <><SafetyCertificateOutlined /> Quản trị viên</> : <><UserOutlined /> Nhân viên</>}</div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0' }}>
            <Menu
              theme="dark" mode="inline"
              selectedKeys={[location.pathname]}
              defaultOpenKeys={['/stakeholders']}
              items={filteredNav.map(n => ({
                key: n.key,
                icon: n.icon,
                label: n.label,
                children: n.children
              }))}
              onClick={({ key }) => navigate(key)}
              style={{ background: 'transparent', border: 'none', padding: '0 6px' }}
            />
          </div>

          {/* Logout at bottom */}
          <div style={{ padding: '8px 6px', borderTop: '1px solid rgba(255,255,255,0.07)', background: '#0A1628', flexShrink: 0 }}>
            <Menu theme="dark" mode="inline"
              items={[{ key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất', danger: true }]}
              onClick={() => { DB.logout(); navigate('/login'); }}
              style={{ background: 'transparent', border: 'none' }}
            />
          </div>
        </Sider>
      )}

      {/* Mobile Drawer */}
      {isMobile && (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          width={280}
          closeIcon={<CloseOutlined style={{ color: '#fff', fontSize: 16 }} />}
          styles={{
            header: { background: '#0A1628', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '16px' },
            body: { padding: 0, background: '#0A1628', display: 'flex', flexDirection: 'column' },
          }}
          title={
            <div onClick={() => navigate('/dashboard')} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#0052CC,#00B8D9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <RocketFilled style={{ fontSize: 16, color: '#fff' }} />
              </div>
              <span style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>Fleet<span style={{ color: '#4C9AFF' }}>OS</span></span>
            </div>
          }
        >
          {/* User info */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar style={{ background: 'linear-gradient(135deg,#0052CC,#00B8D9)', flexShrink: 0 }}>{user.name.charAt(0)}</Avatar>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{user.name}</div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{user.activeRole === 'admin' ? <><SafetyCertificateOutlined /> Quản trị viên</> : <><UserOutlined /> Nhân viên</>}</div>
            </div>
          </div>

          {/* Navigation */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0' }}>
            <Menu
              theme="dark" mode="inline"
              selectedKeys={[location.pathname]}
              defaultOpenKeys={['/stakeholders']}
              items={filteredNav.map(n => ({
                key: n.key,
                icon: n.icon,
                label: n.label,
                children: n.children
              }))}
              onClick={({ key }) => navigate(key)}
              style={{ background: 'transparent', border: 'none', padding: '0 6px' }}
            />
          </div>

          {/* Logout */}
          <div style={{ padding: '8px 6px', borderTop: '1px solid rgba(255,255,255,0.07)', background: '#0A1628' }}>
            <Menu theme="dark" mode="inline"
              items={[{ key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất', danger: true }]}
              onClick={() => { DB.logout(); navigate('/login'); }}
              style={{ background: 'transparent', border: 'none' }}
            />
          </div>
        </Drawer>
      )}

      <Layout style={{ marginLeft: isMobile ? 0 : (collapsed ? 80 : 240), transition: 'margin-left 0.2s' }}>
        <Header style={{
          background: '#fff', padding: '0 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          position: 'sticky', top: 0, zIndex: 50, gap: 16
        }}>
          <Button type="text" icon={isMobile ? <MenuUnfoldOutlined /> : (collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />)}
            onClick={() => isMobile ? setDrawerOpen(true) : setCollapsed(!collapsed)} style={{ fontSize: 16 }} />

          <div style={{ flex: 1 }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Popover
              content={notifContent}
              trigger="click"
              open={notifPopoverOpen}
              onOpenChange={setNotifPopoverOpen}
              placement="bottomRight"
              arrow={{ pointAtCenter: true }}
            >
              <Badge count={unreadCount} size="small" offset={[-2, 2]}>
                <Button type="text" icon={<BellOutlined style={{ fontSize: 18 }} />} style={{ borderRadius: 8 }} />
              </Badge>
            </Popover>

            <Dropdown menu={userMenu} trigger={['click']} placement="bottomRight">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 8px', borderRadius: 8, transition: 'background 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <Avatar style={{ background: 'linear-gradient(135deg,#0052CC,#00B8D9)' }}>{user.name.charAt(0)}</Avatar>
                {!isMobile && <Text style={{ fontSize: 13, fontWeight: 500 }}>{user.name}</Text>}
              </div>
            </Dropdown>
          </div>
        </Header>

        <Content style={{ margin: isMobile ? 12 : 24, minHeight: 'calc(100vh - 112px)' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

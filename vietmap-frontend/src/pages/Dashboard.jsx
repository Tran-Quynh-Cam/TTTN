import React, { useState, useEffect, useMemo } from 'react';
import { Row, Col, Card, Typography, DatePicker, Button, Space, Progress, Tooltip, Statistic } from 'antd';
import {
  ShoppingOutlined, CheckCircleOutlined, ToolOutlined,
  CarOutlined, DollarOutlined, ReloadOutlined,
  TeamOutlined, ThunderboltOutlined, AlertOutlined, 
  SafetyCertificateOutlined, ProjectOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import API from '../services/api';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const COLORS = {
  primary: '#1677ff',
  success: '#52c41a',
  warning: '#faad14',
  danger: '#ff4d4f',
  purple: '#722ed1',
  cyan: '#13c2c2',
  dark: '#0A1628',
  lightText: '#8c8c8c'
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState(null);
  const [orders, setOrders] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [maint, setMaint] = useState([]);
  const [repairs, setRepairs] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [ordRes, vehRes, drvRes, maintRes] = await Promise.all([
        API.getOrders().catch(() => ({ data: [] })),
        API.getVehicles().catch(() => ({ data: [] })),
        API.getStakeholders('drivers').catch(() => ({ data: [] })),
        API.getMaintenance().catch(() => ({ data: [] })),
      ]);
      setOrders(ordRes.data || []);
      setVehicles(vehRes.data || []);
      setDrivers(drvRes.data || []);
      setMaint(maintRes.data || []);
      setRepairs([]);

      const defaultExpenses = [
        { id: 1, maChiPhi: 'CP-001', bienSo: '15H-096.12', loaiChiPhi: 'nhien_lieu', tenChiPhi: 'Đổ dầu Diesel 200 lít', soTien: 4200000, ngay: '2026-08-30', ghiChu: 'Đổ cây dầu Petrolimex Cảng Cát Lái' },
        { id: 2, maChiPhi: 'CP-002', bienSo: '15H-096.34', loaiChiPhi: 'cau_duong', tenChiPhi: 'Vé trạm BOT Cao tốc Hải Phòng', soTien: 380000, ngay: '2026-08-31', ghiChu: 'ETC tự động trừ' },
        { id: 3, maChiPhi: 'CP-003', bienSo: '15H-096.56', loaiChiPhi: 'ben_bai', tenChiPhi: 'Phí lưu bãi container đêm', soTien: 500000, ngay: '2026-09-01', ghiChu: 'Cảng Tân Cảng Cát Lái' },
        { id: 4, maChiPhi: 'CP-004', bienSo: '15H-096.78', loaiChiPhi: 'sua_chua', tenChiPhi: 'Thay nhớt & lọc phanh', soTien: 2500000, ngay: '2026-09-01', ghiChu: 'Bảo dưỡng định kỳ 10.000km' },
      ];

      const storedExp = localStorage.getItem('fleet_expenses_data');
      if (storedExp) {
        try {
          const parsed = JSON.parse(storedExp);
          setExpenses(parsed.length > 0 ? parsed : defaultExpenses);
        } catch {
          setExpenses(defaultExpenses);
        }
      } else {
        setExpenses(defaultExpenses);
        localStorage.setItem('fleet_expenses_data', JSON.stringify(defaultExpenses));
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const filteredOrders = useMemo(() => {
    if (!dateRange) return orders;
    return orders.filter(o => {
      const d = o.ngay_tao || o.ngayTao;
      return d && d >= dateRange[0].format('YYYY-MM-DD') && d <= dateRange[1].format('YYYY-MM-DD');
    });
  }, [orders, dateRange]);

  const filteredExpenses = useMemo(() => {
    if (!dateRange) return expenses;
    return expenses.filter(e => {
      const d = e.ngay;
      return d && d >= dateRange[0].format('YYYY-MM-DD') && d <= dateRange[1].format('YYYY-MM-DD');
    });
  }, [expenses, dateRange]);

  const stats = useMemo(() => {
    const fo = filteredOrders;
    const totalOrders = fo.length;
    const statuses = {
      chua_bat_dau: fo.filter(o => o.trang_thai === 'chua_bat_dau').length,
      dang_thuc_hien: fo.filter(o => o.trang_thai === 'dang_thuc_hien').length,
      hoan_thanh: fo.filter(o => o.trang_thai === 'hoan_thanh').length,
      tre_chuyen: fo.filter(o => o.trang_thai === 'tre_chuyen').length,
    };

    const totalRevenue = fo.reduce((s, o) => s + Number(o.chi_phi || o.chiPhi || 0), 0);
    const totalExpenses = filteredExpenses.reduce((s, e) => s + Number(e.soTien || 0), 0);
    
    // Expense Breakdown
    const expenseBreakdown = {
      nhien_lieu: filteredExpenses.filter(e => e.loaiChiPhi === 'nhien_lieu').reduce((s, e) => s + Number(e.soTien || 0), 0),
      cau_duong: filteredExpenses.filter(e => e.loaiChiPhi === 'cau_duong').reduce((s, e) => s + Number(e.soTien || 0), 0),
      sua_chua: filteredExpenses.filter(e => e.loaiChiPhi === 'sua_chua').reduce((s, e) => s + Number(e.soTien || 0), 0),
      khac: filteredExpenses.filter(e => !['nhien_lieu', 'cau_duong', 'sua_chua'].includes(e.loaiChiPhi)).reduce((s, e) => s + Number(e.soTien || 0), 0),
    };

    const maintSoon = maint.filter(m => m.trang_thai === 'sap_den_han').length;
    const maintOverdue = maint.filter(m => m.trang_thai === 'qua_han').length;
    
    return {
      totalOrders, statuses, totalRevenue, totalExpenses, expenseBreakdown,
      vehicles: vehicles.length, drivers: drivers.length,
      activeDrivers: new Set(fo.filter(o => o.trang_thai === 'dang_thuc_hien' && o.tai_xe_id).map(o => o.tai_xe_id)).size,
      maintSoon, maintOverdue,
      repairActive: repairs.filter(r => r.trang_thai === 'dang_sua' || r.trang_thai === 'cho_sua').length,
    };
  }, [filteredOrders, filteredExpenses, vehicles, drivers, maint, repairs]);

  // Scorecard Component
  const ScoreCard = ({ title, value, icon, color, suffix, onClick }) => (
    <Card hoverable onClick={onClick} styles={{ body: { padding: '16px 20px' } }} style={{ borderRadius: 12, borderLeft: `5px solid ${color}`, boxShadow: '0 2px 10px rgba(0,0,0,0.04)', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, color: COLORS.lightText, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{title}</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#141414', display: 'flex', alignItems: 'baseline', gap: 4 }}>
            {value} <span style={{ fontSize: 13, color: COLORS.lightText, fontWeight: 500 }}>{suffix}</span>
          </div>
        </div>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: `${color}15`, color: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
          {icon}
        </div>
      </div>
    </Card>
  );

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      {/* POWER BI HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, background: '#fff', padding: '20px 24px', borderRadius: 12, boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, background: 'linear-gradient(135deg, #1677ff, #0958d9)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <ProjectOutlined style={{ fontSize: 24 }} />
          </div>
          <div>
            <Title level={4} style={{ margin: 0, fontWeight: 800 }}>Tổng quan</Title>
          </div>
        </div>
        <Space>
          <RangePicker onChange={setDateRange} format="DD/MM/YYYY" style={{ borderRadius: 8 }} placeholder={['Từ ngày', 'Đến ngày']} />
          <Button type="primary" icon={<ReloadOutlined />} onClick={fetchAll} loading={loading} style={{ borderRadius: 8 }}>Làm mới</Button>
        </Space>
      </div>

      {/* TOP SCORECARDS */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={12} lg={6}><ScoreCard onClick={() => navigate('/orders')} title="Tổng vận đơn" value={stats.totalOrders} suffix="đơn" icon={<ShoppingOutlined />} color={COLORS.primary} /></Col>
        <Col xs={12} sm={12} lg={6}><ScoreCard onClick={() => navigate('/dispatch')} title="Đang vận chuyển" value={stats.statuses.dang_thuc_hien} suffix="chuyến" icon={<ThunderboltOutlined />} color={COLORS.purple} /></Col>
        <Col xs={12} sm={12} lg={6}><ScoreCard onClick={() => navigate('/orders')} title="Hoàn thành" value={stats.statuses.hoan_thanh} suffix="chuyến" icon={<CheckCircleOutlined />} color={COLORS.success} /></Col>
        <Col xs={12} sm={12} lg={6}><ScoreCard onClick={() => navigate('/orders')} title="Trễ chuyến" value={stats.statuses.tre_chuyen} suffix="chuyến" icon={<AlertOutlined />} color={COLORS.danger} /></Col>
      </Row>

      {/* MIDDLE SECTION - CHARTS */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <Card title="Phân bổ Chi phí Vận hành (VNĐ)" styles={{ header: { fontWeight: 800, fontSize: 16 } }} style={{ borderRadius: 12, height: '100%', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: COLORS.lightText, textTransform: 'uppercase', fontWeight: 600 }}>TỔNG DÒNG TIỀN CHI RA</div>
              <div style={{ fontSize: 36, fontWeight: 800, color: '#141414' }}>{stats.totalExpenses.toLocaleString('vi-VN')} <span style={{ fontSize: 16, color: COLORS.lightText, fontWeight: 500 }}>VNĐ</span></div>
            </div>
            
            <div style={{ display: 'flex', width: '100%', height: 28, borderRadius: 14, overflow: 'hidden', marginBottom: 24 }}>
              {stats.totalExpenses === 0 ? <div style={{ width: '100%', background: '#f5f5f5' }} /> : (
                <>
                  <Tooltip title={`Nhiên liệu: ${stats.expenseBreakdown.nhien_lieu.toLocaleString('vi-VN')} ₫`}><div style={{ width: `${(stats.expenseBreakdown.nhien_lieu/stats.totalExpenses)*100}%`, background: COLORS.primary, transition: 'width 0.5s' }} /></Tooltip>
                  <Tooltip title={`Cầu đường: ${stats.expenseBreakdown.cau_duong.toLocaleString('vi-VN')} ₫`}><div style={{ width: `${(stats.expenseBreakdown.cau_duong/stats.totalExpenses)*100}%`, background: COLORS.warning, transition: 'width 0.5s' }} /></Tooltip>
                  <Tooltip title={`Sửa chữa: ${stats.expenseBreakdown.sua_chua.toLocaleString('vi-VN')} ₫`}><div style={{ width: `${(stats.expenseBreakdown.sua_chua/stats.totalExpenses)*100}%`, background: COLORS.danger, transition: 'width 0.5s' }} /></Tooltip>
                  <Tooltip title={`Khác: ${stats.expenseBreakdown.khac.toLocaleString('vi-VN')} ₫`}><div style={{ width: `${(stats.expenseBreakdown.khac/stats.totalExpenses)*100}%`, background: COLORS.lightText, transition: 'width 0.5s' }} /></Tooltip>
                </>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div style={{ borderLeft: `4px solid ${COLORS.primary}`, paddingLeft: 12, background: '#f5f7fa', padding: '12px 12px 12px 16px', borderRadius: '0 8px 8px 0' }}>
                <div style={{ fontSize: 12, color: COLORS.lightText, fontWeight: 600 }}>NHIÊN LIỆU (DẦU)</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{stats.expenseBreakdown.nhien_lieu.toLocaleString('vi-VN')} ₫</div>
              </div>
              <div style={{ borderLeft: `4px solid ${COLORS.warning}`, paddingLeft: 12, background: '#f5f7fa', padding: '12px 12px 12px 16px', borderRadius: '0 8px 8px 0' }}>
                <div style={{ fontSize: 12, color: COLORS.lightText, fontWeight: 600 }}>CẦU ĐƯỜNG (BOT)</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{stats.expenseBreakdown.cau_duong.toLocaleString('vi-VN')} ₫</div>
              </div>
              <div style={{ borderLeft: `4px solid ${COLORS.danger}`, paddingLeft: 12, background: '#f5f7fa', padding: '12px 12px 12px 16px', borderRadius: '0 8px 8px 0' }}>
                <div style={{ fontSize: 12, color: COLORS.lightText, fontWeight: 600 }}>SỬA CHỮA & BẢO DƯỠNG</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{stats.expenseBreakdown.sua_chua.toLocaleString('vi-VN')} ₫</div>
              </div>
              <div style={{ borderLeft: `4px solid ${COLORS.lightText}`, paddingLeft: 12, background: '#f5f7fa', padding: '12px 12px 12px 16px', borderRadius: '0 8px 8px 0' }}>
                <div style={{ fontSize: 12, color: COLORS.lightText, fontWeight: 600 }}>CHI PHÍ KHÁC</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{stats.expenseBreakdown.khac.toLocaleString('vi-VN')} ₫</div>
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Phân tích Tình trạng Đơn hàng" styles={{ header: { fontWeight: 800, fontSize: 16 } }} style={{ borderRadius: 12, height: '100%', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
             <Row align="middle" gutter={32}>
               <Col span={10} style={{ textAlign: 'center' }}>
                 <Progress 
                    type="dashboard" 
                    percent={stats.totalOrders > 0 ? Math.round((stats.statuses.hoan_thanh/stats.totalOrders)*100) : 0} 
                    strokeColor={COLORS.success}
                    size={200}
                    format={p => <div><div style={{fontSize: 40, fontWeight: 800, color: '#141414'}}>{p}%</div><div style={{fontSize: 14, color: COLORS.lightText, fontWeight: 600}}>HOÀN THÀNH</div></div>}
                  />
               </Col>
               <Col span={14}>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, borderBottom: '1px dashed #e8e8e8' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{width: 14, height: 14, borderRadius: '50%', background: COLORS.success, boxShadow: `0 0 8px ${COLORS.success}80`}} /> <Text strong style={{ fontSize: 15 }}>Đã hoàn thành</Text></div>
                      <Text strong style={{ fontSize: 16 }}>{stats.statuses.hoan_thanh} đơn</Text>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, borderBottom: '1px dashed #e8e8e8' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{width: 14, height: 14, borderRadius: '50%', background: COLORS.purple, boxShadow: `0 0 8px ${COLORS.purple}80`}} /> <Text strong style={{ fontSize: 15 }}>Đang vận chuyển</Text></div>
                      <Text strong style={{ fontSize: 16 }}>{stats.statuses.dang_thuc_hien} đơn</Text>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, borderBottom: '1px dashed #e8e8e8' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{width: 14, height: 14, borderRadius: '50%', background: COLORS.danger, boxShadow: `0 0 8px ${COLORS.danger}80`}} /> <Text strong style={{ fontSize: 15 }}>Trễ chuyến / Sự cố</Text></div>
                      <Text strong style={{ fontSize: 16 }}>{stats.statuses.tre_chuyen} đơn</Text>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{width: 14, height: 14, borderRadius: '50%', background: COLORS.lightText}} /> <Text strong style={{ fontSize: 15 }}>Chưa bắt đầu</Text></div>
                      <Text strong style={{ fontSize: 16 }}>{stats.statuses.chua_bat_dau} đơn</Text>
                    </div>
                 </div>
               </Col>
             </Row>
          </Card>
        </Col>
      </Row>

      {/* BOTTOM SECTION - FLEET & ASSETS */}
      <Title level={5} style={{ marginBottom: 16, marginTop: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: '#595959' }}>Năng lực Cốt lõi & Quản trị Tài sản</Title>
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={8} lg={6}>
          <Card hoverable onClick={() => navigate('/vehicles')} style={{ borderRadius: 12, background: 'linear-gradient(135deg, #e6f4ff, #bae0ff)', border: 'none', boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
             <Statistic title={<span style={{ fontWeight: 600, color: '#0958d9' }}>TỔNG PHƯƠNG TIỆN</span>} value={stats.vehicles} prefix={<CarOutlined />} valueStyle={{ fontWeight: 800, color: COLORS.primary, fontSize: 32 }} />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={6}>
          <Card hoverable onClick={() => navigate('/stakeholders/drivers')} style={{ borderRadius: 12, background: 'linear-gradient(135deg, #f6ffed, #d9f7be)', border: 'none', boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
             <Statistic title={<span style={{ fontWeight: 600, color: '#389e0d' }}>TÀI XẾ ĐANG HOẠT ĐỘNG</span>} value={`${stats.activeDrivers}/${stats.drivers}`} prefix={<TeamOutlined />} valueStyle={{ fontWeight: 800, color: COLORS.success, fontSize: 32 }} />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={6}>
          <Card hoverable onClick={() => navigate('/maintenance')} style={{ borderRadius: 12, background: 'linear-gradient(135deg, #fff2e8, #ffd8bf)', border: 'none', boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
             <Statistic title={<span style={{ fontWeight: 600, color: '#d46b08' }}>XE SẮP/QUÁ BẢO DƯỠNG</span>} value={stats.maintSoon + stats.maintOverdue} prefix={<ToolOutlined />} valueStyle={{ fontWeight: 800, color: COLORS.warning, fontSize: 32 }} />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={6}>
          <Card hoverable onClick={() => navigate('/repair')} style={{ borderRadius: 12, background: 'linear-gradient(135deg, #fff0f6, #ffd6e7)', border: 'none', boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
             <Statistic title={<span style={{ fontWeight: 600, color: '#c41d7f' }}>PHIẾU SỬA CHỮA ĐANG LÀM</span>} value={stats.repairActive} prefix={<SafetyCertificateOutlined />} valueStyle={{ fontWeight: 800, color: '#eb2f96', fontSize: 32 }} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import viVN from 'antd/locale/vi_VN';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import Dispatch from './pages/Dispatch';
import Expenses from './pages/Expenses';
import Freight from './pages/Freight';
import DriverPayroll from './pages/DriverPayroll';
import Stakeholders from './pages/Stakeholders';
import Users from './pages/Users';
import Vehicles from './pages/Vehicles';
import Maintenance from './pages/Maintenance';
import Locations from './pages/Locations';
import DriverPortal from './pages/DriverPortal';
import DB from './store/db';

dayjs.locale('vi');

function ProtectedRoute({ children }) {
  const user = DB.getUser();
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <ConfigProvider
      locale={viVN}
      theme={{
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 8,
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        },
        components: {
          Layout: { siderBg: '#0A1628', triggerBg: '#0d1f3c' },
          Menu: {
            darkItemBg: 'transparent', darkSubMenuItemBg: 'transparent',
            darkItemSelectedBg: 'rgba(22,119,255,0.8)',
            darkItemHoverBg: 'rgba(255,255,255,0.07)',
          },
        },
      }}
    >
      <AntApp>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/driver" element={<DriverPortal />} />
            <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard"      element={<Dashboard />} />
              <Route path="orders"         element={<Orders />} />
              <Route path="dispatch"       element={<Dispatch />} />
              <Route path="expenses"       element={<Expenses />} />
              <Route path="freight"        element={<Freight />} />
              <Route path="locations"      element={<Locations />} />
              <Route path="stakeholders"       element={<Stakeholders />} />
              <Route path="stakeholders/:type" element={<Stakeholders />} />
              <Route path="vehicles"       element={<Vehicles />} />
              <Route path="maintenance"    element={<Maintenance />} />
              <Route path="users"          element={<Users />} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}

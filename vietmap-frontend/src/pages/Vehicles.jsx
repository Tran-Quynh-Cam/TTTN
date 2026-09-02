import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, Select, DatePicker, message, Card, Typography, InputNumber } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, FileExcelOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';

import API from '../services/api';
import DB from '../store/db';

const { Title, Text } = Typography;

export default function Vehicles() {
  const isAdmin = DB.getUser()?.activeRole === 'admin';
  const [data, setData] = useState([]);
  const [editModal, setEditModal] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  // ----------------------------------------------------
  // HÀM LOAD DANH SÁCH XE TRỰC TIẾP TỪ POSTGRESQL BACKEND
  // ----------------------------------------------------
  const fetchVehiclesFromBackend = async () => {
    setLoading(true);
    try {
      const res = await API.get('/vehicles');
      // Chuyển đổi định dạng cột từ PostgreSQL (snake_case) sang camelCase cho UI
      const formattedList = res.data.map(v => ({
        id: v.id,
        bienSo: v.plate_number || v.bienSo || '—',
        hangXe: v.vehicle_type || v.hangXe || 'Khác',
        soMooc: v.notes || v.soMooc || '—',
        khoiLuong: v.max_payload || v.khoiLuong || 15000
      }));
      setData(formattedList);
    } catch (err) {
      console.error('Lỗi lấy danh sách xe từ PostgreSQL:', err);
      message.error('Không thể kết nối CSDL PostgreSQL');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVehiclesFromBackend();
  }, []);

  const filtered = data.filter(v => 
    (v.bienSo || '').toLowerCase().includes(search.toLowerCase()) || 
    (v.hangXe || '').toLowerCase().includes(search.toLowerCase())
  );

  const openEdit = (item) => { 
    setEditModal(item || 'new'); 
    item && item !== 'new' ? form.setFieldsValue(item) : form.resetFields(); 
  };

  const handleSave = async () => {
    try {
      const v = await form.validateFields();
      if (editModal && editModal !== 'new') {
        await API.updateVehicle(editModal.id, v);
      } else {
        await API.createVehicle(v);
      }
      message.success('Lưu xe thành công!'); 
      setEditModal(null); 
      fetchVehiclesFromBackend();
    } catch (err) {
      console.error(err);
      message.error('Lỗi khi lưu dữ liệu xe');
    }
  };

  // ----------------------------------------------------
  // HÀM ĐỌC EXCEL & LƯU VÀO DATABASE
  // ----------------------------------------------------
  const handleImportExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawData = XLSX.utils.sheet_to_json(ws);

        if (rawData.length === 0) {
          message.warning('File Excel không có dữ liệu!');
          setLoading(false);
          return;
        }

        const vehicleList = [];
        rawData.forEach(row => {
          const bienSo = row['plate_no'] || row['clean_plate'] || row['Biển số xe'] || row['Biển số'] || row['bienSo'] || row['BienSo'];
          if (bienSo) {
            const vehicleItem = {
              bienSo: String(bienSo).trim(),
              soMooc: row['model_type'] || row['frame_number'] || row['Số mooc'] || row['Mooc'] || row['soMooc'] || '',
              hangXe: row['brand'] || row['Hãng xe'] || row['Hãng'] || row['hangXe'] || 'Khác',
              khoiLuong: Number(row['gross_weight'] || row['payload'] || row['Khối lượng'] || row['khoiLuong'] || 15000)
            };
            vehicleList.push(vehicleItem);
          }
        });

        // 🚀 BẮN DỮ LIỆU ĐỂ POSTGRESQL DATABASE LƯU VÀO ĐĨA CỨNG
        const res = await API.post('/vehicles/batch', { vehicles: vehicleList });
        message.success(res.data?.message || `Đã nhập thành công ${vehicleList.length} xe!`);
        
        // Tải lại dữ liệu trực tiếp từ PostgreSQL Database
        fetchVehiclesFromBackend();
      } catch (err) {
        console.error(err);
        message.error('Lỗi khi nhập file Excel!');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const cols = [
    { title: 'Biển số xe', dataIndex: 'bienSo', render: t => <strong style={{ color: '#1677ff' }}>{t}</strong> },
    { title: 'Số mooc/rơmoóc', dataIndex: 'soMooc' },
    { title: 'Hãng xe', dataIndex: 'hangXe', render: t => <Tag color="blue">{t}</Tag> },
    { title: 'Khối lượng toàn bộ (kg)', dataIndex: 'khoiLuong', render: v => Number(v || 0).toLocaleString('vi-VN') },
    isAdmin ? {
      title: 'Thao tác',
      key: 'actions',
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => {
              Modal.confirm({
                title: 'Xóa xe?',
                okType: 'danger',
                okText: 'Xóa',
                cancelText: 'Hủy',
                onOk: async () => {
                  try {
                    await API.deleteVehicle(r.id);
                    fetchVehiclesFromBackend();
                    message.warning('Đã xóa!');
                  } catch {
                    message.error('Lỗi khi xóa xe!');
                  }
                }
              });
            }}
          />
        </Space>
      )
    } : null
  ].filter(Boolean);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div><Title level={4} style={{ margin: 0 }}>Danh sách xe</Title></div>
        <Space>
          {isAdmin && (
            <>
              <input
                type="file"
                id="excel-upload"
                accept=".xlsx, .xls, .csv"
                style={{ display: 'none' }}
                onChange={handleImportExcel}
              />
              <Button
                loading={loading}
                icon={<FileExcelOutlined style={{ color: '#52c41a' }} />}
                onClick={() => document.getElementById('excel-upload').click()}
              >
                Nhập Excel
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit(null)}>
                Thêm xe
              </Button>
            </>
          )}
        </Space>
      </div>

      <Card style={{ borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
        <Input.Search placeholder="Tìm biển số, hãng xe..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 280, marginBottom: 16 }} allowClear />
        <Table dataSource={filtered} columns={cols} rowKey="id" size="small" loading={loading} pagination={{ pageSize: 10 }} />
      </Card>

      <Modal title={editModal !== 'new' && editModal ? 'Chỉnh sửa xe' : 'Thêm xe mới'} open={!!editModal} onCancel={() => setEditModal(null)} onOk={handleSave} okText="Lưu" cancelText="Hủy">
        <Form form={form} layout="vertical">
          <Form.Item name="bienSo" label="Biển số xe *" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="soMooc" label="Số mooc/rơmoóc"><Input /></Form.Item>
          <Form.Item name="hangXe" label="Hãng xe"><Input /></Form.Item>
          <Form.Item name="khoiLuong" label="Khối lượng toàn bộ (kg)"><InputNumber style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

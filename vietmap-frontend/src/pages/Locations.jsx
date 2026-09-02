import React, { useState, useEffect, useRef } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, InputNumber, Card, Typography, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EnvironmentOutlined } from '@ant-design/icons';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import API from '../services/api';
import DB from '../store/db';

const { Title, Text } = Typography;

export default function Locations() {
  const isAdmin = DB.getUser()?.activeRole === 'admin';
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editModal, setEditModal] = useState(null); // null | 'new' | location object
  const [search, setSearch] = useState('');
  const [form] = Form.useForm();

  // Leaflet map references in modal
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const mapContainerRef = useRef(null);

  const fetchLocations = async () => {
    setLoading(true);
    try {
      const res = await API.getLocations();
      setData(res.data || []);
    } catch (err) {
      console.error('Lỗi lấy danh sách địa điểm:', err);
      message.error('Không thể tải danh sách địa điểm.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLocations();
  }, []);

  const refresh = () => {
    fetchLocations();
  };

  const filtered = data.filter(loc =>
    (loc.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (loc.address || '').toLowerCase().includes(search.toLowerCase())
  );

  const openEdit = (loc) => {
    setEditModal(loc || 'new');
    if (loc && loc !== 'new') {
      form.setFieldsValue({
        name: loc.name,
        address: loc.address,
        latitude: Number(loc.latitude),
        longitude: Number(loc.longitude),
        geofence_radius: loc.geofence_radius || 200
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        latitude: 10.7769,
        longitude: 106.7694,
        geofence_radius: 200
      });
    }
  };

  // Initialize Map when modal is opened and ref is available
  useEffect(() => {
    if (!editModal) {
      // Clean up map when modal closes
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
      return;
    }

    // Set a tiny timeout to ensure Modal DOM is fully rendered
    const timer = setTimeout(() => {
      if (!mapContainerRef.current) return;

      const initLat = form.getFieldValue('latitude') || 10.7769;
      const initLng = form.getFieldValue('longitude') || 106.7694;

      if (!mapRef.current) {
        const map = L.map(mapContainerRef.current).setView([initLat, initLng], 13);
        mapRef.current = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        const marker = L.marker([initLat, initLng], { draggable: true }).addTo(map);
        markerRef.current = marker;

        // Sync form coordinates when marker is dragged
        marker.on('dragend', () => {
          const latLng = marker.getLatLng();
          form.setFieldsValue({
            latitude: Number(latLng.lat.toFixed(6)),
            longitude: Number(latLng.lng.toFixed(6))
          });
        });

        // Click on map to move marker
        map.on('click', (e) => {
          const latLng = e.latlng;
          marker.setLatLng(latLng);
          form.setFieldsValue({
            latitude: Number(latLng.lat.toFixed(6)),
            longitude: Number(latLng.lng.toFixed(6))
          });
        });
      } else {
        // Map already exists, just update view and marker
        mapRef.current.setView([initLat, initLng], 13);
        if (markerRef.current) {
          markerRef.current.setLatLng([initLat, initLng]);
        }
        mapRef.current.invalidateSize();
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [editModal]);

  // Handle manual coordinate inputs to move the marker
  const handleCoordChange = () => {
    const lat = form.getFieldValue('latitude');
    const lng = form.getFieldValue('longitude');
    if (lat && lng && mapRef.current && markerRef.current) {
      const parsedLat = Number(lat);
      const parsedLng = Number(lng);
      if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
        markerRef.current.setLatLng([parsedLat, parsedLng]);
        mapRef.current.panTo([parsedLat, parsedLng]);
      }
    }
  };

  const handleSave = async () => {
    try {
      const vals = await form.validateFields();
      if (editModal && editModal !== 'new') {
        await API.updateLocation(editModal.id, vals);
        message.success('Cập nhật địa điểm thành công!');
      } else {
        await API.createLocation(vals);
        message.success('Thêm địa điểm thành công!');
      }
      setEditModal(null);
      refresh();
    } catch (err) {
      console.error(err);
      message.error('Lỗi khi lưu thông tin địa điểm');
    }
  };

  const handleDelete = (id) => {
    Modal.confirm({
      title: 'Xác nhận xóa địa điểm này?',
      content: 'Thông tin trạm này sẽ bị xóa khỏi hệ thống.',
      okText: 'Xóa', okType: 'danger', cancelText: 'Hủy',
      onOk: async () => {
        try {
          await API.deleteLocation(id);
          message.warning('Đã xóa địa điểm!');
          refresh();
        } catch (err) {
          message.error('Lỗi khi xóa địa điểm');
        }
      }
    });
  };

  const cols = [
    { title: 'Tên địa điểm', dataIndex: 'name', render: t => <strong style={{ color: '#1677ff' }}>{t}</strong> },
    { title: 'Địa chỉ chi tiết', dataIndex: 'address' },
    { title: 'Tọa độ GPS', key: 'coords', render: (_, r) => <span>{r.latitude}, {r.longitude}</span> },
    { title: 'Bán kính Geofence', dataIndex: 'geofence_radius', render: r => <Tag color="geekblue">{r} mét</Tag> },
    isAdmin ? {
      title: 'Thao tác',
      key: 'actions',
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r.id)} />
        </Space>
      )
    } : null
  ].filter(Boolean);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>Quản lý địa điểm / Trạm</Title>

        </div>
        {isAdmin && <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit(null)}>Thêm địa điểm mới</Button>}
      </div>

      <Card style={{ borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
        <Input.Search
          placeholder="Tìm theo tên trạm, địa chỉ..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: 300, marginBottom: 16 }}
          allowClear
        />
        <Table
          dataSource={filtered}
          columns={cols}
          rowKey="id"
          size="small"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title={editModal && editModal !== 'new' ? 'Chỉnh sửa địa điểm' : 'Thêm địa điểm mới'}
        open={!!editModal}
        onCancel={() => setEditModal(null)}
        onOk={handleSave}
        okText="Lưu"
        cancelText="Hủy"
        width={750}
        forceRender
      >
        <Form form={form} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <Form.Item name="name" label="Tên địa điểm *" rules={[{ required: true, message: 'Vui lòng nhập tên địa điểm' }]}>
                <Input placeholder="Ví dụ: Cảng Cát Lái, Kho Samsung..." />
              </Form.Item>
              <Form.Item name="address" label="Địa chỉ chi tiết *" rules={[{ required: true, message: 'Vui lòng nhập địa chỉ' }]}>
                <Input.TextArea placeholder="Nhập địa chỉ cụ thể..." rows={3} />
              </Form.Item>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 12px 1fr', gap: 0, alignItems: 'center' }}>
                <Form.Item name="latitude" label="Vĩ độ (Lat) *" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                  <InputNumber style={{ width: '100%' }} step={0.0001} onChange={handleCoordChange} />
                </Form.Item>
                <div style={{ width: 12 }} />
                <Form.Item name="longitude" label="Kinh độ (Lng) *" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                  <InputNumber style={{ width: '100%' }} step={0.0001} onChange={handleCoordChange} />
                </Form.Item>
              </div>
              <Form.Item name="geofence_radius" label="Bán kính Geofence (mét)" style={{ marginTop: 24 }}>
                <InputNumber style={{ width: '100%' }} min={50} max={2000} />
              </Form.Item>
            </div>
            
            <div>
              <div style={{ fontWeight: 500, marginBottom: 8 }}>📌 Chọn vị trí trên bản đồ</div>
              <div 
                ref={mapContainerRef} 
                style={{ 
                  height: 310, 
                  borderRadius: 8, 
                  border: '1px solid #d9d9d9',
                  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)',
                  position: 'relative',
                  zIndex: 1
                }} 
              />
              <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                <EnvironmentOutlined style={{ color: '#1677ff' }} />
                <span>Kéo thả ghim đỏ hoặc click chuột trên bản đồ để cập nhật tọa độ chuẩn.</span>
              </div>
            </div>
          </div>
        </Form>
      </Modal>
    </div>
  );
}

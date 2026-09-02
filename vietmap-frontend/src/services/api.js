import axios from 'axios';
import { io } from 'socket.io-client';

// Cấu hình URL động hỗ trợ cả Môi trường Phát triển (Local) & Deploy Sản phẩm (Production)
const rawApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const cleanApiUrl = rawApiUrl.replace(/\/$/, '');

const API_BASE_URL = cleanApiUrl.endsWith('/api') ? cleanApiUrl : `${cleanApiUrl}/api`;
const SOCKET_URL = cleanApiUrl.replace(/\/api$/, '');

// 1. AXIOS CLIENT VỚI JWT AUTH INTERCEPTOR
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Đính kèm token JWT vào mọi Request nếu có
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('vm_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => Promise.reject(error));

// 2. SOCKET.IO REALTIME ENGINE
export const socket = io(SOCKET_URL, {
  autoConnect: true,
  transports: ['websocket', 'polling'],
});

socket.on('connect', () => {
  console.log('📡 Connected to VietMap Backend Realtime Socket Server');
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from Realtime Socket Server');
});

// 3. EXPORT HÀM GỌI API CHO DỰ ÁN
export const API = {
  // Generic Axios client access
  get: (url, config) => apiClient.get(url, config),
  post: (url, data, config) => apiClient.post(url, data, config),
  put: (url, data, config) => apiClient.put(url, data, config),
  delete: (url, config) => apiClient.delete(url, config),

  // Auth
  login: (credentials) => apiClient.post('/auth/login', credentials),
  
  // Orders
  getOrders: () => apiClient.get('/orders'),
  getOrderById: (id) => apiClient.get(`/orders/${id}`),
  createOrder: (data) => apiClient.post('/orders', data),
  updateOrder: (id, data) => apiClient.put(`/orders/${id}`, data),
  deleteOrder: (id) => apiClient.delete(`/orders/${id}`),
  getOrderHistory: () => apiClient.get('/orders/history'),
  sendOrderEmail: (id) => apiClient.post(`/orders/${id}/send-email`),

  // Vehicles
  getVehicles: () => apiClient.get('/vehicles'),
  createVehicle: (data) => apiClient.post('/vehicles', data),
  updateVehicle: (id, data) => apiClient.put(`/vehicles/${id}`, data),
  deleteVehicle: (id) => apiClient.delete(`/vehicles/${id}`),

  // Stakeholders
  getStakeholders: (type) => apiClient.get(`/stakeholders${type ? `?type=${type}` : ''}`),
  createStakeholder: (data) => apiClient.post('/stakeholders', data),
  updateStakeholder: (id, data) => apiClient.put(`/stakeholders/${id}`, data),
  deleteStakeholder: (id) => apiClient.delete(`/stakeholders/${id}`),

  // Maintenance
  getMaintenance: () => apiClient.get('/maintenance'),
  createMaintenance: (data) => apiClient.post('/maintenance', data),
  updateMaintenance: (id, data) => apiClient.put(`/maintenance/${id}`, data),
  deleteMaintenance: (id) => apiClient.delete(`/maintenance/${id}`),


  // Stubs for removed modules
  getTires: () => Promise.resolve({ data: [] }),
  getRepairs: () => Promise.resolve({ data: [] }),

  getUsers: () => apiClient.get('/users'),
  createUser: (data) => apiClient.post('/users', data),
  updateUser: (id, data) => apiClient.put(`/users/${id}`, data),
  deleteUser: (id) => apiClient.delete(`/users/${id}`),

  // Locations Management
  getLocations: () => apiClient.get('/locations'),
  createLocation: (data) => apiClient.post('/locations', data),
  updateLocation: (id, data) => apiClient.put(`/locations/${id}`, data),
  deleteLocation: (id) => apiClient.delete(`/locations/${id}`),

  // Documents Management
  getDocuments: () => apiClient.get('/documents'),
  createDocument: (data) => apiClient.post('/documents', data),
  deleteDocument: (id) => apiClient.delete(`/documents/${id}`),
};

export default API;

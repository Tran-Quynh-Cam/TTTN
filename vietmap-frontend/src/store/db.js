// ============================================================
// FleetOS — Client Auth & Session Store
// Quản lý phiên làm việc, Token & Thông tin Người dùng (Production)
// ============================================================

const DB = {
  // Lấy thông tin người dùng hiện tại từ localStorage
  getUser: () => {
    try {
      const u = localStorage.getItem('vm_user');
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  },

  // Lưu thông tin người dùng hiện tại
  setUser: (u) => {
    localStorage.setItem('vm_user', JSON.stringify(u));
  },

  // Lấy JWT Token
  getToken: () => localStorage.getItem('vm_token') || '',

  // Lưu JWT Token
  setToken: (token) => localStorage.setItem('vm_token', token),

  // Đăng xuất: Xóa toàn bộ Session & Token
  logout: () => {
    localStorage.removeItem('vm_user');
    localStorage.removeItem('vm_token');
    localStorage.removeItem('activeRole');
  },

  // Fallback an toàn cho hệ thống (Không dùng Mock Data)
  getAll: () => [],
  getById: () => null,
  add: () => null,
  update: () => null,
  del: () => null,
};

export default DB;

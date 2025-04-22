// 根据当前环境确定API基础URL
const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';

// 导出配置
window.APP_CONFIG = {
    API_BASE_URL
};
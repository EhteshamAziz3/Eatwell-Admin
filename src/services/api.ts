
import axios from 'axios';

export const API_BASE_URL =
  'https://eat-well-5924.onrender.com/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default api;

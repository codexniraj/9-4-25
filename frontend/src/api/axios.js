import axios from 'axios';

// Create an instance of axios with custom configurations
const instance = axios.create({
  baseURL: 'http://localhost:3001/api',
  // timeout: 30000, // 30 seconds timeout
  headers: {
    'Content-Type': 'application/json',
  }
});

// Request interceptor - could be used for authentication tokens later
instance.interceptors.request.use(
  (config) => {
    // Any request modifications (like adding auth tokens) can go here
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - global error handling
instance.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    console.error('API Error:', error);
    // If needed, you can implement global error handling here
    return Promise.reject(error);
  }
);

export default instance; 
import axios from 'axios';

const API_BASE_URL = 'http://mivvea.runasp.net/api';

export const registerUser = async (username, password) => {
  const response = await axios.post(`${API_BASE_URL}/register`, { username, password });
  return response.data;
};

export const loginUser = async (username, password) => {
  const response = await axios.post(`${API_BASE_URL}/login`, { username, password });
  return response.data;
};

export const getDishes = async () => {
  const response = await axios.get(`${API_BASE_URL}/dishes`);
  return response.data;
};

export const addDish = async (name) => {
  const response = await axios.post(`${API_BASE_URL}/dishes`, { name });
  return response.data;
};

export const getMovies = async () => {
  const response = await axios.get(`${API_BASE_URL}/movies`);
  return response.data;
};

export const addMovie = async (name) => {
  const response = await axios.post(`${API_BASE_URL}/movies`, { name });
  return response.data;
};

import axios from 'axios'
import type { RoomData } from '@/structures/room'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

export default api

export async function loadRoom(uuid: string, key?: string): Promise<RoomData> {
  const res = await api.get(`/room/${uuid}`, {
    params: { key },
  })
  return res.data
}

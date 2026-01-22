import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

interface ApiOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
    body?: Record<string, unknown>
    headers?: Record<string, string>
}

export function useApi() {
    const auth = useAuthStore()
    const router = useRouter()

    const request = async <T>(endpoint: string, options: ApiOptions = {}): Promise<T> => {
        const { method = 'GET', body, headers = {} } = options

        const requestHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            ...headers
        }

        if (auth.token) {
            requestHeaders['Authorization'] = `Bearer ${auth.token}`
        }

        const response = await fetch(`${apiBaseUrl}${endpoint}`, {
            method,
            headers: requestHeaders,
            body: body ? JSON.stringify(body) : undefined
        })

        if (response.status === 401 || response.status === 403) {
            await auth.logout()
            router.push('/login')
            throw new Error('Session expired')
        }

        if (!response.ok) {
            const error = await response.json()
            throw new Error(error.error || 'Request failed')
        }

        return response.json()
    }

    const get = <T>(endpoint: string, headers?: Record<string, string>) =>
        request<T>(endpoint, { method: 'GET', headers })

    const post = <T>(endpoint: string, body?: Record<string, unknown>, headers?: Record<string, string>) =>
        request<T>(endpoint, { method: 'POST', body, headers })

    const put = <T>(endpoint: string, body?: Record<string, unknown>, headers?: Record<string, string>) =>
        request<T>(endpoint, { method: 'PUT', body, headers })

    const patch = <T>(endpoint: string, body?: Record<string, unknown>, headers?: Record<string, string>) =>
        request<T>(endpoint, { method: 'PATCH', body, headers })

    const del = <T>(endpoint: string, headers?: Record<string, string>) =>
        request<T>(endpoint, { method: 'DELETE', headers })

    return {
        request,
        get,
        post,
        put,
        patch,
        del
    }
}

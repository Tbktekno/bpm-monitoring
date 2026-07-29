import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { authService } from '@/services/auth.service';
import { useAuthContext } from '@/contexts/AuthContext';
import type { LoginCredentials } from '@/types';

export function useLogin() {
  const { login } = useAuthContext();

  return useMutation({
    mutationFn: (credentials: LoginCredentials) => login(credentials),
  });
}

export function useLogout() {
  const { logout } = useAuthContext();
  const navigate = useNavigate();

  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/login');
    toast.success('Berhasil logout');
  }, [logout, navigate]);

  return handleLogout;
}

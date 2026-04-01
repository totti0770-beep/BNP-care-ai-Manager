import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { Stethoscope, Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const LoginScreen: React.FC = () => {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const validateForm = () => {
    const newErrors: { email?: string; password?: string } = {};

    if (!email) {
      newErrors.email = t('required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = t('invalidEmail');
    }

    if (!password) {
      newErrors.password = t('required');
    } else if (password.length < 6) {
      newErrors.password = t('passwordMinLength');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);

    try {
      const success = await login(email, password);
      if (success) {
        toast.success(t('welcomeBack'));
      } else {
        toast.error(t('invalidCredentials'));
      }
    } catch {
      toast.error(t('error'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#1a1a2e] to-[#0f0f1a] flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 mb-4 shadow-lg shadow-purple-500/25">
            <Stethoscope className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">{t('appName')}</h1>
          <p className="text-gray-400">{t('appSubtitle')}</p>
        </div>

        <div className="bg-[#1a1a2e]/80 backdrop-blur-xl rounded-2xl border border-purple-500/20 p-8 shadow-2xl">
          <h2 className="text-xl font-semibold text-white mb-6 text-center">{t('welcomeBack')}</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-gray-300">{t('email')}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('enterEmail')}
                  className="pl-10 bg-[#0f0f1a] border-purple-500/30 text-white placeholder:text-gray-500 focus:border-purple-500 focus:ring-purple-500/20"
                />
              </div>
              {errors.email && <p className="text-red-400 text-sm">{errors.email}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-300">{t('password')}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('enterPassword')}
                  className="pl-10 pr-10 bg-[#0f0f1a] border-purple-500/30 text-white placeholder:text-gray-500 focus:border-purple-500 focus:ring-purple-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.password && <p className="text-red-400 text-sm">{errors.password}</p>}
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white font-semibold py-3 rounded-xl transition-all duration-200 shadow-lg shadow-purple-500/25 disabled:opacity-50"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t('loading')}
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  {t('signIn')}
                  <ArrowRight className="w-5 h-5" />
                </span>
              )}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-purple-500/20">
            <p className="text-gray-500 text-sm text-center mb-3">Demo Credentials:</p>
            <div className="space-y-2 text-xs text-gray-400">
              <div className="flex justify-between bg-[#0f0f1a] rounded-lg p-3">
                <span>Admin:</span>
                <span className="font-mono">admin@bestnursing.ai / admin123</span>
              </div>
              <div className="flex justify-between bg-[#0f0f1a] rounded-lg p-3">
                <span>User:</span>
                <span className="font-mono">user@bestnursing.ai / user123</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;

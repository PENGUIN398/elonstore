import { useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, RefreshCw, Store } from 'lucide-react';
import { Button, Field, Notice, inputClass } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { getErrorMessage } from '@/lib/errors';

type Mode = 'sign-in' | 'sign-up';

const SECURITY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateSecurityCode(): string {
  const values = new Uint32Array(5);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => SECURITY_ALPHABET[value % SECURITY_ALPHABET.length]).join('');
}

const COPY: Record<Mode, { title: string; description: string; cta: string; switchText: string; switchCta: string }> = {
  'sign-in': {
    title: 'Welcome back',
    description: 'Sign in to check your balance, track orders and manage your listings.',
    cta: 'Sign in',
    switchText: 'New to elonstore?',
    switchCta: 'Create an account',
  },
  'sign-up': {
    title: 'Create your account',
    description: 'Open a wallet in seconds and start buying or selling safely.',
    cta: 'Create account',
    switchText: 'Already have an account?',
    switchCta: 'Sign in',
  },
};

function friendlyAuthError(error: unknown, mode: Mode): string {
  const message = getErrorMessage(error, '').toLowerCase();
  if (message.includes('invalid login credentials')) return 'The email or password is incorrect.';
  if (message.includes('already registered') || message.includes('already been registered')) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (message.includes('password')) return 'Use a password with at least 6 characters.';
  if (message.includes('fetch') || message.includes('network')) {
    return 'We could not reach the server. Check your connection and try again.';
  }
  return mode === 'sign-in'
    ? 'We could not sign you in. Please try again.'
    : 'We could not create your account. Please try again.';
}

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [securityCode, setSecurityCode] = useState(generateSecurityCode);
  const [securityInput, setSecurityInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const copy = COPY[mode];

  const switchMode = () => {
    setMode((m) => (m === 'sign-in' ? 'sign-up' : 'sign-in'));
    setError(null);
    setInfo(null);
    setSecurityInput('');
    setSecurityCode(generateSecurityCode());
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Enter your email and password to continue.');
      return;
    }
    if (mode === 'sign-in' && securityInput.trim().toUpperCase() !== securityCode) {
      setError('Enter the security code exactly as shown.');
      setSecurityInput('');
      setSecurityCode(generateSecurityCode());
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'sign-in') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (signInError) throw signInError;
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setInfo('Your account is ready. Sign in with your new email and password.');
          setMode('sign-in');
          setPassword('');
        }
      }
    } catch (err) {
      setError(friendlyAuthError(err, mode));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 px-4 py-8 sm:px-8">
      <img
        src="/images/Screenshot_2026-11-01_104631.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-55"
      />
      <div className="pointer-events-none absolute inset-0 bg-zinc-950/65" />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-emerald-400/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md rounded-[1.75rem] border border-cyan-200/20 bg-zinc-950/90 p-5 shadow-2xl shadow-black/70 backdrop-blur-xl sm:p-7">
        <div className="flex flex-col justify-center">
          <div className="mb-6 flex items-center justify-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-400 text-zinc-950 shadow-lg shadow-emerald-500/20">
              <Store className="h-5 w-5" aria-hidden />
            </div>
            <span className="flex items-center gap-2.5">
              <img
                src="/images/Screenshot_2026-11-01_104631.png"
                alt=""
                className="h-7 w-7 rounded-full border border-cyan-300/50 object-cover object-center shadow-lg shadow-cyan-500/20"
              />
              <span className="text-xl font-bold tracking-tight text-emerald-400">elonstore</span>
            </span>
          </div>

        <div className="animate-[slide-up_0.4s_ease-out]">
          <div className="mb-5 space-y-1.5 text-center">
            <h1 className="text-xl font-bold leading-[1.2] text-zinc-50">{copy.title}</h1>
            <p className="text-sm leading-relaxed text-zinc-400">{copy.description}</p>
            <div className="mx-auto mt-4 h-px w-16 bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Field label="Email">
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="you@example.com"
                required
              />
            </Field>
            <Field label="Password" hint={mode === 'sign-up' ? 'At least 6 characters.' : undefined}>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} pr-11`}
                  placeholder="Your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-3 flex items-center text-zinc-500 transition hover:text-zinc-300"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                </button>
              </div>
            </Field>

            {mode === 'sign-in' && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-2.5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Security check</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSecurityCode(generateSecurityCode());
                      setSecurityInput('');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-cyan-300"
                    aria-label="Generate a new security code"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                    New code
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <div
                    aria-label={`Security code ${securityCode}`}
                    className="flex min-w-0 flex-1 select-none items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-950/30 px-3 py-2 font-mono text-lg font-bold tracking-[0.3em] text-cyan-200"
                  >
                    {securityCode}
                  </div>
                  <input
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    maxLength={5}
                    value={securityInput}
                    onChange={(e) => setSecurityInput(e.target.value.toUpperCase())}
                    className={`${inputClass} max-w-[8rem] uppercase tracking-widest`}
                    placeholder="Code"
                    aria-label="Enter security code"
                    required
                  />
                </div>
              </div>
            )}

            {error && <Notice tone="error">{error}</Notice>}
            {info && <Notice tone="success">{info}</Notice>}

            <Button type="submit" loading={submitting} className="w-full">
              {copy.cta}
              {!submitting && <ArrowRight className="h-4 w-4" aria-hidden />}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-zinc-400">
            {copy.switchText}{' '}
            <button
              type="button"
              onClick={switchMode}
              className="font-semibold text-emerald-300 transition hover:text-emerald-200"
            >
              {copy.switchCta}
            </button>
          </p>
        </div>
        </div>
      </div>
    </div>
  );
}

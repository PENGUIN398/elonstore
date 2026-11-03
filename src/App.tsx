import { Store, RotateCcw } from 'lucide-react';
import AuthScreen from '@/components/AuthScreen';
import AppShell from '@/components/AppShell';
import { Button, Spinner } from '@/components/ui';
import { AccountProvider, useAuthGate } from '@/context/AccountProvider';

export default function App() {
  const [gate, retry] = useAuthGate();

  if (gate.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <Spinner label="Loading elonstore" />
      </div>
    );
  }

  if (gate.status === 'signed-out') {
    return <AuthScreen />;
  }

  if (gate.status === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-950 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 text-emerald-300">
          <Store className="h-7 w-7" aria-hidden />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-zinc-50">We could not open your account</h1>
          <p className="max-w-sm text-sm text-zinc-400">{gate.message}</p>
        </div>
        <Button variant="secondary" onClick={retry}>
          <RotateCcw className="h-4 w-4" aria-hidden />
          Try again
        </Button>
      </div>
    );
  }

  return (
    <AccountProvider key={gate.session.user.id} initial={gate}>
      <AppShell />
    </AccountProvider>
  );
}

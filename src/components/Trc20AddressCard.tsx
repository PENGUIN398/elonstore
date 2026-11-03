import { Check, Copy, Landmark, QrCode } from 'lucide-react';
import { useState } from 'react';
import { Card } from '@/components/ui';
import { BINANCE_TRC20_ADDRESS } from '@/lib/wallet';

export default function Trc20AddressCard() {
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    await navigator.clipboard.writeText(BINANCE_TRC20_ADDRESS);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="border-amber-400/20 bg-amber-400/[0.04]">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="mx-auto shrink-0 rounded-2xl border border-zinc-700 bg-zinc-950/70 p-3 sm:mx-0">
          <img
            src="/images/WhatsApp_Image_2026-11-01_at_22.21.27 copy.jpeg"
            alt="QR code for the Binance TRC20 USDT deposit address"
            className="w-52 rounded-xl object-contain"
          />
          <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] font-medium text-zinc-500">
            <QrCode className="h-3.5 w-3.5" aria-hidden /> Scan to deposit
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300">
            <Landmark className="h-4 w-4" aria-hidden />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-300">Binance deposit address</p>
          <p className="mt-1 text-sm text-zinc-300">TRC20 network · USDT</p>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950/70 p-2">
            <code className="min-w-0 flex-1 break-all text-xs leading-relaxed text-zinc-200">{BINANCE_TRC20_ADDRESS}</code>
            <button
              type="button"
              onClick={copyAddress}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-zinc-800 hover:text-amber-300"
              aria-label="Copy Binance TRC20 address"
            >
              {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-zinc-500">
            This is the TRC20 Binance address where funds are held for escrow. Send USDT on the TRON (TRC20) network only.
          </p>
        </div>
      </div>
    </Card>
  );
}

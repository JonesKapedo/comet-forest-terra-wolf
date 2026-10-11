import { useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Power, Shield } from "lucide-react";
import { loadFeeds } from "@/lib/market.functions";
import { equity, exposure, portfolioLines, sampleTape, type Candidate } from "@/lib/paper";
import { useDesk } from "@/lib/desk-store";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const px = (n: number) => (n >= 1 ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : `$${n.toPrecision(3)}`);

export function Desk() {
  const power = useDesk((s) => s.power);
  const mode = useDesk((s) => s.mode);
  const demo = useDesk((s) => s.demo);
  const live = useDesk((s) => s.live);
  const memory = useDesk((s) => s.memory);
  const tape = useDesk((s) => s.tape);
  const note = useDesk((s) => s.note);
  const log = useDesk((s) => s.log);
  const setPower = useDesk((s) => s.setPower);
  const setMode = useDesk((s) => s.setMode);
  const setTape = useDesk((s) => s.setTape);
  const tick = useDesk((s) => s.tick);
  const autoStep = useDesk((s) => s.autoStep);
  const flatten = useDesk((s) => s.flatten);
  const halt = useDesk((s) => s.halt);
  const fund = useDesk((s) => s.fund);
  const resetDemo = useDesk((s) => s.resetDemo);
  const [amount, setAmount] = useState("25");
  const [query, setQuery] = useState("");

  const book = mode === "demo" ? demo : live;
  const eq = equity(book);
  const exp = exposure(book);

  useEffect(() => {
    void useDesk.persist.rehydrate();
  }, []);

  useEffect(() => {
    let stop = false;
    async function pull(q: string) {
      try {
        const res = await loadFeeds({ data: { query: q } });
        if (stop) return;
        const rows = [...res.binance, ...res.dex];
        if (rows.length) setTape(rows, res.note);
        else setTape(sampleTape(), `${res.note}. Sample tape standing in.`);
      } catch (err) {
        if (stop) return;
        const message = err instanceof Error ? err.message : "Feeds down";
        setTape(sampleTape(), `${message}. Sample tape standing in.`);
      }
    }
    void pull(query);
    const id = window.setInterval(() => void pull(useDesk.getState().power ? query : query), 12000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [query, setTape]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const state = useDesk.getState();
      const prices: Record<string, number> = {};
      for (const row of state.tape) prices[row.id] = row.priceUsd;
      for (const p of [...state.demo.positions, ...state.live.positions]) {
        if (!prices[p.tokenId]) prices[p.tokenId] = p.mark * (1 + (Math.random() - 0.48) * 0.01);
      }
      if (Object.keys(prices).length) state.tick(prices);
      state.autoStep();
    }, 4000);
    return () => window.clearInterval(id);
  }, []);

  const binance = tape.filter((c) => c.venue === "binance");
  const dex = tape.filter((c) => c.venue !== "binance");

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-3 py-4 sm:px-5">
      <header className="grid gap-4 border border-line bg-surface px-4 py-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
        <div>
          <p className="num text-xs tracking-[0.28em] text-accent uppercase">Monroe</p>
          <h1 className="text-3xl font-semibold tracking-tight text-fg uppercase">Sniper</h1>
        </div>
        <p className="num text-sm text-muted">{note}</p>
        <button
          type="button"
          onClick={() => setPower(!power)}
          aria-pressed={power}
          className={
            "inline-flex min-h-14 items-center justify-center gap-3 rounded-full border px-5 text-sm font-semibold tracking-widest uppercase " +
            (power ? "border-accent bg-accent text-accent-ink" : "border-line bg-bg text-muted")
          }
        >
          <Power className="size-5" />
          {power ? "Armed" : "Power"}
        </button>
      </header>

      <section className="mt-3 grid gap-3 border border-line bg-surface-2 p-3 sm:grid-cols-4">
        <Stat label={mode === "demo" ? "Demo equity" : "Live equity"} value={money(eq)} />
        <Stat label="Free cash" value={money(book.cash)} />
        <Stat label="Open risk" value={money(exp)} />
        <Stat label="Score floor" value={String(memory.minScore)} hint={`${memory.wins}W ${memory.losses}L`} />
      </section>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex border border-line">
          <button
            type="button"
            onClick={() => setMode("demo")}
            className={"min-h-11 px-4 text-sm tracking-wide uppercase " + (mode === "demo" ? "bg-accent text-accent-ink" : "text-muted")}
          >
            Demo
          </button>
          <button
            type="button"
            onClick={() => setMode("live")}
            className={"min-h-11 px-4 text-sm tracking-wide uppercase " + (mode === "live" ? "bg-accent text-accent-ink" : "text-muted")}
          >
            Live
          </button>
        </div>
        <button type="button" onClick={() => halt(!book.kill)} className="min-h-11 border border-line px-4 text-sm uppercase">
          <Shield className="mr-2 inline size-4" />
          {book.kill ? "Clear kill" : "Kill switch"}
        </button>
        {mode === "demo" && (
          <button type="button" onClick={resetDemo} className="min-h-11 px-3 text-sm text-muted uppercase">
            Reset demo
          </button>
        )}
        <p className="num ml-auto text-xs text-ok">{power ? "DEMO ENGINE RUNNING" : "ENGINE IDLE"}</p>
      </div>

      <section className="mt-4">
        <div className="mb-2 flex items-end justify-between">
          <h2 className="text-sm tracking-[0.2em] text-muted uppercase">Binance</h2>
          <span className="num text-xs text-ok">Live ticker</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {(binance.length ? binance : []).map((c) => (
            <Quote key={c.id} c={c} />
          ))}
          {binance.length === 0 && <p className="text-sm text-muted">Waiting for Binance…</p>}
        </div>
      </section>

      <section className="mt-4">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-sm tracking-[0.2em] text-muted uppercase">DEX</h2>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery((document.getElementById("q") as HTMLInputElement).value);
            }}
          >
            <input id="q" placeholder="Search pair" className="num min-h-11 border border-line bg-bg px-3 text-sm text-fg outline-none" />
            <button type="submit" className="min-h-11 bg-surface px-3 text-sm uppercase">
              Search
            </button>
          </form>
        </div>
        <div className="overflow-x-auto border border-line">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="bg-surface text-xs tracking-widest text-muted uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Chain</th>
                <th className="px-3 py-2 font-medium">Price</th>
                <th className="px-3 py-2 font-medium">Liquidity</th>
                <th className="px-3 py-2 font-medium">Score</th>
              </tr>
            </thead>
            <tbody>
              {dex.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="px-3 py-2">{c.symbol}</td>
                  <td className="num px-3 py-2 text-muted">{c.chain}</td>
                  <td className="num px-3 py-2">{px(c.priceUsd)}</td>
                  <td className="num px-3 py-2">{money(c.liquidityUsd)}</td>
                  <td className="num px-3 py-2 text-accent">{c.score}</td>
                </tr>
              ))}
              {dex.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-muted">
                    DEX feed empty. Sample names load if both feeds fail.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_0.8fr]">
        <div className="border border-line bg-surface p-3">
          <h2 className="text-sm tracking-[0.2em] text-muted uppercase">
            {mode === "demo" ? "Demo positions" : "Live positions"}
          </h2>
          <ul className="mt-3 grid gap-2">
            {book.positions.length === 0 && <li className="text-sm text-muted">Flat.</li>}
            {book.positions.map((p) => {
              const pnl = (p.mark - p.entryPrice) * p.qty;
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border border-line px-3 py-2">
                  <div>
                    <p className="text-lg">{p.symbol}</p>
                    <p className="num text-xs text-muted">
                      {p.chain} · stop {px(p.stop)}
                    </p>
                  </div>
                  <p className={"num " + (pnl >= 0 ? "text-ok" : "text-loss")}>{money(pnl)}</p>
                  <button type="button" onClick={() => flatten(p.id)} className="min-h-11 border border-line px-3 text-xs uppercase">
                    Flatten
                  </button>
                </li>
              );
            })}
          </ul>
          <h3 className="mt-4 text-xs tracking-[0.18em] text-muted uppercase">Closed</h3>
          <ul className="mt-2 grid gap-1">
            {book.trades.slice(0, 6).map((t) => (
              <li key={t.id} className="flex justify-between text-sm">
                <span>
                  {t.symbol} · {t.reason}
                </span>
                <span className={"num " + (t.pnl >= 0 ? "text-ok" : "text-loss")}>{money(t.pnl)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid gap-3">
          <article className="border border-line bg-surface p-3">
            <h2 className="text-sm tracking-[0.2em] text-muted uppercase">Live cash rail</h2>
            <p className="mt-2 text-sm text-muted">
              Demo starts at $100 and learns in this browser. Live cash starts at $0. A posted deposit or withdrawal
              updates the live ledger here. It does not move exchange or bank funds until you connect a signer.
            </p>
            <p className="num mt-3 text-2xl">{money(live.cash)}</p>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                fund("in", Number(amount));
              }}
            >
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-label="Amount in dollars"
                className="num min-h-11 w-full border border-line bg-bg px-3 text-fg outline-none"
              />
              <button type="submit" className="inline-flex min-h-11 items-center gap-1 bg-accent px-3 text-sm text-accent-ink">
                <ArrowDownToLine className="size-4" /> In
              </button>
              <button
                type="button"
                onClick={() => fund("out", Number(amount))}
                className="inline-flex min-h-11 items-center gap-1 border border-line px-3 text-sm"
              >
                <ArrowUpFromLine className="size-4" /> Out
              </button>
            </form>
          </article>
          <article className="border border-line p-3">
            <h2 className="text-sm tracking-[0.2em] text-muted uppercase">Gates</h2>
            <ul className="mt-2 grid gap-1">
              {portfolioLines(book).map((line) => (
                <li key={line.id} className="flex justify-between gap-3 text-sm">
                  <span className={line.pass ? "text-ok" : "text-loss"}>{line.label}</span>
                  <span className="num text-muted">{line.detail}</span>
                </li>
              ))}
            </ul>
          </article>
          <article className="border border-line p-3">
            <h2 className="text-sm tracking-[0.2em] text-muted uppercase">Session log</h2>
            <ul className="mt-2 grid gap-1">
              {log.length === 0 && <li className="text-sm text-muted">No prints yet.</li>}
              {log.map((line, i) => (
                <li key={`${line}-${i}`} className="num text-xs text-muted">
                  {line}
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs tracking-[0.16em] text-muted uppercase">{label}</p>
      <p className="num text-xl text-fg">{value}</p>
      {hint ? <p className="num text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function Quote({ c }: { c: Candidate }) {
  const up = c.change24h >= 0;
  return (
    <article className="border border-line bg-bg px-3 py-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg">{c.symbol}</h3>
        <span className={"num text-sm " + (up ? "text-ok" : "text-loss")}>
          {up ? "+" : ""}
          {c.change24h.toFixed(2)}%
        </span>
      </div>
      <p className="num text-xl">{px(c.priceUsd)}</p>
      <p className="num text-xs text-muted">24h {money(c.volume24h)}</p>
    </article>
  );
}

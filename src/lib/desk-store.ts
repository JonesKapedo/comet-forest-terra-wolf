import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  type Book,
  type Candidate,
  type Memory,
  chooseEntry,
  closeOne,
  deposit,
  emptyBook,
  emptyMemory,
  enter,
  learn,
  markBook,
  setKill,
  withdraw,
} from "./paper";

export type Mode = "demo" | "live";

type DeskState = {
  power: boolean;
  mode: Mode;
  demo: Book;
  live: Book;
  memory: Memory;
  tape: Candidate[];
  note: string;
  log: string[];
  setPower: (on: boolean) => void;
  setMode: (mode: Mode) => void;
  setTape: (rows: Candidate[], note: string) => void;
  tick: (prices: Record<string, number>) => void;
  autoStep: () => void;
  flatten: (id: string) => void;
  halt: (on: boolean) => void;
  fund: (side: "in" | "out", amount: number) => void;
  resetDemo: () => void;
};

function pushLog(log: string[], line: string): string[] {
  return [line, ...log].slice(0, 24);
}

function absorb(book: Book, prices: Record<string, number>, memory: Memory): { book: Book; memory: Memory } {
  const before = book.trades.length;
  const next = markBook(book, prices);
  let mem = memory;
  const born = next.trades.length - before;
  for (const trade of next.trades.slice(0, Math.max(0, born))) {
    mem = learn(mem, trade.pnl);
  }
  return { book: next, memory: mem };
}

export const useDesk = create<DeskState>()(
  persist(
    (set, get) => ({
      power: false,
      mode: "demo",
      demo: emptyBook(),
      live: emptyBook(0),
      memory: emptyMemory(),
      tape: [],
      note: "Power is off. Arm it to let the demo book hunt on its own.",
      log: [],
      setPower: (on) =>
        set((s) => ({
          power: on,
          note: on ? "Armed. Demo book is hunting." : "Disarmed. Feeds can still refresh.",
          log: pushLog(s.log, on ? "Power on" : "Power off"),
        })),
      setMode: (mode) =>
        set((s) => ({
          mode,
          note: mode === "live" ? "Live wallet. Orders stay locked until an exchange rail is connected." : "Demo wallet.",
          log: pushLog(s.log, mode === "live" ? "Viewing live wallet" : "Viewing demo wallet"),
        })),
      setTape: (rows, note) => set({ tape: rows, note }),
      tick: (prices) =>
        set((s) => {
          const demo = absorb(s.demo, prices, s.memory);
          const live = absorb(s.live, prices, demo.memory);
          return { demo: demo.book, live: live.book, memory: live.memory };
        }),
      autoStep: () => {
        const s = get();
        if (!s.power) return;
        const pick = chooseEntry(s.demo, s.tape, s.memory.minScore);
        if (!pick) return;
        const result = enter(s.demo, pick, Date.now(), s.memory.minScore);
        if (!result.ok) return;
        set({
          demo: result.book,
          note: `Demo fill ${pick.symbol} on ${pick.venue}`,
          log: pushLog(s.log, `Bought ${pick.symbol} · ${pick.venue} · score ${pick.score}`),
        });
      },
      flatten: (id) =>
        set((s) => {
          const key = s.mode;
          const book = closeOne(s[key], id);
          const closed = book.trades[0];
          const memory = closed && book.trades.length !== s[key].trades.length ? learn(s.memory, closed.pnl) : s.memory;
          return {
            [key]: book,
            memory,
            note: "Flattened",
            log: pushLog(s.log, closed ? `Flatten ${closed.symbol} ${closed.pnl.toFixed(2)}` : "Flatten"),
          };
        }),
      halt: (on) =>
        set((s) => ({
          demo: setKill(s.demo, on),
          live: setKill(s.live, on),
          note: on ? "Kill switch. New entries blocked." : "Kill switch cleared.",
          log: pushLog(s.log, on ? "Kill switch on" : "Kill switch cleared"),
        })),
      fund: (side, amount) =>
        set((s) => {
          if (s.mode !== "live") {
            return { note: "Deposits and withdrawals post to the live wallet. Switch to live.", log: s.log };
          }
          if (side === "in") {
            return {
              live: deposit(s.live, amount),
              note: `Posted $${amount.toFixed(2)} to the live ledger on this device.`,
              log: pushLog(s.log, `Live deposit ${amount.toFixed(2)}`),
            };
          }
          const result = withdraw(s.live, amount);
          return {
            live: result.book,
            note: result.note,
            log: pushLog(s.log, result.ok ? `Live withdraw ${amount.toFixed(2)}` : result.note),
          };
        }),
      resetDemo: () =>
        set((s) => ({
          demo: emptyBook(),
          memory: emptyMemory(),
          note: "Demo reset to $100. Learning memory cleared.",
          log: pushLog(s.log, "Demo reset"),
        })),
    }),
    {
      name: "monroe-sniper-v2",
      storage: createJSONStorage(() =>
        typeof window === "undefined"
          ? { getItem: () => null, setItem: () => undefined, removeItem: () => undefined }
          : localStorage,
      ),
      partialize: (s) => ({
        power: s.power,
        mode: s.mode,
        demo: s.demo,
        live: s.live,
        memory: s.memory,
        log: s.log,
      }),
      skipHydration: true,
    },
  ),
);

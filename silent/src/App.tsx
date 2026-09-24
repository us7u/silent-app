import { useEffect, useRef, useState } from 'react';
import { Game, GameState, RunStats } from './game/engine';
import { fmtTime, loadName, loadScores, saveName, saveScore, ScoreEntry } from './game/highscores';

function ScoreTable({ scores, highlight }: { scores: ScoreEntry[]; highlight?: number }) {
  if (!scores.length)
    return <p className="font-type text-sm text-stone-400/70 text-center py-3">No survivors recorded yet.</p>;
  return (
    <table className="w-full font-type text-sm">
      <thead>
        <tr className="text-stone-500 text-xs tracking-widest">
          <th className="text-left font-normal pb-1">#</th>
          <th className="text-left font-normal pb-1">NAME</th>
          <th className="text-right font-normal pb-1">SCORE</th>
          <th className="text-right font-normal pb-1 hidden sm:table-cell">TIME</th>
          <th className="text-right font-normal pb-1 hidden sm:table-cell">KILLS</th>
        </tr>
      </thead>
      <tbody>
        {scores.map((s, i) => (
          <tr
            key={s.date + '-' + i}
            className={i === highlight ? 'text-red-400 animate-pulse' : i === 0 ? 'text-amber-200' : 'text-stone-300'}
          >
            <td className="py-0.5 pr-2">{i + 1}</td>
            <td className="py-0.5 truncate max-w-[110px]">{s.name}</td>
            <td className="py-0.5 text-right tabular-nums">{s.score.toLocaleString()}</td>
            <td className="py-0.5 text-right hidden sm:table-cell">{fmtTime(s.time)}</td>
            <td className="py-0.5 text-right hidden sm:table-cell">{s.kills}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [state, setState] = useState<GameState>('menu');
  const [stats, setStats] = useState<RunStats | null>(null);
  const [scores, setScores] = useState<ScoreEntry[]>(() => loadScores());
  const [rank, setRank] = useState(-1);
  const [name, setName] = useState(() => loadName());
  const nameRef = useRef(name);
  nameRef.current = name;

  useEffect(() => {
    const g = new Game(canvasRef.current!, {
      onState: (s) => setState(s),
      onGameOver: (st) => {
        setStats(st);
        const entry: ScoreEntry = {
          name: (nameRef.current || 'HARRY').toUpperCase().slice(0, 12),
          score: st.score,
          time: st.time,
          kills: st.kills,
          date: Date.now(),
        };
        const res = saveScore(entry);
        setScores(res.list);
        setRank(res.rank);
      },
    });
    gameRef.current = g;
    return () => g.destroy();
  }, []);

  const start = () => {
    saveName(name || 'HARRY');
    setRank(-1);
    gameRef.current?.start();
  };

  const best = scores[0]?.score ?? 0;

  return (
    <div className="fixed inset-0 bg-[#0b0908] overflow-hidden select-none">
      <canvas ref={canvasRef} className="absolute inset-0 block touch-none" />

      {state === 'playing' && (
        <button
          aria-label="Pause"
          onClick={() => gameRef.current?.pause()}
          className="absolute top-[122px] left-4 w-11 h-11 rounded-full btn-sh flex items-center justify-center text-sm !tracking-normal"
        >
          ❚❚
        </button>
      )}

      {state === 'menu' && (
        <div className="absolute inset-0 flex items-center justify-center p-4 overflow-y-auto">
          <div className="absolute inset-0 fog-layer pointer-events-none" />
          <div className="relative w-full max-w-3xl grid md:grid-cols-[1.2fr_1fr] gap-6 items-center">
            <div className="text-center md:text-left rise">
              <p className="font-type text-xs tracking-[0.5em] text-stone-400 mb-2">WELCOME TO</p>
              <h1 className="font-title flicker text-6xl sm:text-7xl leading-none text-stone-100 drop-shadow-[0_4px_18px_rgba(0,0,0,0.9)]">
                Silent Hill
              </h1>
              <p className="font-type text-red-500/90 tracking-[0.35em] text-sm mt-2">INTO THE FOG</p>
              <p className="font-type text-stone-300/80 text-sm mt-5 max-w-sm mx-auto md:mx-0 leading-relaxed">
                The radio hisses when they're close. Collect lost memories, keep moving, and when the siren wails — survive
                the Otherworld.
              </p>
              <div className="mt-6 flex flex-col sm:flex-row gap-3 items-center justify-center md:justify-start">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 12))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      (e.target as HTMLInputElement).blur();
                      start();
                    }
                  }}
                  placeholder="YOUR NAME"
                  className="font-type bg-black/50 border border-stone-500/40 text-stone-100 px-3 py-2.5 w-44 text-center tracking-widest outline-none focus:border-red-500/70"
                  aria-label="Player name"
                />
                <button onClick={start} className="btn-sh px-8 py-2.5 text-lg" tabIndex={-1}>
                  ENTER TOWN
                </button>
              </div>
              <div className="font-type text-[11px] text-stone-400/80 mt-5 grid grid-cols-2 gap-x-4 gap-y-1 max-w-sm mx-auto md:mx-0 text-left">
                <span>WASD / ARROWS</span><span>move</span>
                <span>MOUSE + CLICK</span><span>aim · fire (hold)</span>
                <span>SPACE / R-CLICK</span><span>dodge roll</span>
                <span>J / K</span><span>fire (keyboard only)</span>
                <span>P / ESC</span><span>pause</span>
                <span>TOUCH</span><span>left stick move · right stick aim+fire</span>
              </div>
            </div>
            <div className="bg-black/55 border border-stone-500/25 p-4 rise" style={{ animationDelay: '0.15s' }}>
              <h2 className="font-title text-2xl text-stone-200 mb-2 text-center">Survivors</h2>
              <ScoreTable scores={scores} />
            </div>
          </div>
        </div>
      )}

      {state === 'paused' && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-4">
          <div className="text-center rise">
            <h2 className="font-title text-6xl text-stone-100 flicker">Paused</h2>
            <p className="font-type text-stone-400 text-sm mt-2 tracking-widest">the fog waits for you</p>
            <div className="flex flex-col gap-3 mt-8 w-56 mx-auto">
              <button className="btn-sh py-2.5" onClick={() => gameRef.current?.resume()}>
                RESUME
              </button>
              <button className="btn-sh py-2.5" onClick={start}>
                RESTART (R)
              </button>
              <button className="btn-sh py-2.5" onClick={() => gameRef.current?.toMenu()}>
                MAIN MENU
              </button>
            </div>
          </div>
        </div>
      )}

      {state === 'gameover' && stats && (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(60,0,0,0.55),rgba(0,0,0,0.88))] flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-md text-center rise">
            <h2 className="font-title text-6xl sm:text-7xl text-red-600 drop-shadow-[0_0_20px_rgba(160,0,0,0.6)] flicker">
              You Died
            </h2>
            <p className="font-type italic text-stone-400 text-sm mt-2">"There was a hole here. It's gone now."</p>
            <div className="mt-5 font-title text-5xl text-stone-100 tabular-nums">{stats.score.toLocaleString()}</div>
            {rank === 0 && <p className="font-type text-amber-300 text-sm tracking-[0.3em] mt-1 animate-pulse">NEW BEST</p>}
            {rank > 0 && <p className="font-type text-stone-300 text-sm tracking-[0.3em] mt-1">RANK #{rank + 1}</p>}
            {rank < 0 && <p className="font-type text-stone-500 text-xs tracking-[0.3em] mt-1">BEST {best.toLocaleString()}</p>}
            <div className="grid grid-cols-4 gap-2 mt-4 font-type text-xs text-stone-400">
              <div className="bg-black/40 py-2">
                <div className="text-stone-100 text-base">{fmtTime(stats.time)}</div>TIME
              </div>
              <div className="bg-black/40 py-2">
                <div className="text-stone-100 text-base">{stats.kills}</div>KILLS
              </div>
              <div className="bg-black/40 py-2">
                <div className="text-stone-100 text-base">{stats.fragments}</div>MEMORIES
              </div>
              <div className="bg-black/40 py-2">
                <div className="text-stone-100 text-base">{stats.maxCombo}</div>COMBO
              </div>
            </div>
            <div className="flex gap-3 mt-5 justify-center">
              <button className="btn-sh px-6 py-2.5" onClick={start} tabIndex={-1}>
                TRY AGAIN (R)
              </button>
              <button className="btn-sh px-6 py-2.5" onClick={() => gameRef.current?.toMenu()}>
                MENU
              </button>
            </div>
            <div className="bg-black/50 border border-stone-500/25 p-3 mt-5 text-left">
              <ScoreTable scores={scores} highlight={rank} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

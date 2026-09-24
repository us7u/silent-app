export interface ScoreEntry {
  name: string;
  score: number;
  time: number;
  kills: number;
  date: number;
}

const KEY = 'sh-fog-highscores-v1';
const NAME_KEY = 'sh-fog-name';

export function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as ScoreEntry[];
    return Array.isArray(arr) ? arr.slice(0, 10) : [];
  } catch {
    return [];
  }
}

export function saveScore(entry: ScoreEntry): { list: ScoreEntry[]; rank: number } {
  const list = loadScores();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const top = list.slice(0, 10);
  const rank = top.indexOf(entry);
  try {
    localStorage.setItem(KEY, JSON.stringify(top));
  } catch {
    /* ignore */
  }
  return { list: top, rank };
}

export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) || 'HARRY';
  } catch {
    return 'HARRY';
  }
}

export function saveName(n: string) {
  try {
    localStorage.setItem(NAME_KEY, n);
  } catch {
    /* ignore */
  }
}

export function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, '0')}`;
}

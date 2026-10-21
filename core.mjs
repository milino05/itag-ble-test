/* Padel BLE — pure scoring and click logic. Mirrors Android v0.2. */
export const MODES = Object.freeze({ ADVANTAGE: 'ADVANTAGE', GOLDEN: 'GOLDEN', STAR: 'STAR' });
export const MODE_NAMES = Object.freeze({
  ADVANTAGE: 'Vantaggi classici', GOLDEN: 'Punto de Oro', STAR: 'Star Point'
});
export const REPEAT_FILTER_MS = 320;
export const DOUBLE_WINDOW_MS = 950;

export class ScoreEngine {
  constructor(mode = MODES.ADVANTAGE, history = []) {
    if (!MODES[mode]) throw new Error('Modalità non valida');
    this.mode = mode;
    this.history = [];
    for (const team of history) this.addPoint(team);
  }
  setMode(mode) {
    if (!MODES[mode]) throw new Error('Modalità non valida');
    if (this.history.length) throw new Error('Per cambiare regola serve una nuova partita');
    this.mode = mode;
  }
  clear() { this.history = []; }
  addPoint(team) {
    if (team !== 0 && team !== 1) throw new Error('Squadra non valida');
    this.history.push(team);
  }
  undoLastPointBy(team) {
    if (team !== 0 && team !== 1) throw new Error('Squadra non valida');
    const i = this.history.lastIndexOf(team);
    if (i < 0) return false;
    this.history.splice(i, 1);
    return true;
  }
  snapshot() {
    const s = {
      games: [0, 0], rawPoints: [0, 0], canceledAdvantages: 0,
      advantageTeam: -1, showGames: false, starPoint: false,
      goldenPoint: false, displayedPoints: ['0', '0']
    };
    for (const team of this.history) {
      s.showGames = false;
      const rival = 1 - team;
      const wasDeuce = s.rawPoints[0] >= 3 && s.rawPoints[1] >= 3;
      const previousAdvantage = s.advantageTeam;
      s.rawPoints[team]++;
      let game = false;
      if (wasDeuce) {
        if (this.mode === MODES.GOLDEN || (this.mode === MODES.STAR && s.canceledAdvantages >= 2 && previousAdvantage === -1)) {
          game = true;
        } else if (previousAdvantage === team) {
          game = true;
        } else if (previousAdvantage === rival) {
          s.advantageTeam = -1;
          s.canceledAdvantages++;
        } else {
          s.advantageTeam = team;
        }
      } else if (s.rawPoints[team] >= 4 && s.rawPoints[rival] <= 2) {
        game = true;
      }
      if (game) {
        s.games[team]++;
        s.rawPoints = [0, 0];
        s.advantageTeam = -1;
        s.canceledAdvantages = 0;
        s.showGames = true;
      }
    }
    s.goldenPoint = this.mode === MODES.GOLDEN && s.rawPoints[0] >= 3 && s.rawPoints[1] >= 3;
    s.starPoint = this.mode === MODES.STAR && s.rawPoints[0] >= 3 && s.rawPoints[1] >= 3 && s.canceledAdvantages >= 2 && s.advantageTeam === -1;
    for (let t = 0; t < 2; t++) {
      s.displayedPoints[t] = s.advantageTeam === t ? 'AD'
        : ['0','15','30','40'][Math.min(3, s.rawPoints[t])];
    }
    return s;
  }
}

export class ClickDetector {
  constructor() { this.reset(); }
  reset() { this.lastAccepted = -Infinity; this.pendingSince = null; }
  notifyAt(now) {
    if (now - this.lastAccepted < REPEAT_FILTER_MS) return 'REPEAT';
    this.lastAccepted = now;
    if (this.pendingSince !== null) {
      if (now - this.pendingSince <= DOUBLE_WINDOW_MS) {
        this.pendingSince = null;
        return 'DOUBLE';
      }
      this.pendingSince = now;
      return 'NEXT_FIRST';
    }
    this.pendingSince = now;
    return 'FIRST';
  }
  expireAt(now) {
    if (this.pendingSince === null || now - this.pendingSince < DOUBLE_WINDOW_MS) return false;
    this.pendingSince = null;
    return true;
  }
  get isPending() { return this.pendingSince !== null; }
}

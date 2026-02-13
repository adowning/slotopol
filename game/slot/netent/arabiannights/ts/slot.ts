export type Sym = number;
export type Pos = number;

export type Reelx = Sym[][];
export type Linex = Pos[];

export type Hitx = [Pos, Pos][];

export interface WinItem {
    Pay: number;
    MP: number;
    Sym: Sym;
    Num: Pos;
    LI: number;
    XY: Hitx;
    FS: number;
    BID: number;
    Bon?: any;
    JID: number;
    JR: number;
}

export type Wins = WinItem[];

export interface SlotGame {
    Scanner(wins: Wins): Error | null;
    Cost(): number;
    JackFreq(mrtp: number): number[];
    FreeMode(): boolean;
    Spin(mrtp: number): void;
    Spawn(wins: Wins, fund: number, mrtp: number): void;
    Prepare(): void;
    Apply(wins: Wins): void;
    GetGain(): number;
    SetGain(gain: number): Error | null;
    GetBet(): number;
    SetBet(bet: number): Error | null;
    GetSel(): number;
    SetSel(sel: number): Error | null;
    SetMode(mode: number): Error | null;
}

export interface SlotGeneric extends SlotGame {
    // Grider methods
    Dim(): [Pos, Pos];
    At(x: Pos, y: Pos): Sym;
    LX(x: Pos, line: Linex): Sym;
    SetSym(x: Pos, y: Pos, sym: Sym): void;
    SetCol(x: Pos, reel: Sym[], pos: number): void;
    SpinReels(reels: Reelx): void;
    SymNum(sym: Sym): Pos;
    SymPos(sym: Sym): Hitx;

    Clone(): SlotGeneric;
}

export class Slotx implements SlotGame {
    Sel: number;
    Bet: number;
    Gain: number = 0;
    FSN: number = 0;
    FSR: number = 0;

    constructor(sel: number, bet: number) {
        this.Sel = sel;
        this.Bet = bet;
    }

    Cost(): number {
        return this.Bet * this.Sel;
    }

    JackFreq(mrtp: number): number[] {
        return [];
    }

    FreeMode(): boolean {
        return this.FSR !== 0;
    }

    Spin(mrtp: number): void {
        // Implement in subclass
    }

    Spawn(wins: Wins, fund: number, mrtp: number): void {
    }

    Prepare(): void {
    }

    Apply(wins: Wins): void {
        if (this.FSR !== 0) {
            this.Gain += wins.reduce((acc, w) => acc + w.Pay * w.MP, 0);
            this.FSN++;
        } else {
            this.Gain = wins.reduce((acc, w) => acc + w.Pay * w.MP, 0);
            this.FSN = 0;
        }

        if (this.FSR > 0) {
            this.FSR--;
        }
        for (const wi of wins) {
            if (wi.FS > 0) {
                this.FSR += wi.FS;
            }
        }
    }

    GetGain(): number {
        return this.Gain;
    }

    SetGain(gain: number): Error | null {
        this.Gain = gain;
        return null;
    }

    GetBet(): number {
        return this.Bet;
    }

    SetBet(bet: number): Error | null {
        if (bet <= 0) return new Error("wrong parameter");
        if (bet === this.Bet) return null;
        if (this.FSR !== 0) return new Error("feature is disabled");
        this.Bet = bet;
        return null;
    }

    GetSel(): number {
        return this.Sel;
    }

    SetSel(sel: number): Error | null {
        // Validation logic should be in subclass or utility
        return this.SetSelNum(sel, 20); // Default to 20 lines check if not overridden
    }

    SetSelNum(sel: number, bln: number): Error | null {
        if (sel < 1 || sel > bln) return new Error("wrong parameter");
        if (sel === this.Sel) return null;
        if (this.FSR !== 0) return new Error("feature is disabled");
        this.Sel = sel;
        return null;
    }

    SetMode(mode: number): Error | null {
        return new Error("feature unavailable");
    }

    Scanner(wins: Wins): Error | null {
        return null;
    }
}

export class Grid5x3 {
    Grid: Sym[][] = Array(5).fill(0).map(() => Array(3).fill(0));

    Dim(): [Pos, Pos] {
        return [5, 3];
    }

    At(x: Pos, y: Pos): Sym {
        return this.Grid[x - 1][y - 1];
    }

    LX(x: Pos, line: Linex): Sym {
        return this.Grid[x - 1][line[x - 1] - 1];
    }

    SetSym(x: Pos, y: Pos, sym: Sym): void {
        this.Grid[x - 1][y - 1] = sym;
    }

    SetCol(x: Pos, reel: Sym[], pos: number): void {
        const sr = this.Grid[x - 1];
        const n = reel.length;
        pos = (n + pos % n) % n;
        for (let y = 0; y < sr.length; y++) {
            sr[y] = reel[(pos + y) % n];
        }
    }

    SpinReels(reels: Reelx): void {
        for (let x = 0; x < reels.length; x++) {
            const reel = reels[x];
            const hit = Math.floor(Math.random() * reel.length);
            this.SetCol(x + 1, reel, hit);
        }
    }

    SymNum(sym: Sym): Pos {
        let n = 0;
        for (const sr of this.Grid) {
            for (const sy of sr) {
                if (sy === sym) n++;
            }
        }
        return n;
    }

    SymPos(sym: Sym): Hitx {
        const c: Hitx = [];
        for (let x = 0; x < this.Grid.length; x++) {
            const sr = this.Grid[x];
            for (let y = 0; y < sr.length; y++) {
                if (sr[y] === sym) {
                    c.push([x + 1, y + 1]);
                }
            }
        }
        return c;
    }
}

export class HitxHelper {
    static HitxL(line: Linex, num: Pos): Hitx {
        const dst: Hitx = [];
        for (let x = 0; x < num; x++) {
            dst.push([x + 1, line[x]]);
        }
        return dst;
    }
}

// NetEnt/BetSoft 5x3 slots bet lines
export const BetLinesNetEnt5x3: Linex[] = [
    [2, 2, 2, 2, 2], // 1
    [1, 1, 1, 1, 1], // 2
    [3, 3, 3, 3, 3], // 3
    [1, 2, 3, 2, 1], // 4
    [3, 2, 1, 2, 3], // 5
    [1, 1, 2, 1, 1], // 6
    [3, 3, 2, 3, 3], // 7
    [2, 3, 3, 3, 2], // 8
    [2, 1, 1, 1, 2], // 9
    [2, 1, 2, 1, 2], // 10
    [2, 3, 2, 3, 2], // 11
    [1, 2, 1, 2, 1], // 12
    [3, 2, 3, 2, 3], // 13
    [2, 2, 1, 2, 2], // 14
    [2, 2, 3, 2, 2], // 15
    [1, 2, 2, 2, 1], // 16
    [3, 2, 2, 2, 3], // 17
    [1, 2, 3, 3, 3], // 18
    [3, 2, 1, 1, 1], // 19
    [1, 3, 1, 3, 1], // 20
    [3, 1, 3, 1, 3], // 21
    [1, 3, 3, 3, 1], // 22
    [3, 1, 1, 1, 3], // 23
    [1, 1, 3, 1, 1], // 24
    [3, 3, 1, 3, 3], // 25
    [1, 3, 2, 1, 3], // 26
    [3, 1, 2, 3, 1], // 27
    [2, 1, 3, 2, 3], // 28
    [1, 3, 2, 3, 2], // 29
    [3, 2, 1, 1, 2], // 30
];

export class ReelsMap<T> {
    private map: Map<number, T> = new Map();

    constructor(initialData?: { [key: number]: T }) {
        if (initialData) {
            for (const key in initialData) {
                this.map.set(parseFloat(key), initialData[key]);
            }
        }
    }

    FindClosest(mrtp: number): [T, number] {
        let closestRtp = -1000;
        let closestVal: T | undefined;

        for (const [rtp, val] of this.map.entries()) {
            if (Math.abs(mrtp - rtp) < Math.abs(mrtp - closestRtp)) {
                closestRtp = rtp;
                closestVal = val;
            }
        }

        if (closestVal === undefined) {
             // Fallback or error handling
             const first = this.map.entries().next().value;
             return [first[1], first[0]];
        }

        return [closestVal, closestRtp];
    }
}

export class ScanPar {
    Sel: number = 1;
    Bet: number = 1;
    MRTP: number = 96;
}

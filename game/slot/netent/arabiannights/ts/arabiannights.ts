import {
    Slotx,
    Grid5x3,
    Wins,
    WinItem,
    SlotGeneric,
    BetLinesNetEnt5x3,
    HitxHelper
} from "./slot";
import {
    ReelsBon,
    ReelsMapData,
    LinePay,
    ScatPay,
    ScatFreespin
} from "./arabiannights_data";

const wild = 11;
const scat = 12;

export class Game extends Slotx implements SlotGeneric {
    // Mixin implementation for Grid5x3
    // Since TypeScript doesn't support multiple inheritance or traits easily for stateful classes,
    // we use composition or mixin pattern. Here I'll implement the Grid5x3 logic directly or delegate.
    // For simplicity and to match the Go struct embedding, I will extend Slotx and implement Grid5x3 methods.
    // But Grid5x3 has state (Grid). So I need to contain it.

    // However, the Go code embeds `slot.Grid5x3` struct.
    // In TS, I can't extend two classes.
    // I will use composition for Grid5x3 and proxy methods.

    private grid: Grid5x3 = new Grid5x3();

    constructor(sel: number) {
        super(sel, 1);
    }

    Clone(): SlotGeneric {
        const clone = new Game(this.Sel);
        clone.Bet = this.Bet;
        clone.Gain = this.Gain;
        clone.FSN = this.FSN;
        clone.FSR = this.FSR;
        // Deep copy grid
        clone.grid.Grid = this.grid.Grid.map(row => [...row]);
        return clone;
    }

    // Proxy methods for Grid5x3
    Dim() { return this.grid.Dim(); }
    At(x: number, y: number) { return this.grid.At(x, y); }
    LX(x: number, line: number[]) { return this.grid.LX(x, line); }
    SetSym(x: number, y: number, sym: number) { this.grid.SetSym(x, y, sym); }
    SetCol(x: number, reel: number[], pos: number) { this.grid.SetCol(x, reel, pos); }
    SpinReels(reels: number[][]) { this.grid.SpinReels(reels); }
    SymNum(sym: number) { return this.grid.SymNum(sym); }
    SymPos(sym: number) { return this.grid.SymPos(sym); }

    Scanner(wins: Wins): Error | null {
        this.ScanLined(wins);
        this.ScanScatters(wins);
        return null;
    }

    ScanLined(wins: Wins) {
        for (let li = 0; li < this.Sel; li++) {
            const line = BetLinesNetEnt5x3[li];
            let mw = 1; // mult wild
            let numw = 0;
            let numl = 5;
            let syml = 0;

            for (let x = 1; x <= 5; x++) {
                const sx = this.LX(x, line);
                if (sx === wild) {
                    if (syml === 0) {
                        numw = x;
                    }
                    mw = 2;
                } else if (syml === 0) {
                    syml = sx;
                } else if (sx !== syml) {
                    numl = x - 1;
                    break;
                }
            }

            let payw = 0;
            let payl = 0;

            if (numw >= 2) {
                payw = LinePay[wild - 1][numw - 1];
            }
            if (numl >= 2 && syml > 0) {
                // Check if line pay exists for this symbol (some might be empty or 0 if not defined properly)
                // In Go: LinePay[syml-1][numl-1]
                // Our LinePay has 12 elements. wild is 11, scat is 12 (empty).
                // Symbols 1-10 are regular.
                if (LinePay[syml - 1]) {
                     payl = LinePay[syml - 1][numl - 1];
                }
            }

            if (payl * mw > payw) {
                let mm = 1; // mult mode
                if (this.FSR > 0) {
                    mm = 3;
                }
                wins.push({
                    Pay: this.Bet * payl,
                    MP: mw * mm,
                    Sym: syml,
                    Num: numl,
                    LI: li + 1,
                    XY: HitxHelper.HitxL(line, numl),
                    FS: 0,
                    BID: 0,
                    JID: 0,
                    JR: 0
                });
            } else if (payw > 0) {
                let mm = 1; // mult mode
                if (this.FSR > 0) {
                    mm = 3;
                }
                wins.push({
                    Pay: this.Bet * payw,
                    MP: mm,
                    Sym: wild,
                    Num: numw,
                    LI: li + 1,
                    XY: HitxHelper.HitxL(line, numw),
                    FS: 0,
                    BID: 0,
                    JID: 0,
                    JR: 0
                });
            }
        }
    }

    ScanScatters(wins: Wins) {
        const count = this.SymNum(scat);
        if (count >= 2) {
            let mm = 1; // mult mode
            if (this.FSR > 0) {
                mm = 3;
            }
            const pay = ScatPay[count - 1];
            const fs = ScatFreespin[count - 1];

            wins.push({
                Pay: this.Bet * this.Sel * pay,
                MP: mm,
                Sym: scat,
                Num: count,
                XY: this.SymPos(scat),
                FS: fs,
                BID: 0,
                JID: 0,
                JR: 0
            });
        }
    }

    Spin(mrtp: number) {
        if (this.FSR === 0) {
            const [reels, _] = ReelsMapData.FindClosest(mrtp);
            this.SpinReels(reels);
        } else {
            this.SpinReels(ReelsBon);
        }
    }

    SetSel(sel: number): Error | null {
        return this.SetSelNum(sel, BetLinesNetEnt5x3.length);
    }
}

export function NewGame(sel: number): Game {
    return new Game(sel);
}

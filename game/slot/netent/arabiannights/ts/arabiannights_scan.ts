import {
    SlotGeneric,
    Reelx,
    Wins,
    ScanPar,
    SlotGame
} from "./slot";
import {
    Game,
    NewGame
} from "./arabiannights";
import {
    ReelsBon,
    ReelsMapData
} from "./arabiannights_data";

const scat = 12;

class StatCounter {
    N: number = 0;
    S: number[] = Array(20).fill(0); // MaxSymNum = 20
    FSC: number = 0;
    FHC: number = 0;
    BHC: number[] = Array(8).fill(0);
    JHC: number[] = Array(4).fill(0);

    Update(wins: Wins): number {
        let pay = 0;
        for (const wi of wins) {
            if (wi.Pay !== 0) {
                const p = wi.Pay * wi.MP;
                if (this.S[wi.Sym] === undefined) this.S[wi.Sym] = 0;
                this.S[wi.Sym] += p;
                pay += p;
            }
            if (wi.FS !== 0) {
                this.FSC += wi.FS;
                this.FHC++;
            }
            if (wi.BID !== 0) {
                this.BHC[wi.BID]++;
            }
            if (wi.JID !== 0) {
                this.JHC[wi.JID]++;
            }
        }
        this.N++;
        return pay;
    }
}

class StatGeneric extends StatCounter {
    Q: number = 0;
    EC: number = 0;

    Count(): number {
        return this.N;
    }

    RTPsym(cost: number, scatSym: number): [number, number] {
        let lrtp = 0;
        let srtp = 0;
        for (let sym = 0; sym < 20; sym++) {
            const val = this.S[sym] || 0;
            if (sym !== scatSym) {
                lrtp += val;
            } else {
                srtp += val;
            }
        }
        const N = this.Count();
        if (N === 0) return [0, 0];
        lrtp /= N * cost;
        srtp /= N * cost;
        return [lrtp, srtp];
    }

    FSQ(): [number, number] {
        const N = this.Count();
        if (N === 0) return [0, 0];
        const q = this.FSC / N; // Average free spins per spin? Go code: float64(s.FSC.Load()) / s.Count()
        // Wait, FSC is total free spins WON.
        // So q is expected number of free spins won per spin.
        // But `sq = 1/(1-q)` is only valid if q < 1.
        // In Bonus mode, we can win 15 spins. q will be > 1 possibly?
        // Ah, in Go code `sq = 1 / (1 - q)`.
        // If q >= 1, sq is negative or infinity.
        // This suggests `q` here is probability of retrigger?
        // But `s.FSC` accumulates `wi.FS`.
        // If `ScatFreespin` has 15. Then `wi.FS` is 15.
        // So `FSC` grows by 15.
        // So `q` is avg spins won.
        // If I win 15 spins with prob 0.01. `q` = 0.15. `sq` = 1.17.
        // This is approximation for "how many total spins including retriggers".
        // Total spins = Initial * sq.
        // It seems correct.
        const sq = 1 / (1 - q);
        return [q, sq];
    }

    FGF(): number {
        if (this.FHC === 0) return Infinity;
        return this.Count() / this.FHC;
    }
}

function ScanReelsCommon(
    sp: ScanPar,
    s: StatGeneric,
    g: SlotGeneric,
    reels: Reelx,
    calc: (s: StatGeneric) => number
): number {
    const totalSpins = 1000000; // Monte Carlo simulation iterations
    const wins: Wins = [];

    // Simple Monte Carlo
    for (let i = 0; i < totalSpins; i++) {
        wins.length = 0; // Reset wins
        // Determine RTP for spin if needed, usually passed in sp.MRTP
        g.Spin(sp.MRTP);
        if (g.Scanner(wins) !== null) {
            s.EC++;
            continue;
        }
        const pay = s.Update(wins);
        if (pay !== 0) {
            s.Q += pay * pay;
        }
    }

    return calc(s);
}

export function CalcStatBon(sp: ScanPar): number {
    const reels = ReelsBon;
    const g = NewGame(sp.Sel);
    g.FSR = 15; // set free spins mode
    const s = new StatGeneric();

    const calc = (s: StatGeneric): number => {
        const [lrtp, srtp] = s.RTPsym(g.Cost(), scat);
        const rtpsym = lrtp + srtp;
        const [q, sq] = s.FSQ();
        const rtp = sq * rtpsym;

        console.log(`symbols: ${(lrtp * 100).toFixed(5)}(lined) + ${(srtp * 100).toFixed(5)}(scatter) = ${(rtpsym * 100).toFixed(6)}%`);
        console.log(`free spins ${s.FSC}, q = ${q.toFixed(5)}, sq = 1/(1-q) = ${sq.toFixed(6)}`);
        console.log(`free games hit rate: 1/${s.FGF().toFixed(5)}`);
        console.log(`RTP = sq*rtp(sym) = ${sq.toFixed(5)}*${(rtpsym * 100).toFixed(5)} = ${(rtp * 100).toFixed(6)}%`);

        return rtp;
    };

    return ScanReelsCommon(sp, s, g, reels, calc);
}

export function CalcStatReg(sp: ScanPar): number {
    console.log(`*bonus reels calculations*`);
    // Note: We need to run CalcStatBon first to get rtpfs.
    // However, CalcStatBon runs a simulation.
    // In Go, CalcStatBon returns the result.
    const rtpfs = CalcStatBon(sp);

    console.log(`*regular reels calculations*`);
    const [reels, _] = ReelsMapData.FindClosest(sp.MRTP);
    const g = NewGame(sp.Sel);
    const s = new StatGeneric();

    const calc = (s: StatGeneric): number => {
        const [lrtp, srtp] = s.RTPsym(g.Cost(), scat);
        const rtpsym = lrtp + srtp;
        const [q, sq] = s.FSQ(); // q here is avg spins won in regular mode
        // In Go code: rtp = rtpsym + q * rtpfs
        const rtp = rtpsym + q * rtpfs;

        console.log(`symbols: ${(lrtp * 100).toFixed(5)}(lined) + ${(srtp * 100).toFixed(5)}(scatter) = ${(rtpsym * 100).toFixed(6)}%`);
        console.log(`free spins ${s.FSC}, q = ${q.toFixed(5)}, sq = 1/(1-q) = ${sq.toFixed(6)}`);
        console.log(`free games hit rate: 1/${s.FGF().toFixed(5)}`);
        console.log(`RTP = ${(rtpsym * 100).toFixed(5)}(sym) + ${(q).toFixed(5)}*${(rtpfs * 100).toFixed(5)}(fg) = ${(rtp * 100).toFixed(6)}%`);

        return rtp;
    };

    return ScanReelsCommon(sp, s, g, reels, calc);
}

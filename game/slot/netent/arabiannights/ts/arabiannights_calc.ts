import {
    LinePay,
    ScatPay,
    ScatFreespin
} from "./arabiannights_data";

const sx = 5;
const sy = 3;
const wild = 11;
const scat = 12;
const line_min = 2;
const scat_min = 2;
const mw = 2; // multiplier on wilds
const mfs = 3; // multiplier on free spins

// Helper for 1-based indexing if needed, or just standard TS
// We will use 0-based for arrays, but logic often uses 1-based counts.

export function Calculate(reels_reg: number[][], reels_bon: number[][]): number {
    if (reels_reg.length !== sx) throw new Error("unexpected number of regular reels");
    if (reels_bon.length !== sx) throw new Error("unexpected number of bonus reels");

    let reels: number[][];
    let N: number;
    let L: number[];
    let counts: { [key: number]: number[] };

    function precalculate_reels() {
        N = 1;
        L = [];
        for (let i = 0; i < reels.length; i++) {
            const r = reels[i];
            N = N * r.length;
            L[i] = r.length;
        }

        counts = {};
        // Initialize counts for all symbols in LinePay (1 to 12)
        for (let sym_id = 1; sym_id <= 12; sym_id++) {
            counts[sym_id] = Array(sx).fill(0);
        }

        for (let i = 0; i < reels.length; i++) {
            const r = reels[i];
            for (const sym of r) {
                counts[sym][i]++;
            }
        }
    }

    function calculate_line_ev(): number {
        let ev_sum = 0;
        const w = counts[wild];
        const wpays = LinePay[wild - 1]; // 0-based index

        for (let sym_id = 1; sym_id <= 12; sym_id++) {
            const pays = LinePay[sym_id - 1];
            if (sym_id !== wild && pays && pays.length > 0) {
                const s = counts[sym_id];
                const c: number[] = [];
                for (let i = 0; i < sx; i++) c[i] = s[i] + w[i];

                for (let n = line_min; n <= sx; n++) {
                    const payout = pays[n - 1];
                    if (payout > 0) {
                        // Total combinations
                        let combs_total = 1;
                        for (let i = 0; i < sx; i++) {
                            if (i < n) { // 0-based index < n (count n)
                                combs_total *= c[i];
                            } else if (i === n) { // break position
                                combs_total *= (L[i] - c[i]);
                            } else {
                                combs_total *= L[i];
                            }
                        }

                        // Combinations WITHOUT any wilds on reels (that form the win)
                        // Actually "on reels" means in the winning positions.
                        // The Lua code says:
                        /*
                        for i = 1, sx do
                            if i <= n then
                                combs_no_wild = combs_no_wild * s[i]
                            elseif i == n + 1 then
                                combs_no_wild = combs_no_wild * (L[i] - c[i])
                            else
                                combs_no_wild = combs_no_wild * L[i]
                            end
                        end
                        */
                        // Note Lua loops 1 to sx. i <= n means first n reels.
                        // My loop 0 to sx-1. i < n means first n reels.

                        let combs_no_wild = 1;
                        for (let i = 0; i < sx; i++) {
                            if (i < n) {
                                combs_no_wild *= s[i];
                            } else if (i === n) {
                                combs_no_wild *= (L[i] - c[i]);
                            } else {
                                combs_no_wild *= L[i];
                            }
                        }

                        let better_wilds = 0;
                        let wn_min: number | null = null;

                        // Check if a pure wild win would be better
                        for (let wn = line_min; wn <= n; wn++) {
                             // wpays[wn-1] is pay for wn wilds.
                             // payout*mw is pay for n symbols with wild.
                             if (wpays[wn - 1] >= payout * mw) {
                                 wn_min = wn;
                                 break;
                             }
                        }

                        if (wn_min !== null) {
                            let bw = 1;
                            for (let i = 0; i < sx; i++) {
                                if (i < wn_min) {
                                    bw *= w[i];
                                } else if (i < n) {
                                    bw *= c[i];
                                } else if (i === n) {
                                    bw *= (L[i] - c[i]);
                                } else {
                                    bw *= L[i];
                                }
                            }
                            better_wilds = bw;
                        }

                        const combs_with_wild = combs_total - combs_no_wild - better_wilds;
                        ev_sum += (combs_no_wild + combs_with_wild * mw) * payout;
                    }
                }
            }
        }

        // Calculating wilds as a separate symbol
        for (let n = line_min; n <= sx; n++) {
            const payout = wpays[n - 1];
            if (payout > 0) {
                // 1. Count all "clean heads" from wilds of length exactly n
                let wc = 1;
                for (let i = 0; i < sx; i++) {
                    if (i < n) {
                         wc *= w[i];
                    } else if (i === n) {
                         wc *= (L[i] - w[i]);
                    } else {
                         wc *= L[i];
                    }
                }

                // 2. Subtract the cases where this line of wilds is intercepted by the S symbol.
                // "intercepted by S symbol" means a symbol S extends the line beyond n,
                // and S pay * mw > wild pay.
                // In that case, it counts as S win, not Wild win.
                let losses = 0;
                if (n < sx) {
                    for (let sym_id = 1; sym_id <= 12; sym_id++) {
                        const pays = LinePay[sym_id - 1];
                        if (sym_id !== wild && pays && pays.length > 0) {
                            const s = counts[sym_id];
                            const c: number[] = [];
                            for (let i = 0; i < sx; i++) c[i] = s[i] + w[i];

                            for (let sn = n + 1; sn <= sx; sn++) {
                                if (pays[sn - 1] * mw > payout) {
                                    let loss = 1;
                                    for (let i = 0; i < sx; i++) {
                                        if (i < n) {
                                            loss *= w[i];
                                        } else if (i === n) {
                                            // Here is the critical part:
                                            // Lua: elseif i == n + 1 then loss = loss * s[i]
                                            // My loop i=n matches Lua n+1 because my i is 0-based index of reel.
                                            // Lua reel index 1..5. n is count.
                                            // If n=2, we look at reel 3. Lua index 3.
                                            // My loop i=2 is reel 3.
                                            // So i === n is correct.
                                            loss *= s[i];
                                        } else if (i < sn) {
                                            loss *= c[i];
                                        } else if (i === sn) {
                                            loss *= (L[i] - c[i]);
                                        } else {
                                            loss *= L[i];
                                        }
                                    }
                                    losses += loss;
                                }
                            }
                        }
                    }
                }
                ev_sum += (wc - losses) * payout;
            }
        }
        return ev_sum;
    }

    function calculate_scat_ev(): [number, number, number] {
        const c = counts[scat];
        let ev_sum = 0;
        let fs_sum = 0;
        let fs_num = 0;

        // reel_index is 0-based here (0 to 4)
        function find_scatter_combs(reel_index: number, scat_sum: number, current_comb: number) {
            if (reel_index >= sx) {
                if (scat_sum >= scat_min) {
                    // ScatPay is 0-based, so ScatPay[scat_sum - 1]
                    // But in Lua PAYTABLE_SCAT is [0, 2, 5, 20, 500] (for 1, 2, 3, 4, 5 scatters?)
                    // Lua PAYTABLE_SCAT = {0, 2, 5, 20, 500}. Index 1 is 0. Index 2 is 2.
                    // If scat_sum is 2, Lua accesses [2] -> 2.
                    // TS ScatPay [0, 2, 5, 20, 500]. ScatPay[2-1] = ScatPay[1] = 2.
                    // Correct.
                    if (ScatPay[scat_sum - 1] !== undefined) {
                        ev_sum += current_comb * ScatPay[scat_sum - 1];
                    }
                    if (ScatFreespin[scat_sum - 1] > 0) {
                        fs_sum += current_comb * ScatFreespin[scat_sum - 1];
                        fs_num += current_comb;
                    }
                }
                return;
            }

            // Step 1: having a scatter on this reel
            // sy is grid height (3).
            // c[reel_index] is count of scatters on this reel.
            // Lua: current_comb * c[reel_index] * sy
            // Wait, why * sy?
            // "having a scatter on this reel".
            // If the scatter pays anywhere on the reel, and the reel has `c` scatters.
            // The total positions on reel is L.
            // Probability is c/L.
            // But we are counting combinations.
            // There are L ways to stop the reel.
            // c positions have scatter.
            // Wait, "Step 1: having a scatter on this reel".
            // In Lua code: `current_comb * c[reel_index] * sy`.
            // Why sy?
            // "PAYTABLE FOR SCATTER WINS (for 1 selected line bet)" in Lua comments.
            // But scatter wins are usually total bet multiplier.
            // Here `ScatPay` values: 2, 5, 20, 500.
            // In `arabiannights_rule.go`: `Pay: g.Bet * float64(g.Sel) * pay`.
            // So it pays multiplied by total bet (Bet * Sel).
            // Lua calc returns `ev_sum`.
            // `rtp_scat = ev_sum / N`.
            // If `ev_sum` is total payout sum.
            // If we have 1 scatter on reel 1, does it count as 1 combination?
            // Reel 1 has `c` scatters.
            // `sy` is visible window height.
            // Usually Scatters pay if they appear ANYWHERE in the window.
            // If the reel stops such that a scatter is in the window.
            // Number of stops where at least one scatter is in window.
            // If scatters are sparse, it is approx `c * sy`.
            // (Assuming no stacked scatters and `c` is small).
            // Lua code assumes `c * sy` stops have a scatter.
            // And `L - c * sy` stops have NO scatter.
            // This is an approximation or assumes specific reel layout.
            // `counts[scat]` stores number of scatters on the reel strip.
            // Since `sy=3`, if we hit a scatter, it is visible for 3 positions (usually).
            // So `c * 3` is the number of "hit positions".
            // This assumes no overlap (scatters not adjacent).
            // Looking at reel data: `12` is scatter.
            // Reel 1: 12 appears once.
            // Reel 2: 12 appears once.
            // Reel 3: 12 appears once.
            // Reel 4: 12 appears once.
            // Reel 5: 12 appears once.
            // So scatters are unique on each reel.
            // So `c[i]` is 1.
            // `c[i] * sy` is 3. Correct.

            find_scatter_combs(reel_index + 1, scat_sum + 1, current_comb * c[reel_index] * sy);

            // Step 2: NOT having a scatter
            find_scatter_combs(reel_index + 1, scat_sum, current_comb * (L[reel_index] - c[reel_index] * sy));
        }

        find_scatter_combs(0, 0, 1);
        return [ev_sum, fs_sum, fs_num];
    }

    // Execute calculation for Bonus Reels
    reels = reels_bon;
    precalculate_reels();
    const rtp_line_bon = calculate_line_ev() / N;
    const [ev_sum_bon, fs_sum_bon, fs_num_bon] = calculate_scat_ev();
    const rtp_scat_bon = ev_sum_bon / N;
    const rtp_sym_bon = rtp_line_bon + rtp_scat_bon;

    const q = fs_sum_bon / N;
    const sq = 1 / (1 - q);
    const rtp_fs = mfs * sq * rtp_sym_bon;

    console.log(`*bonus reels calculations*`);
    console.log(`reels lengths [${L.join(", ")}], total reshuffles ${N}`);
    console.log(`symbols: ${(rtp_line_bon * 100).toFixed(5)}(lined) + ${(rtp_scat_bon * 100).toFixed(5)}(scatter) = ${(rtp_sym_bon * 100).toFixed(6)}%`);
    console.log(`free spins ${fs_sum_bon}, q = ${q.toFixed(5)}, sq = 1/(1-q) = ${sq.toFixed(6)}`);
    console.log(`free games hit rate: 1/${(N / fs_num_bon).toFixed(5)}`);
    console.log(`RTP = ${mfs}*sq*rtp(sym) = ${mfs}*${sq.toFixed(5)}*${(rtp_sym_bon * 100).toFixed(5)} = ${(rtp_fs * 100).toFixed(6)}%`);

    // Execute calculation for Regular Reels
    reels = reels_reg;
    precalculate_reels();
    const rtp_line_reg = calculate_line_ev() / N;
    const [ev_sum_reg, fs_sum_reg, fs_num_reg] = calculate_scat_ev();
    const rtp_scat_reg = ev_sum_reg / N;
    const rtp_sym_reg = rtp_line_reg + rtp_scat_reg;

    // For regular reels, q is the probability of hitting free spins (from scatters).
    // The "sq" logic usually applies if free spins can retrigger.
    // In this game, free spins retrigger inside free spins (bonus mode).
    // From regular mode, we hit free spins.
    // `rtp_total = rtp_sym + q * rtp_fs`.
    // Here `q` is prob of hitting FS in regular mode.
    // `rtp_fs` is the EXPECTED RETURN of the Free Spins session (which accounts for retriggers).
    // `rtp_fs` calculated above is the RTP (percentage) of the FS session relative to the bet.
    // Wait. `rtp_fs` above is `mfs * sq * rtp_sym_bon`.
    // This is the expected payout of a single free spin (including retriggers) relative to base bet?
    // No. `rtp_sym_bon` is the average payout of one spin in bonus mode.
    // `sq` is the multiplier for retriggers (total spins per initial spin).
    // `mfs` is multiplier.
    // So `rtp_fs` is the total expected payout of "one free spin event" divided by 1?
    // No. `rtp_fs` in the code is:
    // `rtp_fs = mfs * sq * rtp_sym`
    // If I pay 1 unit. `rtp_sym` is returned on avg.
    // In FS, I get `mfs * rtp_sym` per spin.
    // I get `sq` spins on average per "spin opportunity" in FS?
    // No. `q` is chance of retrigger.
    // `sq = 1/(1-q)` is expected number of spins if I have 1 spin and it can retrigger with prob q.
    // But FS gives 15 spins.
    // The formula in Lua:
    // `rtp_fs = mfs * sq * rtp_sym`
    // This looks like the RTP of the "Bonus Feature" itself, IF we were in it forever?
    // No.
    // `rtp_total = rtp_sym + q * rtp_fs`
    // `q` here is `fs_sum / N`. `fs_sum` is total free spins won in all combinations.
    // `fs_sum / N` is expected number of free spins won in 1 regular spin.
    // Let E_fs be expected number of FS won in regular spin.
    // Total RTP = BaseRTP + E_fs * (AvgPayPerFreeSpin)
    // AvgPayPerFreeSpin = mfs * rtp_sym_bon * sq (if sq handles retriggers)
    // Wait, `sq = 1/(1-q_bon)`.
    // If we start with 15 spins.
    // Total spins = 15 * sq.
    // Total pay = 15 * sq * mfs * rtp_sym_bon * Bet.
    // But `rtp_fs` in Lua is calculated as `mfs * sq * rtp_sym`.
    // And `q` in regular calculation is `fs_sum / N`.
    // `fs_sum` is weighted sum of free spins.
    // ScatFreespin is {0, 0, 15, 15, 15}.
    // So `q` (regular) = E[spins won].
    // If I win 15 spins.
    // `q` contributes 15 * Prob.
    // So `q * rtp_fs` = (15 * Prob) * (mfs * sq * rtp_sym_bon).
    // Is `rtp_fs` the value of ONE free spin?
    // `rtp_sym_bon` is value of one spin.
    // `mfs` is mult.
    // `sq` is retrigger factor for ONE spin.
    // Yes. If every free spin has probability `q_bon` of adding `ScatFreespin` spins...
    // Wait. `q_bon` in Lua is `fs_sum / N`.
    // This is expected number of ADDED spins per one bonus spin.
    // `sq = 1/(1-q_bon)`.
    // This formula `TotalSpins = InitialSpins * sq` is valid if `q_bon < 1`.
    // So `rtp_fs` represents the expected value of "One Free Spin (and its descendants)" relative to Bet.
    // So `rtp_total = rtp_sym_reg + E[initial_spins] * ValueOfOneFreeSpin`.
    // `q_reg` = E[initial_spins].
    // `rtp_fs` = ValueOfOneFreeSpin.
    // Formula matches.

    const q_reg = fs_sum_reg / N;
    const sq_reg = 1 / (1 - q_reg); // Not used for total calculation, just for display maybe?

    // rtp_fs (from bonus calculation) is used here.
    const rtp_total = rtp_sym_reg + q_reg * rtp_fs;

    console.log(`*regular reels calculations*`);
    console.log(`reels lengths [${L.join(", ")}], total reshuffles ${N}`);
    console.log(`symbols: ${(rtp_line_reg * 100).toFixed(5)}(lined) + ${(rtp_scat_reg * 100).toFixed(5)}(scatter) = ${(rtp_sym_reg * 100).toFixed(6)}%`);
    console.log(`free spins ${fs_sum_reg}, q = ${q_reg.toFixed(5)}, sq = 1/(1-q) = ${sq_reg.toFixed(6)}`);
    console.log(`free games hit rate: 1/${(N / fs_num_reg).toFixed(5)}`);
    console.log(`RTP = ${(rtp_sym_reg * 100).toFixed(5)}(sym) + ${(q_reg).toFixed(5)}*${(rtp_fs * 100).toFixed(5)}(fg) = ${(rtp_total * 100).toFixed(6)}%`);

    return rtp_total;
}

# Demo script

[← Back to README](../README.md)

A 10-minute walkthrough for presenting Conviction AI to investors, product leaders or a hiring panel. Times are cumulative. Works in live mode (`make run`) and, except step 8, in the offline file.

**Before you start:** click **Reset demo** (bottom left), select **Fund II · Growth** and **Growth VC**, and close other tabs.

## 0:00 · The problem (30 seconds, no clicking)

> "Over 80% of US venture dollars this year went to AI. Investment teams are drowning in decks that all claim the same things. AI tools make the research faster, but faster isn't the issue. A deck that says 124% net retention produces a confident memo that says 124%. Conviction AI is built to do the opposite: check the story against the data and make the gaps impossible to miss."

## 0:30 · Overview

Point at **What changed this week**: a contradiction (HelioOps NRR), a capital signal, a ranking shift, a PE diligence flag. Then **Diligence exceptions: 3**. One sentence: *"This is Monday morning for a partner: what changed, and what needs a decision."*

## 1:00 · Opportunity Radar: where is the market going?

1. Show the six segments ranked by the inflection index. Click a segment to show the index weights: adoption counts most, funding only 15%.
2. Under **Mega-rounds**, click **Exclude top 5**.
3. Physical Operations AI moves to #1, ahead of Agent Security.

> "A lot of the apparent momentum was five giant rounds. Take them out and the underpenetrated segment, with real adoption, comes out on top. That's where our fund wants to look."

## 2:30 · Fund Thesis and Pipeline: which companies could win?

1. **Fund Thesis**: the mandate is rules, not a slide. Sector, stage, check size, minimum growth and NRR, maximum concentration, minimum runway.
2. **Deal Pipeline**: move Tracewell forward one stage. In live mode the toast says *saved to Postgres*. *"Every stage change is a person's decision, with an audit trail, as in Salesforce."*

## 4:00 · Company 360: is the story true? (the signature moment)

1. Open **Company 360** (HelioOps). Click **Load synthetic HelioOps data room**.
2. Sixteen customer rows load. The red banner appears: **124% claimed, 113.0% recomputed, +11.0 pp**.
3. Click **Inspect evidence chain**: the formula, the opening cohort of $3.0M, and the rows it came from.

> "The deck isn't lying, exactly. It probably counted new-logo revenue. But that's an 11-point difference in the metric that drives the valuation. The system keeps both numbers, shows its working, and doesn't let either overwrite the other. A person has to resolve it."

4. Optional: on **Cohort data**, upload any CSV with `customer,opening_arr,ending_arr` and watch NRR recompute.

## 6:00 · Decision & IC Memo: should we invest?

1. The recommendation is **Advance with conditions**, with the NRR blocker listed. *"It's a rule-based category, not a prediction. Score and evidence coverage are shown separately."*
2. Click **Make the bear case**: the strongest arguments against, each turned into a diligence task.
3. Click **Prepare IC memo**: a sourced draft for a reviewer to approve. The conditions are in the first paragraph.

## 7:30 · PE mode: same discipline, different question

1. Switch the top toggle to **PE Buyout**. Crestline Field Systems replaces HelioOps.
2. Open **Underwriting** (LBO-lite). Leave the EBITDA adjustments unticked and price the deal on **Seller-adjusted $11.0M**.
3. Point at the warning: *paying 9x on seller-adjusted EBITDA while accepting only $9.4M cuts IRR from 15.9% to 9.9% and pushes leverage to 4.68x against a 4.0x cap.*

> "For PE the question is whether the cash flow is real. The tool shows how much of the return rests on numbers nobody has verified."

## 8:30 · A real company (live mode)

1. Switch back to **Growth VC**, open **Company 360**, choose **ClearOps · researched**.
2. Real Munich company, €8.6M Series A in May 2026. Every fact links to its source. Six critical metrics are *Missing*; three facts are *Disputed* because sources disagree.
3. Coverage 30% → **More diligence**. Click **Copy data-room request**.

> "This is what honest AI research looks like: it tells you what it couldn't find, and turns that into the first email to the founder."

## 9:30 · Optional: research a company live (needs an API key)

1. In Company 360, click **✦ Research a company**. Ask the audience for a recently funded startup, or use one you've tried before.
2. Type the name and a hint (city or sector), click **Start research**. Talk over the agent log as searches appear.
3. When it finishes, click **Open in Company 360**: sourced facts, *Missing* financials, *More diligence*.

> "Same rules as the hand-built pack: if the agent cites a page it didn't actually find, or puts a number on a private metric, the validator sends it back."

Live research depends on Wi-Fi and the web, and takes 1–3 minutes. If it's slow, switch to ClearOps and come back.

## 10:30 · Close

> "Four questions in one workflow: where is the market going, which companies could win, is the story true, and should we invest. The model never does the math, conflicts are kept, unknowns stay unknown, and people make the calls. Under the hood it's Postgres shaped like Salesforce, so it fits how investment teams already work."

## Serent version (10 minutes)

For a growth-equity sponsor such as Serent Capital: Opening (sponsor framing) → Radar with **Exclude top 5** → HelioOps NRR (Company 360) → PE mode LBO-lite → **ParentSquare** in Company 360 → **Add-on Screener** → **Exit Readiness** → close. Needs live mode (`make db`, `make run`) for ParentSquare in Company 360; the two value-creation screens also work offline.

1. **Company 360 → ParentSquare · researched.** Serent's 2021 growth investment; amount shows **Undisclosed**; 8 private metrics Missing; the 99.4% figure is district (logo) retention, not revenue retention; HQ is Disputed (Goleta vs Santa Barbara).
2. **Add-on Screener.** Onflo 75, Edlio 66, Apptegy 62, Bloomz 57, SchoolStatus 40. Expand Onflo: inbound service desk + ParentSquare's outbound messaging. Drag **Availability** right: Bloomz passes Apptegy. KEV Group is a comparable exit, not a target.
3. **Exit Readiness.** 17% on public evidence; Serent's hold 5.2 years vs KEV Group's 6.5; the timing callout is labelled Inferred. **Copy sale-prep plan**: ARR ledger, sell-side QoE, monthly P&L, customer-level ARR first.

> "Diligence that recomputes what it can and flags what it can't, a buy-and-build screen whose reasoning you can argue with, and an exit checklist built from evidence. Where would you push on it?"

## Likely questions

| Question | Short answer |
| --- | --- |
| Is the data real? | Demo companies are fictional; ClearOps is real and sourced. |
| Where's the LLM? | Kept out of the math on purpose. This version's Ask box and bear case are rule-based and cite records; an LLM analyst is next, behind an interface, with this as the fallback. |
| Why not just use Salesforce? | The schema mirrors it, so it can sync later. Salesforce stores deals; it doesn't recompute NRR or score market inflection. |
| How would you add a company? | Research it into a pack and import it. See [COMPANY_PACKS.md](COMPANY_PACKS.md). |
| How do you know the math is right? | 38 automated tests, plus the same engine in Python and JavaScript held to the same answers. |

[← Back to README](../README.md)

# EAE POC Agent Tools

Endpoint: Supabase Edge Function `poc-agent-api`.

Authentication: server-side `x-poc-admin` matching `POC_QUERY_ADMIN_KEY`. Do not call this endpoint directly from the public browser.

Every result is evidence-aware. The agent must preserve source timestamps and warnings.

| Tool | Input | Purpose |
| --- | --- | --- |
| `get_dealer_xray` | `dealerNum` | Dealer observations, movement, buyer/seller load history, ownership |
| `find_vehicle_supply` | make/model/year/dealerNum/limit | Latest ingested VIN observations matching filters |
| `get_vin_history` | `vin` | VIN observations, movement, load units, invoice economics |
| `get_dealer_movements` | dealerNum, direction | Dealer movement observations |
| `find_historical_deals` | dealerNum/status/limit | Historical POC load/deal evidence |
| `get_buyer_dna` | `dealerNum` | Measured buyer-side historical participation |
| `get_seller_dna` | `dealerNum` | Measured seller-side historical participation |
| `get_load_economics` | `loadNumber` | Load/unit invoice economics; explicitly not automatic gross |
| `get_freight_context` | loadNumber/dealerNum | Freight observations |
| `get_source_evidence` | recordType/sourceFile/sourceKey | Immutable raw-record evidence |
| `explain_dealer_conflicts` | `dealerNum` | Preserve conflicting dealer identity/assignment observations |
| `rank_dealer_activity` | `dealerNums[]` | Transparent activity priority among caller-supplied dealers |

## Agent interpretation rules
1. State whether the answer is CURRENT OBSERVATION, HISTORICAL STRUCTURED DATA, DERIVED STATUS, INFERENCE or UNKNOWN.
2. Never promote snapshot evidence to live/current without a fresh authorized observation.
3. Never turn VIN movement into a sale conclusion.
4. Keep ownership inference method/confidence visible.
5. Keep dealer measured behavior separate from stated preference.
6. Do not leak contacts, internal economics, raw POC records or rep activity into public/browser outputs.
7. For `rank_dealer_activity`, state the disclosed formula; it ranks evidence activity only and does not infer intent.
8. When evidence conflicts, surface the conflict instead of silently choosing the newest value.

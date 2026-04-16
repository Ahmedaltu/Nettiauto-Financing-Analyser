# 🔍 Auto Deal Scanner

> Näe auton rahoituksen todellinen kokonaishinta suoraan Nettiauto-sivulla.  
> See the real total cost of car financing directly on Nettiauto listings.

---

## What it does

Finnish car dealers advertise low monthly payments — but hide the real total cost inside fees, long terms, and balloon payments. Auto Deal Scanner injects a panel directly onto every Nettiauto listing showing:

- **Total paid** (all-in: price + interest + fees + balloon)
- **Total interest + fees** — what you pay on top of the car price
- **Real monthly payment** including all fees
- **Effective APR** (todellinen vuosikorko) — calculated via Newton-Raphson
- **Deal verdict**: Erinomainen / Hyvä / Kohtalainen / Kallis

On search results pages, every listing card gets a mini badge showing the estimated total cost.

---

## Install

### From Chrome Web Store
*(coming soon)*

### Load manually (developer mode)
1. Clone or download this repo
2. Open Chrome → `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked**
5. Select the `auto-deal-scanner` folder
6. Browse to any Nettiauto listing — the panel appears automatically

---

## How it works

The extension is 100% local — it reads what your browser already downloaded from Nettiauto. No data is sent anywhere. No server. No scraping.

```
Nettiauto loads in Chrome
        ↓
Extension reads the DOM (price, rate, term, fees)
        ↓
Calculates total cost + APR in <1ms
        ↓
Injects panel onto the page
```

---

## Deal verdicts

| Verdict | Meaning |
|---|---|
| ✅ Erinomainen | Overpay < 8% of car price |
| 🔵 Hyvä | Overpay 8–15% |
| 🟡 Kohtalainen | Overpay 15–25% |
| 🔴 Kallis | Overpay > 25% |

---

## Notes

- If the interest rate isn't shown on the listing, the calculator defaults to **4%** and shows a warning
- Nettiauto sometimes loads financing details asynchronously — the extension waits up to 5 seconds for the data
- The extension does **not** collect any data, require login, or make any network requests

---

## Stack

- Vanilla JS (no frameworks, no dependencies)
- Chrome Extension Manifest V3
- CSS injected into Nettiauto pages

---

## Roadmap

- [ ] Compare mode — save multiple listings and compare side by side
- [ ] Firefox support
- [ ] Export comparison to PDF

---

## Legal

Reading a public webpage's DOM in your own browser is legal. This extension makes no automated requests to Nettiauto's servers.

---

## License

MIT
